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
  /** Last OpenJev error recorded by the service worker (null when the last call succeeded / none made). */
  openjevError(): Promise<string | null>;
  /** Engine diagnostics for the tab matching urlPattern (last snapshot + decision). */
  debug(urlPattern: string): Promise<unknown>;
  /** Frames in which the content script started (frame-hello diagnostics). */
  frames(urlPattern: string): Promise<Array<{ hostname: string; protocol: string; href: string; top: boolean }>>;
}

export interface LaunchOptions {
  locale?: string;
}

export async function launchExtension(settings: Partial<Settings> = {}, opts: LaunchOptions = {}): Promise<ExtensionSession> {
  const dist = path.resolve('dist');
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'cookiejev-e2e-'));
  // Full Chromium (required for extensions) can take minutes to cold-start on Windows (AV scan of the binary).
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    timeout: 300_000,
    ...(opts.locale ? { locale: opts.locale } : {}),
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

  const openjevError = () =>
    worker.evaluate(async () => {
      const r = await chrome.storage.session.get('openjev:lastError');
      return (r['openjev:lastError'] as string | null | undefined) ?? null;
    });

  const debug = async (urlPattern: string) =>
    worker.evaluate(async (pattern) => {
      const tabs = await chrome.tabs.query({ url: pattern });
      const id = tabs[0]?.id;
      if (id === undefined) return null;
      const r = await chrome.storage.session.get(`debug:${id}`);
      return r[`debug:${id}`] ?? null;
    }, urlPattern);

  const frames = async (urlPattern: string) =>
    worker.evaluate(async (pattern) => {
      const tabs = await chrome.tabs.query({ url: pattern });
      const id = tabs[0]?.id;
      if (id === undefined) return [];
      const r = await chrome.storage.session.get(`frames:${id}`);
      return (r[`frames:${id}`] as Array<{ hostname: string; protocol: string; href: string; top: boolean }> | undefined) ?? [];
    }, urlPattern);

  return {
    context,
    worker,
    setSettings,
    tabStatus,
    openjevError,
    debug,
    frames,
    async close() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
