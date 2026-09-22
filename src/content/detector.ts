import { lightDomContainerSelectors } from '../engine/cmp-rules';
import { hasTopicWord } from '../shared/keywords';
import { type Root, deepQueryAll, elementArea, hostElement, isElementVisible, viewportArea, visibleText } from './dom-utils';

export interface Candidate {
  root: Root;
  cmpHint: string;
}

export const INTERACTIVE_SELECTOR = [
  'button',
  '[role="button"]',
  'a[href]',
  '[role="link"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
].join(',');

const GENERIC_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  'dialog[open]',
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[id*="gdpr" i]',
  '[class*="gdpr" i]',
  '[id*="cmp" i]',
  '[class*="cmp" i]',
  '[id*="privacy" i]',
  '[class*="privacy" i]',
].join(',');

function hasInteractive(root: Root): boolean {
  return deepQueryAll(root, INTERACTIVE_SELECTOR).some((el) => isElementVisible(el) || el instanceof HTMLInputElement);
}

/** Walks body descendants up to `maxDepth` levels and returns fixed/sticky positioned ones. */
function fixedContainers(maxDepth = 4): Element[] {
  const out: Element[] = [];
  const body = document.body;
  if (!body) return out;
  const queue: Array<[Element, number]> = Array.from(body.children).map((c) => [c, 1]);
  let scanned = 0;
  while (queue.length && scanned < 1500) {
    const [el, depth] = queue.shift()!;
    scanned++;
    if (el instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT'].includes(el.tagName)) {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') out.push(el);
      else if (depth < maxDepth) for (const c of Array.from(el.children)) queue.push([c, depth + 1]);
    }
  }
  return out;
}

function acceptGeneric(el: Element): boolean {
  if (el === document.body || el === document.documentElement) return false;
  if (!isElementVisible(el)) return false;
  const text = visibleText(el);
  if (text.length < 20 || text.length > 30000) return false;
  if (!hasTopicWord(text)) return false;
  if (!hasInteractive(el)) return false;
  const area = elementArea(el);
  const buttons = deepQueryAll(el, 'button,[role="button"],input[type="button"],input[type="submit"]').filter(isElementVisible).length;
  return area >= viewportArea() * 0.01 || buttons >= 2;
}

/** Consent dialogs rendered inside open shadow roots (e.g. Seznam CMP, Usercentrics-like widgets). */
function shadowCandidates(doc: Document): Candidate[] {
  const out: Candidate[] = [];
  let scanned = 0;
  for (const el of Array.from(doc.querySelectorAll('*'))) {
    if (scanned++ > 6000) break;
    const sr = el.shadowRoot;
    if (!sr || !(el instanceof HTMLElement)) continue;
    const interactive = deepQueryAll(sr, INTERACTIVE_SELECTOR).filter(isElementVisible);
    if (interactive.length === 0) continue;
    const text = visibleText(sr);
    if (text.length < 20 || text.length > 30000 || !hasTopicWord(text)) continue;
    out.push({ root: sr, cmpHint: '' });
  }
  return out;
}

/**
 * When this frame IS the consent dialog (CMPs like Seznam, Sourcepoint or Quantcast render the
 * whole banner into an iframe), nothing inside is position:fixed; the frame body is the dialog.
 */
function frameBodyCandidate(doc: Document): Candidate | null {
  const body = doc.body;
  if (!body) return null;
  const text = visibleText(body);
  if (text.length < 20 || text.length > 30000 || !hasTopicWord(text)) return null;
  const buttons = deepQueryAll(body, 'button,[role="button"],input[type="button"],input[type="submit"],a[href]').filter(isElementVisible);
  if (buttons.length === 0) return null;
  return { root: body, cmpHint: '' };
}

/** Removes candidates contained in another candidate (keeps the outermost). */
function dedupe(cands: Candidate[]): Candidate[] {
  const hosts = cands.map((c) => hostElement(c.root));
  return cands.filter((c, i) => {
    const h = hosts[i]!;
    return !hosts.some((other, j) => j !== i && other !== h && other.contains(h));
  });
}

/** Finds visible consent-dialog candidates in this document. Known CMPs come first. */
export function findCandidates(doc: Document = document, inFrame: boolean = window.self !== window.top): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<Element>();

  for (const { cmpId, selector } of lightDomContainerSelectors()) {
    let matches: Element[] = [];
    try {
      matches = Array.from(doc.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const el of matches) {
      if (seen.has(el)) continue;
      const root: Root = el.shadowRoot ?? el;
      const host = el;
      if (!isElementVisible(host) && !(el.shadowRoot && deepQueryAll(el.shadowRoot, INTERACTIVE_SELECTOR).some(isElementVisible))) continue;
      if (!hasInteractive(root)) continue;
      seen.add(el);
      out.push({ root, cmpHint: cmpId });
    }
  }
  if (out.length > 0) return dedupe(out);

  const shadow = shadowCandidates(doc);
  if (shadow.length > 0) return shadow;

  if (inFrame) {
    const frame = frameBodyCandidate(doc);
    if (frame) return [frame];
  }

  const generic = new Set<Element>();
  try {
    for (const el of Array.from(doc.querySelectorAll(GENERIC_SELECTOR))) generic.add(el);
  } catch {
    /* selector unsupported */
  }
  for (const el of fixedContainers()) generic.add(el);

  let checked = 0;
  for (const el of generic) {
    if (checked++ > 400) break;
    if (seen.has(el)) continue;
    if (acceptGeneric(el)) {
      seen.add(el);
      out.push({ root: el, cmpHint: '' });
    }
  }
  return dedupe(out);
}
