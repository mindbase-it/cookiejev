import { lightDomContainerSelectors } from '../engine/cmp-rules';
import { scoreAgainst } from '../engine/heuristics';
import { ACCEPT_PHRASES, MANAGE_PHRASES, REJECT_PHRASES, hasTopicWord, normalize } from '../shared/keywords';
import { type Root, collapseWhitespace, deepQueryAll, elementArea, hostElement, isElementVisible, viewportArea, visibleText } from './dom-utils';

const ACCEPT_N = ACCEPT_PHRASES.map(normalize);
const REJECT_N = REJECT_PHRASES.map(normalize);
const MANAGE_N = MANAGE_PHRASES.map(normalize);

function buttonLabel(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value || '';
  return collapseWhitespace((el as HTMLElement).innerText || el.textContent || el.getAttribute('aria-label') || '');
}

/**
 * A small frame whose buttons read like a consent bar ("Souhlasím" + "Nastavení"/"Odmítnout") is a
 * consent frame even without cookie wording: CMPs like Seznam keep the text in the parent page and
 * only the buttons in a cross-origin iframe.
 */
function looksLikeConsentButtonBar(buttons: Element[]): boolean {
  if (buttons.length < 2 || buttons.length > 8) return false;
  const labels = buttons.map(buttonLabel).filter(Boolean);
  const accept = labels.some((l) => scoreAgainst(l, ACCEPT_N) >= 0.9);
  // "Podrobné nastavení" (detailed settings) only partially matches "nastavení": accept partial matches here.
  const rejectOrManage = labels.some((l) => scoreAgainst(l, REJECT_N) >= 0.7 || scoreAgainst(l, MANAGE_N) >= 0.7);
  return accept && rejectOrManage;
}

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
  if (text.length > 30000) return null;
  const buttons = deepQueryAll(body, 'button,[role="button"],input[type="button"],input[type="submit"],a[href]').filter(isElementVisible);
  if (buttons.length === 0) return null;
  const topical = text.length >= 20 && hasTopicWord(text);
  if (!topical && !looksLikeConsentButtonBar(buttons)) return null;
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
