import { beforeEach, describe, expect, it } from 'vitest';
import { CMP_RULES, cmpRulePlan, lightDomContainerSelectors } from '../../src/engine/cmp-rules';
import { el, resetKeys, settings, snap, toggle } from './helpers';

beforeEach(resetKeys);

describe('CMP_RULES', () => {
  it('have unique ids and at least one container selector', () => {
    const ids = new Set(CMP_RULES.map((r) => r.id));
    expect(ids.size).toBe(CMP_RULES.length);
    for (const r of CMP_RULES) expect(r.containerSelectors.length).toBeGreaterThan(0);
    expect(lightDomContainerSelectors().length).toBeGreaterThan(CMP_RULES.length);
  });
});

describe('cmpRulePlan', () => {
  it('returns null for unknown cmp', () => {
    expect(cmpRulePlan(snap([el('Reject all')], { cmpHint: 'nope' }), settings())).toBeNull();
  });

  it('onetrust: clicks reject by id', () => {
    const accept = el('Accept All Cookies', 'button', { id: 'onetrust-accept-btn-handler' });
    const reject = el('Reject All', 'button', { id: 'onetrust-reject-all-handler' });
    const plan = cmpRulePlan(snap([accept, reject], { cmpHint: 'onetrust' }), settings());
    expect(plan?.steps).toEqual([{ type: 'click', key: reject.key }]);
    expect(plan?.source).toBe('cmp-rule');
  });

  it('onetrust: opens preference center when no reject button', () => {
    const accept = el('Accept All Cookies', 'button', { id: 'onetrust-accept-btn-handler' });
    const manage = el('Cookies Settings', 'button', { id: 'onetrust-pc-btn-handler' });
    const plan = cmpRulePlan(snap([accept, manage], { cmpHint: 'onetrust' }), settings());
    expect(plan?.steps).toEqual([{ type: 'click', key: manage.key }]);
    expect(plan?.expectMoreRounds).toBe(true);
  });

  it('onetrust: round 2 sets toggles and saves via class', () => {
    const t = toggle('Performance Cookies', true);
    const save = el('Confirm My Choices', 'button', { classes: 'save-preference-btn-handler onetrust-close-btn-handler' });
    const plan = cmpRulePlan(snap([t, save], { cmpHint: 'onetrust', round: 2 }), settings());
    expect(plan?.steps).toEqual([
      { type: 'setToggle', key: t.key, on: false },
      { type: 'click', key: save.key },
    ]);
  });

  it('cookiebot: accept_all policy clicks allow-all', () => {
    const decline = el('Decline', 'button', { id: 'CybotCookiebotDialogBodyButtonDecline' });
    const allow = el('Allow all', 'button', { id: 'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll' });
    const plan = cmpRulePlan(snap([decline, allow], { cmpHint: 'cookiebot' }), settings({ policy: 'accept_all' }));
    expect(plan?.steps).toEqual([{ type: 'click', key: allow.key }]);
  });

  it('quantcast: label-based reject', () => {
    const agree = el('AGREE');
    const reject = el('REJECT ALL');
    const plan = cmpRulePlan(snap([agree, reject], { cmpHint: 'quantcast' }), settings());
    expect(plan?.steps).toEqual([{ type: 'click', key: reject.key }]);
  });

  it('honours exclude set', () => {
    const manage = el('Cookies Settings', 'button', { id: 'onetrust-pc-btn-handler' });
    expect(cmpRulePlan(snap([manage], { cmpHint: 'onetrust' }), settings(), new Set([manage.key]))).toBeNull();
  });
});
