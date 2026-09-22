import { DecisionEngine } from '../engine/decision-engine';
import { OpenJevClient, OpenJevError } from '../engine/openjev-client';
import { PlanCache, type KeyValueStore } from '../engine/plan-cache';
import type { DecideResponse, Request, TestOpenJevResponse } from '../shared/messages';
import { isHostDisabled, loadSettings } from '../shared/settings';
import type { Settings, TabStatus } from '../shared/types';

const localStore: KeyValueStore = {
  async get(key) {
    const r = await chrome.storage.local.get(key);
    return r[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

const cache = new PlanCache(localStore);
const engine = new DecisionEngine({
  cache,
  clientFor: (s: Settings) => (s.openjev.enabled ? new OpenJevClient({ endpoint: s.openjev.endpoint, token: s.openjev.token, timeoutMs: 2500 }) : null),
  log: (m) => console.debug('[cookiejev]', m),
  onOpenJevError: (error) => {
    void chrome.storage.session.set({ 'openjev:lastError': error }).catch(() => undefined);
  },
});

/** Per-tab status; service worker may be restarted, so also mirrored to session storage. */
const tabStatus = new Map<number, TabStatus>();

async function setStatus(tabId: number, status: TabStatus, settings: Settings): Promise<void> {
  tabStatus.set(tabId, status);
  try {
    await chrome.storage.session.set({ [`tab:${tabId}`]: status });
  } catch {
    /* session storage unavailable */
  }
  await updateBadge(tabId, status, settings);
}

async function getStatus(tabId: number): Promise<TabStatus> {
  const inMem = tabStatus.get(tabId);
  if (inMem) return inMem;
  try {
    const r = await chrome.storage.session.get(`tab:${tabId}`);
    const s = r[`tab:${tabId}`] as TabStatus | undefined;
    if (s) return s;
  } catch {
    /* ignore */
  }
  return { state: 'idle' };
}

async function updateBadge(tabId: number, status: TabStatus, settings: Settings): Promise<void> {
  let text = '';
  let color = '#5c3a1e';
  if (settings.showBadge) {
    switch (status.state) {
      case 'handled':
        text = '✓';
        color = '#2e7d32';
        break;
      case 'failed':
        text = '!';
        color = '#c62828';
        break;
      case 'disabled-host':
        text = '–';
        color = '#757575';
        break;
      default:
        text = '';
    }
  }
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) await chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch {
    /* tab gone */
  }
}

async function handleDecide(hostname: string, snapshot: Parameters<DecisionEngine['decide']>[0]['snapshot'], tabId: number | undefined): Promise<DecideResponse> {
  const settings = await loadSettings();
  if (!settings.enabled) return { ok: true, plan: null, planKey: '', reason: 'disabled' };
  if (isHostDisabled(hostname, settings.disabledHosts)) {
    if (tabId !== undefined) await setStatus(tabId, { state: 'disabled-host' }, settings);
    return { ok: true, plan: null, planKey: '', reason: 'disabled' };
  }
  const exclude = new Set(snapshot.elements.filter((e) => e.disabled).map((e) => e.key));
  const out = await engine.decide({ hostname, snapshot, settings, exclude });
  if (tabId !== undefined) {
    // Diagnostics for the popup/survey: what the engine saw and decided (session-only, per tab).
    const debug = {
      hostname,
      cmpHint: snapshot.cmpHint,
      round: snapshot.round,
      lang: snapshot.lang,
      dialogText: snapshot.dialogText.slice(0, 300),
      elements: snapshot.elements.map((e) => `${e.key}:${e.kind}${e.checked === undefined ? '' : e.checked ? '[x]' : '[ ]'}${e.disabled ? '(dis)' : ''} "${e.text || e.ariaLabel}"${e.id ? ' #' + e.id : ''}`),
      reason: out.reason,
      plan: out.plan ? out.plan.steps : null,
    };
    await chrome.storage.session.set({ [`debug:${tabId}`]: debug }).catch(() => undefined);
  }
  if (out.plan) return { ok: true, plan: out.plan, planKey: out.planKey };
  return { ok: true, plan: null, planKey: out.planKey, reason: out.reason };
}

async function testOpenJev(endpoint: string, token: string): Promise<TestOpenJevResponse> {
  try {
    const client = new OpenJevClient({ endpoint, token, timeoutMs: 5000 });
    const v = await client.version();
    return { ok: true, model: v.model };
  } catch (err) {
    const e = err instanceof OpenJevError ? err : new OpenJevError('network', String(err));
    return { ok: false, error: `${e.kind}: ${e.message}` };
  }
}

async function rerun(tabId: number): Promise<{ ok: boolean }> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'rerun' });
    return { ok: true };
  } catch {
    // Content script may not be injected (page loaded before install) — inject and let it run.
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content/index.js'] });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  (async () => {
    switch (msg.type) {
      case 'is-host-enabled': {
        const s = await loadSettings();
        const enabled = s.enabled && !isHostDisabled(msg.hostname, s.disabledHosts);
        if (!enabled && tabId !== undefined && s.enabled) await setStatus(tabId, { state: 'disabled-host' }, s);
        return enabled;
      }
      case 'decide':
        return handleDecide(msg.hostname, msg.snapshot, tabId);
      case 'frame-hello': {
        if (tabId === undefined) return { ok: true };
        const key = `frames:${tabId}`;
        const r = await chrome.storage.session.get(key).catch(() => ({}) as Record<string, unknown>);
        const list = Array.isArray(r[key]) ? (r[key] as unknown[]) : [];
        list.push({ hostname: msg.hostname, protocol: msg.protocol, href: msg.href, top: msg.top, t: Date.now() });
        await chrome.storage.session.set({ [key]: list.slice(-30) }).catch(() => undefined);
        return { ok: true };
      }
      case 'report': {
        const s = await loadSettings();
        if (tabId !== undefined) {
          // A sub-frame saying "not-consent" must not overwrite a real result from another frame.
          const prev = await getStatus(tabId);
          if (!(prev.state !== 'idle' && msg.status.state === 'not-consent')) await setStatus(tabId, msg.status, s);
        }
        if (msg.status.state === 'failed' && msg.planKey) await engine.invalidate(msg.planKey);
        return { ok: true };
      }
      case 'get-tab-status':
        return getStatus(msg.tabId);
      case 'rerun':
        return rerun(msg.tabId);
      case 'test-openjev':
        return testOpenJev(msg.endpoint, msg.token);
      case 'clear-cache':
        await cache.clear();
        return { ok: true };
      default:
        return { ok: false, error: 'unknown message' };
    }
  })()
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    tabStatus.delete(tabId);
    void chrome.storage.session.remove([`tab:${tabId}`, `debug:${tabId}`, `frames:${tabId}`]).catch(() => undefined);
    void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatus.delete(tabId);
  void chrome.storage.session.remove(`tab:${tabId}`).catch(() => undefined);
});
