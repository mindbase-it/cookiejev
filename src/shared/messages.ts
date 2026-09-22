import type { ActionPlan, DialogSnapshot, TabStatus } from './types';

/** content → background */
export type ContentRequest =
  | { type: 'decide'; hostname: string; snapshot: DialogSnapshot }
  | { type: 'report'; hostname: string; status: TabStatus; planKey?: string }
  | { type: 'is-host-enabled'; hostname: string }
  /** Diagnostics: the content script started in this frame. */
  | { type: 'frame-hello'; hostname: string; protocol: string; href: string; top: boolean };

/** popup/options → background */
export type UiRequest =
  | { type: 'get-tab-status'; tabId: number }
  | { type: 'rerun'; tabId: number }
  | { type: 'test-openjev'; endpoint: string; token: string }
  | { type: 'clear-cache' };

export type Request = ContentRequest | UiRequest;

export type DecideResponse =
  | { ok: true; plan: ActionPlan; planKey: string }
  | { ok: true; plan: null; planKey: string; reason: string }
  | { ok: false; error: string };

export type TestOpenJevResponse = { ok: true; model: string } | { ok: false; error: string };

export function sendToBackground<T>(msg: Request): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}
