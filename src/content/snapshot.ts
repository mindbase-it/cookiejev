import type { DialogSnapshot, ElementKind, SnapshotElement } from '../shared/types';
import { INTERACTIVE_SELECTOR } from './detector';
import { type Root, collapseWhitespace, cssEscape, deepQueryAll, isElementVisible, visibleText } from './dom-utils';

export interface SnapshotResult {
  snapshot: DialogSnapshot;
  map: Map<string, Element>;
}

const MAX_ELEMENTS = 60;

function kindOf(el: Element): ElementKind | null {
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    if (t === 'checkbox') return role === 'switch' ? 'switch' : 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'button' || t === 'submit') return 'button';
    return null;
  }
  if (role === 'switch') return 'switch';
  if (role === 'checkbox') return 'checkbox';
  if (role === 'radio') return 'radio';
  if (role === 'button' || el instanceof HTMLButtonElement) return 'button';
  if (role === 'link' || el instanceof HTMLAnchorElement) return 'link';
  return null;
}

/** Links to another page are "learn more" links — never useful to click for consent. */
function navigatesAway(el: Element): boolean {
  if (!(el instanceof HTMLAnchorElement)) return false;
  const href = el.getAttribute('href') || '';
  if (!href || href === '#' || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return false;
  if ((el.getAttribute('role') || '').toLowerCase() === 'button') return false;
  try {
    const u = new URL(href, location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.origin + u.pathname !== location.origin + location.pathname;
  } catch {
    return true;
  }
}

function textOf(el: Element): string {
  if (el instanceof HTMLInputElement) return collapseWhitespace(el.value || '');
  const t = (el as HTMLElement).innerText ?? el.textContent ?? '';
  return collapseWhitespace(t);
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  const root = el.getRootNode() as Document | ShadowRoot;
  return collapseWhitespace(
    ids
      .split(/\s+/)
      .map((id) => root.getElementById?.(id)?.textContent ?? '')
      .join(' '),
  );
}

/** Best-effort label for toggles: aria, <label for>, wrapping label, then nearby text. */
function toggleLabel(el: Element): string {
  const aria = collapseWhitespace(el.getAttribute('aria-label') || '') || labelledBy(el);
  if (aria) return aria;
  const root = el.getRootNode() as Document | ShadowRoot;
  if (el.id) {
    const lab = root.querySelector?.(`label[for="${cssEscape(el.id)}"]`);
    if (lab) {
      const t = collapseWhitespace(lab.textContent || '');
      if (t) return t;
    }
  }
  const wrapping = el.closest('label');
  if (wrapping) {
    const t = collapseWhitespace(wrapping.textContent || '');
    if (t) return t;
  }
  // Walk up to 4 ancestors and take the shortest meaningful text block.
  let node: Element | null = el.parentElement;
  for (let i = 0; i < 4 && node; i++) {
    const heading = node.querySelector('h1,h2,h3,h4,h5,h6,legend,[class*="title" i],[class*="header" i],[class*="name" i]');
    if (heading) {
      const t = collapseWhitespace(heading.textContent || '');
      if (t && t.length <= 120) return t;
    }
    const t = collapseWhitespace(node.textContent || '');
    if (t && t.length <= 120) return t;
    node = node.parentElement;
  }
  return '';
}

function isChecked(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  const ac = el.getAttribute('aria-checked');
  if (ac !== null) return ac === 'true';
  const ap = el.getAttribute('aria-pressed');
  if (ap !== null) return ap === 'true';
  return el.classList.contains('checked') || el.classList.contains('active') || el.classList.contains('on');
}

function isDisabled(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) return el.disabled;
  return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
}

export function buildSnapshot(root: Root, cmpHint: string, round: number): SnapshotResult {
  const map = new Map<string, Element>();
  const elements: SnapshotElement[] = [];
  const seen = new Set<Element>();
  let index = 0;

  for (const el of deepQueryAll(root, INTERACTIVE_SELECTOR)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const kind = kindOf(el);
    if (!kind) continue;
    const isToggle = kind === 'checkbox' || kind === 'switch' || kind === 'radio';
    // Toggle inputs are often visually hidden behind styled labels — keep them.
    if (!isToggle && !isElementVisible(el)) continue;
    if (kind === 'link' && navigatesAway(el)) continue;

    const text = isToggle ? toggleLabel(el) : textOf(el);
    const ariaLabel = collapseWhitespace(el.getAttribute('aria-label') || el.getAttribute('title') || '');
    if (!text && !ariaLabel && !isToggle) continue;

    const key = `e${index++}`;
    map.set(key, el);
    elements.push({
      key,
      kind,
      tag: el.tagName.toLowerCase(),
      id: (el.id || '').slice(0, 80),
      classes: Array.from(el.classList).join(' ').slice(0, 200),
      text: text.slice(0, 120),
      ariaLabel: ariaLabel.slice(0, 120),
      disabled: isDisabled(el),
      ...(isToggle ? { checked: isChecked(el) } : {}),
    });
    if (elements.length >= MAX_ELEMENTS) break;
  }

  const lang = (document.documentElement.lang || '').slice(0, 10);
  const snapshot: DialogSnapshot = {
    dialogText: visibleText(root).slice(0, 1500),
    lang,
    cmpHint,
    elements,
    round,
  };
  return { snapshot, map };
}
