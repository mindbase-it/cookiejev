import type { ActionPlan } from '../shared/types';
import { cssEscape } from './dom-utils';

export interface ExecutionResult {
  clicked: string[];
  toggled: string[];
  missing: string[];
}

const STEP_DELAY_MS = 60;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Anchors with a javascript: href navigate on click; page CSP blocks that and logs an extension error. */
function isJavascriptHref(el: Element): boolean {
  return el instanceof HTMLAnchorElement && (el.getAttribute('href') || '').trim().toLowerCase().startsWith('javascript:');
}

export function dispatchClick(el: Element): void {
  if (isJavascriptHref(el)) {
    // Site handlers registered earlier on the element still run; bubbling to delegated handlers continues.
    el.addEventListener('click', (e) => e.preventDefault(), { once: true });
  }
  if (el instanceof HTMLElement) {
    el.click();
    return;
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
}

function currentState(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  const ac = el.getAttribute('aria-checked');
  if (ac !== null) return ac === 'true';
  const ap = el.getAttribute('aria-pressed');
  if (ap !== null) return ap === 'true';
  return el.classList.contains('checked') || el.classList.contains('active') || el.classList.contains('on');
}

function labelFor(el: Element): HTMLElement | null {
  if (el.id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const lab = root.querySelector?.(`label[for="${cssEscape(el.id)}"]`);
    if (lab instanceof HTMLElement) return lab;
  }
  const wrapping = el.closest('label');
  return wrapping instanceof HTMLElement ? wrapping : null;
}

/** Sets a toggle to `on`; tries the element, then its label. Returns true when the state matches afterwards. */
export async function setToggle(el: Element, on: boolean): Promise<boolean> {
  if (currentState(el) === on) return true;
  dispatchClick(el);
  await sleep(STEP_DELAY_MS);
  if (currentState(el) === on) return true;
  const lab = labelFor(el);
  if (lab) {
    lab.click();
    await sleep(STEP_DELAY_MS);
    if (currentState(el) === on) return true;
  }
  if (el instanceof HTMLInputElement) {
    el.checked = on;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.checked === on;
  }
  return false;
}

export async function executePlan(plan: ActionPlan, map: Map<string, Element>): Promise<ExecutionResult> {
  const result: ExecutionResult = { clicked: [], toggled: [], missing: [] };
  for (const step of plan.steps) {
    if (step.type === 'wait') {
      await sleep(step.ms);
      continue;
    }
    const el = map.get(step.key);
    if (!el || !el.isConnected) {
      result.missing.push(step.key);
      continue;
    }
    if (step.type === 'click') {
      dispatchClick(el);
      result.clicked.push(step.key);
    } else {
      const ok = await setToggle(el, step.on);
      if (ok) result.toggled.push(step.key);
      else result.missing.push(step.key);
    }
    await sleep(STEP_DELAY_MS);
  }
  return result;
}
