export type Root = Element | ShadowRoot;

export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (parseFloat(style.opacity || '1') === 0) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  // Off-screen (e.g. translated away)
  if (rect.bottom < 0 || rect.right < 0) return false;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  if (rect.top > vh + 50 || rect.left > vw + 50) return false;
  return true;
}

/** querySelectorAll that also descends into open shadow roots (bounded depth). */
export function deepQueryAll(root: Root, selector: string, maxDepth = 4): Element[] {
  const out: Element[] = [];
  const visit = (r: Root, depth: number) => {
    for (const el of Array.from(r.querySelectorAll(selector))) out.push(el);
    if (depth >= maxDepth) return;
    for (const el of Array.from(r.querySelectorAll('*'))) {
      if (el.shadowRoot) visit(el.shadowRoot, depth + 1);
    }
  };
  visit(root, 0);
  return out;
}

export function hostElement(root: Root): Element {
  return root instanceof ShadowRoot ? root.host : root;
}

/** CSS.escape with a fallback for environments without it (jsdom). */
export function cssEscape(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (css?.escape) return css.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Text of an element or shadow root without <style>/<script> contents (textContent would include them). */
export function visibleText(root: Root): string {
  if (root instanceof ShadowRoot) {
    const parts: string[] = [];
    for (const child of Array.from(root.children)) {
      if (['STYLE', 'SCRIPT', 'TEMPLATE', 'LINK'].includes(child.tagName)) continue;
      parts.push((child as HTMLElement).innerText ?? textWithoutStyles(child));
    }
    return collapseWhitespace(parts.join(' '));
  }
  const host = root as HTMLElement;
  return collapseWhitespace(host.innerText ?? textWithoutStyles(host));
}

function textWithoutStyles(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('style,script,template').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

export function elementArea(el: Element): number {
  const r = el.getBoundingClientRect();
  return Math.max(0, r.width) * Math.max(0, r.height);
}

export function viewportArea(): number {
  return (window.innerWidth || 1) * (window.innerHeight || 1);
}
