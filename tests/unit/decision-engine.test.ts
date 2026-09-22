import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionEngine, OPENJEV_BACKOFF_MS } from '../../src/engine/decision-engine';
import { OpenJevClient, OpenJevError, type OpenJevResponse } from '../../src/engine/openjev-client';
import { PlanCache } from '../../src/engine/plan-cache';
import { MemoryStore, el, resetKeys, settings, snap, toggle } from './helpers';

beforeEach(resetKeys);

function fakeClient(impl: (state: string, q: Record<string, unknown>) => Promise<OpenJevResponse>): OpenJevClient {
  const c = new OpenJevClient({ endpoint: 'http://x', fetchFn: (async () => new Response('{}')) as unknown as typeof fetch });
  c.ask = vi.fn(impl) as unknown as OpenJevClient['ask'];
  return c;
}

function engine(client: OpenJevClient | null, now = () => 1_000_000) {
  const cache = new PlanCache(new MemoryStore(), now);
  return { engine: new DecisionEngine({ cache, clientFor: () => client, now }), cache, client };
}

describe('DecisionEngine tiering', () => {
  it('uses CMP rule first and caches it, without calling OpenJev', async () => {
    const client = fakeClient(async () => ({ answers: {} }));
    const { engine: e } = engine(client);
    const reject = el('Reject All', 'button', { id: 'onetrust-reject-all-handler' });
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([el('Accept'), reject], { cmpHint: 'onetrust' }), settings: settings() });
    expect(out.plan?.source).toBe('cmp-rule');
    expect(client.ask).not.toHaveBeenCalled();

    const again = await e.decide({ hostname: 'a.cz', snapshot: snap([el('Accept'), reject], { cmpHint: 'onetrust' }), settings: settings() });
    expect(again.plan?.source).toBe('cache');
  });

  it('skips non-consent dialogs without calling OpenJev', async () => {
    const client = fakeClient(async () => ({ answers: {} }));
    const { engine: e } = engine(client);
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([el('Subscribe')], { dialogText: 'Join our newsletter' }), settings: settings() });
    expect(out.plan).toBeNull();
    expect(out.reason).toBe('not-consent');
    expect(client.ask).not.toHaveBeenCalled();
  });

  it('uses OpenJev when no CMP rule applies', async () => {
    const a = el('Got it');
    const r = el('No thanks');
    const client = fakeClient(async () => ({
      answers: {
        is_consent: { type: 'noul', noul: 0.9 },
        reject_button: { type: 'choice', choice: r.key, probabilities: { [r.key]: 0.8 }, confidence: 0.8 },
        manage_button: { type: 'choice', choice: 'none', probabilities: { none: 0.9 }, confidence: 0.9 },
      },
    }));
    const { engine: e } = engine(client);
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([a, r]), settings: settings() });
    expect(out.plan?.source).toBe('openjev');
    expect(out.plan?.steps).toEqual([{ type: 'click', key: r.key }]);
  });

  it('falls back to heuristics when OpenJev is unsure', async () => {
    const a = el('Accept all');
    const r = el('Reject all');
    const client = fakeClient(async () => ({ answers: { is_consent: { type: 'noul', noul: 0.9 }, reject_button: { type: 'choice', choice: 'none', probabilities: {}, confidence: 0.5 } } }));
    const { engine: e } = engine(client);
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([a, r]), settings: settings() });
    expect(out.plan?.source).toBe('heuristic');
    expect(out.plan?.steps).toEqual([{ type: 'click', key: r.key }]);
  });

  it('respects OpenJev "not a consent dialog" verdict', async () => {
    const client = fakeClient(async () => ({ answers: { is_consent: { type: 'noul', noul: 0.1 } } }));
    const { engine: e } = engine(client);
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([el('Reject all')], { dialogText: 'cookie recipe: reject all bad eggs' }), settings: settings() });
    expect(out.plan).toBeNull();
    expect(out.reason).toBe('not-consent');
  });

  it('falls back to heuristics on network error and backs off for 60 s', async () => {
    let t = 1_000_000;
    const client = fakeClient(async () => {
      throw new OpenJevError('network', 'ECONNREFUSED');
    });
    const { engine: e } = engine(client, () => t);
    const mk = () => snap([el('Accept all'), el('Reject all')]);
    const out = await e.decide({ hostname: 'a.cz', snapshot: mk(), settings: settings() });
    expect(out.plan?.source).toBe('heuristic');
    expect(client.ask).toHaveBeenCalledTimes(1);
    expect(e.lastOpenJevError).toContain('ECONNREFUSED');

    resetKeys();
    await e.decide({ hostname: 'b.cz', snapshot: mk(), settings: settings() });
    expect(client.ask).toHaveBeenCalledTimes(1); // backoff

    t += OPENJEV_BACKOFF_MS + 1;
    resetKeys();
    await e.decide({ hostname: 'c.cz', snapshot: mk(), settings: settings() });
    expect(client.ask).toHaveBeenCalledTimes(2);
  });

  it('retries once on timeout, then falls back', async () => {
    const client = fakeClient(async () => {
      throw new OpenJevError('timeout', 'slow');
    });
    const { engine: e } = engine(client);
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([el('Accept all'), el('Reject all')]), settings: settings() });
    expect(client.ask).toHaveBeenCalledTimes(2);
    expect(out.plan?.source).toBe('heuristic');
  });

  it('does not call OpenJev when disabled in settings', async () => {
    const client = fakeClient(async () => ({ answers: {} }));
    const { engine: e } = engine(client);
    await e.decide({ hostname: 'a.cz', snapshot: snap([el('Accept all'), el('Reject all')]), settings: settings({ openjev: { enabled: false, endpoint: 'x', token: '' } }) });
    expect(client.ask).not.toHaveBeenCalled();
  });

  it('returns no plan when nothing applies', async () => {
    const { engine: e } = engine(null);
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([el('Accept all')]), settings: settings() });
    expect(out.plan).toBeNull();
    expect(out.reason).toBe('no-plan');
  });

  it('round 2 with toggles via heuristics after cached manage step', async () => {
    const { engine: e } = engine(null);
    const t = toggle('Marketing cookies', true);
    const save = el('Save settings');
    const out = await e.decide({ hostname: 'a.cz', snapshot: snap([t, save], { round: 2 }), settings: settings(), exclude: new Set(['e0']) });
    expect(out.plan?.steps).toEqual([
      { type: 'setToggle', key: t.key, on: false },
      { type: 'click', key: save.key },
    ]);
  });
});
