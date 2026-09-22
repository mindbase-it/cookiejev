import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import type { Settings } from '../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { FIXTURES_PORT, OPENJEV_PORT } from '../../playwright.config';

export const FIXTURES = `http://127.0.0.1:${FIXTURES_PORT}`;
export const OPENJEV = `http://127.0.0.1:${OPENJEV_PORT}`;

export interface ExtensionSession {
  context: BrowserContext;
  worker: Worker;
  close(): Promise<void>;
  setSettings(patch: Partial<Settings>): Promise<void>;
  tabStatus(urlPattern: string): Promise<unknown>;
}

export async function launchExtension(settings: Partial<Settings> = {}): Promise<ExtensionSession> {
  const dist = path.resolve('dist');
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cookiejev-e2e-'));
  // Full Chromium (required for extensions) can take minutes to cold-start on Windows (AV scan of the binary).
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    timeout: 300_000,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 60_000 });

  const setSettings = async (patch: Partial<Settings>) => {
    const merged: Settings = {
      ...DEFAULT_SETTINGS,
      ...patch,
      custom: { ...DEFAULT_SETTINGS.custom, ...(patch.custom ?? {}) },
      openjev: { ...DEFAULT_SETTINGS.openjev, endpoint: OPENJEV, ...(patch.openjev ?? {}) },
    };
    await worker.evaluate(async (s) => {
      await chrome.storage.sync.set({ settings: s });
      await chrome.storage.local.set({ planCache: {} });
    }, merged);
  };
  await setSettings(settings);

  const tabStatus = async (urlPattern: string) =>
    worker.evaluate(async (pattern) => {
      const tabs = await chrome.tabs.query({ url: pattern });
      const id = tabs[0]?.id;
      if (id === undefined) return null;
      const r = await chrome.storage.session.get(`tab:${id}`);
      return r[`tab:${id}`] ?? null;
    }, urlPattern);

  return {
    context,
    worker,
    setSettings,
    tabStatus,
    async close() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
