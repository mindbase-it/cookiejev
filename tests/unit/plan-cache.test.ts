import { beforeEach, describe, expect, it } from 'vitest';
import { PLAN_CACHE_MAX, PLAN_CACHE_TTL_MS, PlanCache, fnv1a, planKey } from '../../src/engine/plan-cache';
import type { ActionPlan } from '../../src/shared/types';
import { MemoryStore, el, resetKeys, snap } from './helpers';

beforeEach(resetKeys);

const plan: ActionPlan = { steps: [{ type: 'click', key: 'e1' }], source: 'heuristic', confidence: 0.9, expectMoreRounds: false, reason: 'r' };

describe('planKey', () => {
  it('is stable across element order and case of hostname', () => {
    const a = el('Accept');
    const r = el('Reject');
    expect(planKey('Example.com', snap([a, r]), 'reject_all')).toBe(planKey('example.com', snap([r, a]), 'reject_all'));
  });
  it('differs by policy, round and labels', () => {
    const s = snap([el('Accept')]);
    expect(planKey('h', s, 'reject_all')).not.toBe(planKey('h', s, 'accept_all'));
    expect(planKey('h', s, 'x')).not.toBe(planKey('h', { ...s, round: 2 }, 'x'));
    expect(planKey('h', s, 'x')).not.toBe(planKey('h', snap([el('Decline')]), 'x'));
  });
  it('fnv1a is deterministic', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
  });
});

describe('PlanCache', () => {
  it('stores, reads with source=cache, invalidates and clears', async () => {
    const cache = new PlanCache(new MemoryStore());
    expect(await cache.get('k')).toBeNull();
    await cache.set('k', plan);
    expect(await cache.get('k')).toMatchObject({ ...plan, source: 'cache' });
    await cache.invalidate('k');
    expect(await cache.get('k')).toBeNull();
    await cache.set('k', plan);
    await cache.clear();
    expect(await cache.get('k')).toBeNull();
  });

  it('expires entries after TTL', async () => {
    let t = 1000;
    const cache = new PlanCache(new MemoryStore(), () => t);
    await cache.set('k', plan);
    t += PLAN_CACHE_TTL_MS + 1;
    expect(await cache.get('k')).toBeNull();
  });

  it('evicts oldest beyond max size', async () => {
    let t = 0;
    const store = new MemoryStore();
    const cache = new PlanCache(store, () => ++t);
    for (let i = 0; i <= PLAN_CACHE_MAX; i++) await cache.set(`k${i}`, plan);
    expect(await cache.get('k0')).toBeNull();
    expect(await cache.get(`k${PLAN_CACHE_MAX}`)).not.toBeNull();
  });
});
