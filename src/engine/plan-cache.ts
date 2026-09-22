import type { ActionPlan, DialogSnapshot } from '../shared/types';

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

interface CacheEntry {
  plan: ActionPlan;
  ts: number;
}

const STORE_KEY = 'planCache';
export const PLAN_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PLAN_CACHE_MAX = 500;

/** FNV-1a 32-bit, hex. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Cache key: hostname + CMP + shape of the dialog (kinds and labels), independent of element order. */
export function planKey(hostname: string, snapshot: DialogSnapshot, policyKey: string): string {
  const shape = snapshot.elements
    .map((e) => `${e.kind}:${(e.text || e.ariaLabel).toLowerCase().slice(0, 60)}`)
    .sort()
    .join('|');
  return `${hostname.toLowerCase()}|${snapshot.cmpHint}|${snapshot.round}|${policyKey}|${fnv1a(shape)}`;
}

export class PlanCache {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async readAll(): Promise<Record<string, CacheEntry>> {
    const raw = await this.store.get(STORE_KEY);
    return raw && typeof raw === 'object' ? (raw as Record<string, CacheEntry>) : {};
  }

  async get(key: string): Promise<ActionPlan | null> {
    const all = await this.readAll();
    const e = all[key];
    if (!e) return null;
    if (this.now() - e.ts > PLAN_CACHE_TTL_MS) {
      delete all[key];
      await this.store.set(STORE_KEY, all);
      return null;
    }
    return { ...e.plan, source: 'cache' };
  }

  async set(key: string, plan: ActionPlan): Promise<void> {
    const all = await this.readAll();
    all[key] = { plan, ts: this.now() };
    const keys = Object.keys(all);
    if (keys.length > PLAN_CACHE_MAX) {
      keys
        .sort((a, b) => all[a]!.ts - all[b]!.ts)
        .slice(0, keys.length - PLAN_CACHE_MAX)
        .forEach((k) => delete all[k]);
    }
    await this.store.set(STORE_KEY, all);
  }

  async invalidate(key: string): Promise<void> {
    const all = await this.readAll();
    if (key in all) {
      delete all[key];
      await this.store.set(STORE_KEY, all);
    }
  }

  async clear(): Promise<void> {
    await this.store.set(STORE_KEY, {});
  }
}
