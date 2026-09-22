import type { DecideResponse } from '../shared/messages';
import { sendToBackground } from '../shared/messages';
import type { TabStatus } from '../shared/types';
import { findCandidates } from './detector';
import { hostElement, isElementVisible } from './dom-utils';
import { executePlan, sleep } from './executor';
import { buildSnapshot } from './snapshot';

declare global {
  interface Window {
    __cookiejevLoaded?: boolean;
  }
}

const MAX_ROUNDS = 3;
const OBSERVE_WINDOW_MS = 20_000;
const DEBOUNCE_MS = 300;
const SETTLE_MS = 800;

interface PageState {
  busy: boolean;
  done: boolean;
  clicked: Set<string>;
  rounds: number;
  attempts: number;
}

function log(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.debug('[cookiejev]', ...args);
}

async function report(status: TabStatus, planKey?: string): Promise<void> {
  try {
    await sendToBackground({ type: 'report', hostname: location.hostname, status, ...(planKey ? { planKey } : {}) });
  } catch {
    /* extension context gone */
  }
}

async function handleDialog(state: PageState): Promise<boolean> {
  const candidates = findCandidates();
  if (candidates.length === 0) return false;
  const cand = candidates[0]!;
  const host = hostElement(cand.root);
  state.rounds = 0;
  const clickedThisDialog = new Set<string>();
  let lastPlanKey: string | undefined;
  let lastSource: TabStatus | null = null;

  while (state.rounds < MAX_ROUNDS) {
    state.rounds++;
    const { snapshot, map } = buildSnapshot(cand.root, cand.cmpHint, state.rounds);
    if (snapshot.elements.length === 0) break;
    // Element keys are per snapshot; exclude by label so earlier clicks are remembered across rounds.
    const excludeKeys = snapshot.elements.filter((e) => clickedThisDialog.has(`${e.kind}|${e.text}|${e.id}`)).map((e) => e.key);
    // Encode exclusions into the snapshot by marking those elements disabled.
    for (const e of snapshot.elements) if (excludeKeys.includes(e.key)) e.disabled = true;

    let res: DecideResponse;
    try {
      res = await sendToBackground<DecideResponse>({ type: 'decide', hostname: location.hostname, snapshot });
    } catch (err) {
      log('decide failed', err);
      return false;
    }
    if (!res.ok) {
      await report({ state: 'failed', reason: res.error });
      return true;
    }
    lastPlanKey = res.planKey;
    if (!res.plan) {
      if (res.reason === 'not-consent') {
        await report({ state: 'not-consent' });
        return false;
      }
      if (res.reason === 'disabled') return true;
      log('no plan:', res.reason);
      await report({ state: 'failed', reason: res.reason });
      return true;
    }
    const plan = res.plan;
    log('plan', plan);
    const exec = await executePlan(plan, map);
    for (const k of [...exec.clicked, ...exec.toggled]) {
      const e = snapshot.elements.find((x) => x.key === k);
      if (e) clickedThisDialog.add(`${e.kind}|${e.text}|${e.id}`);
    }
    lastSource = { state: 'handled', source: plan.source, confidence: plan.confidence, rounds: state.rounds, reason: plan.reason };

    await sleep(SETTLE_MS);
    const stillVisible = host.isConnected && isElementVisible(host);
    if (!stillVisible) {
      // Some CMPs replace the banner with a preference dialog in a new container.
      const next = findCandidates();
      if (next.length > 0 && plan.expectMoreRounds && state.rounds < MAX_ROUNDS) {
        cand.root = next[0]!.root;
        cand.cmpHint = next[0]!.cmpHint;
        continue;
      }
      await report(lastSource);
      return true;
    }
    if (exec.clicked.length === 0 && exec.toggled.length === 0) break;
    // Still visible: either a settings pane opened inside the same container, or the click did nothing.
  }

  const finalVisible = host.isConnected && isElementVisible(host);
  if (finalVisible) {
    await report({ state: 'failed', reason: 'dialog still visible after plan' }, lastPlanKey);
  } else if (lastSource) {
    await report(lastSource);
  }
  return true;
}

function main(): void {
  if (window.__cookiejevLoaded) return;
  window.__cookiejevLoaded = true;
  if (!location.protocol.startsWith('http')) return;

  const state: PageState = { busy: false, done: false, clicked: new Set(), rounds: 0, attempts: 0 };
  let timer: number | undefined;
  let observer: MutationObserver | null = null;
  const startedAt = Date.now();

  const run = async () => {
    if (state.busy || state.done) return;
    state.busy = true;
    try {
      state.attempts++;
      const acted = await handleDialog(state);
      if (acted) {
        state.done = true;
        observer?.disconnect();
      }
    } catch (err) {
      log('error', err);
    } finally {
      state.busy = false;
    }
  };

  const schedule = () => {
    if (state.done) return;
    if (Date.now() - startedAt > OBSERVE_WINDOW_MS) {
      observer?.disconnect();
      return;
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(run, DEBOUNCE_MS);
  };

  chrome.runtime.onMessage.addListener((msg: { type?: string }, _sender, sendResponse) => {
    if (msg?.type === 'rerun') {
      state.done = false;
      state.busy = false;
      void run().then(() => sendResponse({ ok: true }));
      return true;
    }
    return false;
  });

  void (async () => {
    let enabled = true;
    try {
      enabled = await sendToBackground<boolean>({ type: 'is-host-enabled', hostname: location.hostname });
    } catch {
      enabled = false;
    }
    if (!enabled) {
      state.done = true;
      return;
    }
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'open'] });
    void run();
    // Late banners without DOM mutations we catch (e.g. CSS transitions).
    window.setTimeout(schedule, 1500);
    window.setTimeout(schedule, 5000);
  })();
}

main();
