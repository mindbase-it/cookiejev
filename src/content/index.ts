import type { DecideResponse } from '../shared/messages';
import { sendToBackground } from '../shared/messages';
import type { TabStatus } from '../shared/types';
import { scoreAgainst } from '../engine/heuristics';
import { ACCEPT_PHRASES, CONFIRM_PHRASES, normalize } from '../shared/keywords';
import { type Candidate, findCandidates } from './detector';
import { hostElement, isElementVisible } from './dom-utils';
import { dispatchClick, executePlan, sleep } from './executor';
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
  /** A consent "teaser" (strip without controls, e.g. Seznam's szn-cwl) was clicked to open the real dialog. */
  teaserClicked: boolean;
}

/** First rendered element inside the candidate (skipping <style>), or the host itself. */
function teaserTarget(cand: Candidate): Element {
  const root = cand.root;
  if (root instanceof ShadowRoot) {
    const first = Array.from(root.children).find((c) => !['STYLE', 'SCRIPT', 'TEMPLATE', 'LINK'].includes(c.tagName));
    return first ?? root.host;
  }
  return root;
}

/**
 * Consent teaser: a candidate with consent wording but no controls that reacts to a click by opening
 * the real dialog (Seznam's consent wall does exactly this). Known via CMP rule or a pointer cursor.
 */
function isTeaser(cand: Candidate): boolean {
  if (cand.cmpHint === 'seznam') return true;
  const target = teaserTarget(cand);
  const host = hostElement(cand.root);
  try {
    return getComputedStyle(target).cursor === 'pointer' || getComputedStyle(host).cursor === 'pointer';
  } catch {
    return false;
  }
}

/**
 * Hostname of the page this frame belongs to. Consent dialogs are often rendered in about:blank /
 * srcdoc iframes (Seznam CMP), where location.hostname is empty; fall back to the parent origin.
 */
function pageHostname(): string {
  if (location.hostname) return location.hostname;
  try {
    const anc = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (anc && anc.length > 0) return new URL(anc[anc.length - 1]!).hostname;
  } catch {
    /* ignore */
  }
  try {
    if (document.referrer) return new URL(document.referrer).hostname;
  } catch {
    /* ignore */
  }
  return '';
}

function isWebFrame(): boolean {
  if (location.protocol.startsWith('http')) return true;
  // about:blank / srcdoc / blob frames created by a web page (match_origin_as_fallback).
  return (location.protocol === 'about:' || location.protocol === 'blob:') && pageHostname() !== '';
}

function log(...args: unknown[]): void {
  if (process.env.NODE_ENV !== 'production') console.debug('[cookiejev]', ...args);
}

async function report(status: TabStatus, planKey?: string): Promise<void> {
  try {
    await sendToBackground({ type: 'report', hostname: pageHostname(), status, ...(planKey ? { planKey } : {}) });
  } catch {
    /* extension context gone */
  }
}

const CONFIRM_LABELS = CONFIRM_PHRASES.map(normalize);
const ACCEPT_NORMALIZED = ACCEPT_PHRASES.map(normalize);

/**
 * After consent was saved some CMPs show a short confirmation ("We have received your choices - OK").
 * Returns its single button when the candidate has that shape, else null.
 */
function confirmationButton(cand: Candidate): Element | null {
  const { snapshot, map } = buildSnapshot(cand.root, cand.cmpHint, 99);
  if (snapshot.dialogText.length > 300) return null;
  const toggles = snapshot.elements.filter((e) => e.kind === 'checkbox' || e.kind === 'switch' || e.kind === 'radio');
  if (toggles.length > 0) return null;
  const buttons = snapshot.elements.filter((e) => (e.kind === 'button' || e.kind === 'link') && !e.disabled);
  if (buttons.length !== 1) return null;
  const label = buttons[0]!.text || buttons[0]!.ariaLabel;
  const isConfirm = scoreAgainst(label, CONFIRM_LABELS) >= 0.9 || scoreAgainst(label, ACCEPT_NORMALIZED) >= 0.9;
  return isConfirm ? (map.get(buttons[0]!.key) ?? null) : null;
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
    if (snapshot.elements.length === 0) {
      if (state.rounds === 1 && !state.teaserClicked && isTeaser(cand)) {
        state.teaserClicked = true;
        log('clicking consent teaser', cand.cmpHint);
        dispatchClick(teaserTarget(cand));
        await sleep(SETTLE_MS);
        const opened = findCandidates().find((c) => buildSnapshot(c.root, c.cmpHint, 1).snapshot.elements.length > 0);
        if (opened) {
          cand.root = opened.root;
          cand.cmpHint = opened.cmpHint;
          state.rounds = 0;
          continue;
        }
        // The real dialog probably opened in another frame; that frame's script will handle it.
        return false;
      }
      break;
    }
    // Element keys are per snapshot; exclude by label so earlier clicks are remembered across rounds.
    const excludeKeys = snapshot.elements.filter((e) => clickedThisDialog.has(`${e.kind}|${e.text}|${e.id}`)).map((e) => e.key);
    // Encode exclusions into the snapshot by marking those elements disabled.
    for (const e of snapshot.elements) if (excludeKeys.includes(e.key)) e.disabled = true;

    let res: DecideResponse;
    try {
      res = await sendToBackground<DecideResponse>({ type: 'decide', hostname: pageHostname(), snapshot });
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
    // Report before acting: CMPs often remove this frame synchronously in the click handler, which
    // destroys this script context before anything after the click can run.
    lastSource = { state: 'handled', source: plan.source, confidence: plan.confidence, rounds: state.rounds, reason: plan.reason };
    if (plan.steps.some((s) => s.type === 'click')) await report(lastSource);
    const exec = await executePlan(plan, map);
    for (const k of [...exec.clicked, ...exec.toggled]) {
      const e = snapshot.elements.find((x) => x.key === k);
      if (e) clickedThisDialog.add(`${e.kind}|${e.text}|${e.id}`);
    }
    await sleep(SETTLE_MS);
    const stillVisible = host.isConnected && isElementVisible(host);
    if (!stillVisible) {
      // Some CMPs replace the banner with a preference dialog in a new container.
      const next = findCandidates();
      if (next.length > 0 && state.rounds < MAX_ROUNDS) {
        if (plan.expectMoreRounds) {
          cand.root = next[0]!.root;
          cand.cmpHint = next[0]!.cmpHint;
          continue;
        }
        const confirm = confirmationButton(next[0]!);
        if (confirm) {
          dispatchClick(confirm);
          await sleep(SETTLE_MS / 2);
        }
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
  if (!isWebFrame()) return;

  const state: PageState = { busy: false, done: false, clicked: new Set(), rounds: 0, attempts: 0, teaserClicked: false };
  let timer: number | undefined;
  let poll: number | undefined;
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
        if (poll !== undefined) clearInterval(poll);
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
      if (poll !== undefined) clearInterval(poll);
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
      enabled = await sendToBackground<boolean>({ type: 'is-host-enabled', hostname: pageHostname() });
    } catch {
      enabled = false;
    }
    if (!enabled) {
      state.done = true;
      return;
    }
    void sendToBackground({ type: 'frame-hello', hostname: pageHostname(), protocol: location.protocol, href: location.href.slice(0, 120), top: window.self === window.top }).catch(() => undefined);
    observer = new MutationObserver(schedule);
    // Observe the Document node itself: document.open()/write() (about:blank CMP frames) replaces documentElement.
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'open'] });
    void run();
    // Mutations inside shadow trees and late CMP loads are invisible to the document observer: poll too.
    poll = window.setInterval(schedule, 2000);
  })();
}

main();
