export function t(key: string, ...subs: string[]): string {
  try {
    const m = chrome.i18n.getMessage(key, subs);
    return m || key;
  } catch {
    return key;
  }
}

/** Fills every element with data-i18n="key" (text) and data-i18n-placeholder="key". */
export function applyI18n(root: ParentNode = document): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
  for (const el of Array.from(root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]'))) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(key);
  }
}
