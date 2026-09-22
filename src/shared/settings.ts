import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  policy: 'reject_all',
  custom: { analytics: false, marketing: false, personalization: false, functional: false },
  openjev: { enabled: true, endpoint: 'http://127.0.0.1:3000', token: '' },
  confidenceThreshold: 0.55,
  disabledHosts: [],
  showBadge: true,
};

const STORAGE_KEY = 'settings';

/** Merges a possibly partial/unknown object into a valid Settings value. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const custom = (r.custom && typeof r.custom === 'object' ? r.custom : {}) as Record<string, unknown>;
  const openjev = (r.openjev && typeof r.openjev === 'object' ? r.openjev : {}) as Record<string, unknown>;
  const policy = r.policy;
  const threshold = typeof r.confidenceThreshold === 'number' ? r.confidenceThreshold : DEFAULT_SETTINGS.confidenceThreshold;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_SETTINGS.enabled,
    policy: policy === 'reject_all' || policy === 'accept_all' || policy === 'custom' ? policy : DEFAULT_SETTINGS.policy,
    custom: {
      analytics: custom.analytics === true,
      marketing: custom.marketing === true,
      personalization: custom.personalization === true,
      functional: custom.functional === true,
    },
    openjev: {
      enabled: typeof openjev.enabled === 'boolean' ? openjev.enabled : DEFAULT_SETTINGS.openjev.enabled,
      endpoint: typeof openjev.endpoint === 'string' && openjev.endpoint.trim() !== ''
        ? openjev.endpoint.trim().replace(/\/+$/, '')
        : DEFAULT_SETTINGS.openjev.endpoint,
      token: typeof openjev.token === 'string' ? openjev.token : '',
    },
    confidenceThreshold: Math.min(0.95, Math.max(0.3, threshold)),
    disabledHosts: Array.isArray(r.disabledHosts)
      ? r.disabledHosts.filter((h): h is string => typeof h === 'string').map((h) => h.toLowerCase().trim()).filter(Boolean)
      : [],
    showBadge: typeof r.showBadge === 'boolean' ? r.showBadge : DEFAULT_SETTINGS.showBadge,
  };
}

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return normalizeSettings(data[STORAGE_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[STORAGE_KEY]) cb(normalizeSettings(changes[STORAGE_KEY].newValue));
  });
}

/** True when the extension should not act on this hostname (exact or parent-domain match). */
export function isHostDisabled(hostname: string, disabledHosts: string[]): boolean {
  const h = hostname.toLowerCase();
  return disabledHosts.some((d) => h === d || h.endsWith('.' + d));
}
