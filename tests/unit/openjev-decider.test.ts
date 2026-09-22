import { beforeEach, describe, expect, it } from 'vitest';
import { buildQuestions, buildState, decisionFromAnswers } from '../../src/engine/openjev-decider';
import type { OpenJevAnswer } from '../../src/engine/openjev-client';
import { el, resetKeys, settings, snap, toggle } from './helpers';

beforeEach(resetKeys);

const choice = (key: string, confidence = 0.9): OpenJevAnswer => ({ type: 'choice', choice: key, probabilities: { [key]: confidence }, confidence });

describe('buildState', () => {
  it('lists elements with kind and state, no URL', () => {
    const s = buildState(snap([el('Accept'), toggle('Analytics', true)], { lang: 'cs', cmpHint: 'onetrust' }));
    expect(s).toContain('Page language: cs');
    expect(s).toContain('Known consent platform: onetrust');
    expect(s).toContain('e1 [button] "Accept"');
    expect(s).toContain('e2 [switch, checked] "Analytics"');
    expect(s).not.toMatch(/https?:\/\//);
  });
});

describe('buildQuestions', () => {
  it('asks is_consent only for unknown CMPs', () => {
    expect(buildQuestions(snap([el('Accept')]), settings(), new Set()).is_consent).toBeDefined();
    expect(buildQuestions(snap([el('Accept')], { cmpHint: 'didomi' }), settings(), new Set()).is_consent).toBeUndefined();
  });

  it('builds reject/manage/save and toggle questions with element keys + none', () => {
    const a = el('Accept');
    const t = toggle('Marketing', true);
    const q = buildQuestions(snap([a, t]), settings(), new Set());
    expect(q.reject_button).toMatchObject({ type: 'choice', criteria: { none: expect.any(String), [a.key]: 'Accept' } });
    expect(q.manage_button).toBeDefined();
    expect(q.save_button).toBeDefined();
    expect(q[`toggle_${t.key}`]).toMatchObject({ type: 'choice', criteria: expect.objectContaining({ marketing: null, necessary: null }) });
    expect(q.accept_button).toBeUndefined();
  });

  it('excludes already-clicked elements from criteria', () => {
    const a = el('Accept');
    const m = el('Settings');
    const q = buildQuestions(snap([a, m]), settings(), new Set([m.key]));
    expect((q.reject_button as { criteria: Record<string, unknown> }).criteria[m.key]).toBeUndefined();
  });

  it('asks accept_button under accept_all', () => {
    const q = buildQuestions(snap([el('OK')]), settings({ policy: 'accept_all' }), new Set());
    expect(q.accept_button).toBeDefined();
    expect(q.reject_button).toBeUndefined();
  });
});

describe('decisionFromAnswers', () => {
  it('returns null plan when is_consent is low', () => {
    const d = decisionFromAnswers(snap([el('OK')]), settings(), { is_consent: { type: 'noul', noul: 0.2 } }, 0.55);
    expect(d.plan).toBeNull();
    expect(d.consentProbability).toBe(0.2);
  });

  it('clicks confident reject', () => {
    const a = el('Accept');
    const r = el('Reject');
    const d = decisionFromAnswers(snap([a, r]), settings(), { is_consent: { type: 'noul', noul: 0.95 }, reject_button: choice(r.key, 0.8) }, 0.55);
    expect(d.plan?.steps).toEqual([{ type: 'click', key: r.key }]);
    expect(d.plan?.source).toBe('openjev');
  });

  it('ignores low-confidence or "none" choices and falls back to manage', () => {
    const a = el('Accept');
    const m = el('Options');
    const d = decisionFromAnswers(snap([a, m]), settings(), { reject_button: choice('none', 0.9), manage_button: choice(m.key, 0.7) }, 0.55);
    expect(d.plan?.steps).toEqual([{ type: 'click', key: m.key }]);
    expect(d.plan?.expectMoreRounds).toBe(true);

    const d2 = decisionFromAnswers(snap([a, m]), settings(), { reject_button: choice(a.key, 0.4), manage_button: choice(m.key, 0.3) }, 0.55);
    expect(d2.plan).toBeNull();
  });

  it('never clicks an element that is not in the snapshot', () => {
    const d = decisionFromAnswers(snap([el('Accept')]), settings(), { reject_button: choice('e99', 0.99) }, 0.55);
    expect(d.plan).toBeNull();
  });

  it('sets toggles by category and saves', () => {
    const t1 = toggle('A', true);
    const t2 = toggle('B', true);
    const t3 = toggle('C', false);
    const save = el('Save');
    const answers: Record<string, OpenJevAnswer> = {
      [`toggle_${t1.key}`]: choice('necessary'),
      [`toggle_${t2.key}`]: choice('marketing'),
      [`toggle_${t3.key}`]: choice('analytics'),
      save_button: choice(save.key, 0.85),
      reject_button: choice('none', 0.9),
    };
    const d = decisionFromAnswers(snap([t1, t2, t3, save], { cmpHint: 'x', round: 2 }), settings(), answers, 0.55);
    expect(d.plan?.steps).toEqual([
      { type: 'setToggle', key: t2.key, on: false },
      { type: 'click', key: save.key },
    ]);
  });

  it('custom policy turns allowed categories on', () => {
    const t = toggle('Stats', false);
    const save = el('Save');
    const s = settings({ policy: 'custom', custom: { analytics: true, marketing: false, personalization: false, functional: false } });
    const d = decisionFromAnswers(snap([t, save], { cmpHint: 'x' }), s, { [`toggle_${t.key}`]: choice('analytics'), save_button: choice(save.key) }, 0.55);
    expect(d.plan?.steps).toEqual([
      { type: 'setToggle', key: t.key, on: true },
      { type: 'click', key: save.key },
    ]);
  });
});
