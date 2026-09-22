import { beforeEach, describe, expect, it } from 'vitest';
import { classifyCategory, classifyIntent, heuristicPlan, looksLikeConsentDialog, scoreAgainst } from '../../src/engine/heuristics';
import { normalize } from '../../src/shared/keywords';
import { el, resetKeys, settings, snap, toggle } from './helpers';

beforeEach(resetKeys);

describe('normalize', () => {
  it('strips diacritics, case and punctuation', () => {
    expect(normalize('  Odmítnout VŠE!  ')).toBe('odmitnout vse');
    expect(normalize("J’accepte")).toBe("j'accepte");
  });
});

describe('scoreAgainst', () => {
  it('returns 1 for exact match, partial for contained phrase, 0 otherwise', () => {
    expect(scoreAgainst('Reject all', ['reject all'])).toBe(1);
    expect(scoreAgainst('Reject all cookies now', ['reject all'])).toBeGreaterThan(0.5);
    expect(scoreAgainst('Rejected', ['reject'])).toBe(0);
    expect(scoreAgainst('Learn more', ['reject'])).toBe(0);
  });
});

describe('classifyIntent', () => {
  const cases: Array<[string, string]> = [
    ['Reject all', 'reject'],
    ['Odmítnout vše', 'reject'],
    ['Alle ablehnen', 'reject'],
    ['Tout refuser', 'reject'],
    ['Rifiuta tutto', 'reject'],
    ['Rechazar todo', 'reject'],
    ['Odrzuć wszystkie', 'reject'],
    ['Continue without accepting', 'reject'],
    ['Only necessary cookies', 'reject'],
    ['Pouze nezbytné', 'reject'],
    ['Accept all', 'accept'],
    ['Přijmout vše', 'accept'],
    ['Alle akzeptieren', 'accept'],
    ['OK', 'accept'],
    ['Souhlasím', 'accept'],
    ['Save & exit', 'save'],
    ['Uložit nastavení', 'save'],
    ['Auswahl speichern', 'save'],
    ['Allow selection', 'save'],
    ['Cookie settings', 'manage'],
    ['Nastavení cookies', 'manage'],
    ['Manage preferences', 'manage'],
    ['Einstellungen', 'manage'],
    ['Learn more about our partners', 'other'],
  ];
  for (const [label, intent] of cases) {
    it(`"${label}" → ${intent}`, () => {
      expect(classifyIntent(el(label)).intent).toBe(intent);
    });
  }
});

describe('classifyCategory', () => {
  it('maps multilingual labels to categories', () => {
    expect(classifyCategory('Strictly necessary cookies')).toBe('necessary');
    expect(classifyCategory('Nezbytné cookies')).toBe('necessary');
    expect(classifyCategory('Analytics cookies')).toBe('analytics');
    expect(classifyCategory('Statistik')).toBe('analytics');
    expect(classifyCategory('Marketingové cookies')).toBe('marketing');
    expect(classifyCategory('Werbung')).toBe('marketing');
    expect(classifyCategory('Personalizace obsahu')).toBe('personalization');
    expect(classifyCategory('Functional cookies')).toBe('functional');
    expect(classifyCategory('Something odd')).toBe('unknown');
  });
});

describe('looksLikeConsentDialog', () => {
  it('requires a topic word and a control', () => {
    expect(looksLikeConsentDialog(snap([el('OK')], { dialogText: 'Používáme soubory cookie.' }))).toBe(true);
    expect(looksLikeConsentDialog(snap([el('OK')], { dialogText: 'Subscribe to our newsletter!' }))).toBe(false);
    expect(looksLikeConsentDialog(snap([], { dialogText: 'cookies' }))).toBe(false);
    expect(looksLikeConsentDialog(snap([el('x')], { dialogText: 'irrelevant', cmpHint: 'onetrust' }))).toBe(true);
  });
});

describe('heuristicPlan — reject_all', () => {
  it('clicks the reject button and never the accept button', () => {
    const accept = el('Accept all');
    const reject = el('Reject all');
    const plan = heuristicPlan(snap([accept, reject]), settings());
    expect(plan?.steps).toEqual([{ type: 'click', key: reject.key }]);
    expect(plan?.expectMoreRounds).toBe(false);
  });

  it('prefers a clear reject over accept even in Czech', () => {
    const a = el('Přijmout vše');
    const r = el('Odmítnout');
    expect(heuristicPlan(snap([a, r]), settings())?.steps).toEqual([{ type: 'click', key: r.key }]);
  });

  it('opens settings when there is no reject button', () => {
    const a = el('Accept all');
    const m = el('Cookie settings');
    const plan = heuristicPlan(snap([a, m]), settings());
    expect(plan?.steps).toEqual([{ type: 'click', key: m.key }]);
    expect(plan?.expectMoreRounds).toBe(true);
  });

  it('returns null when only accept exists', () => {
    expect(heuristicPlan(snap([el('Accept all'), el('OK')]), settings())).toBeNull();
  });

  it('turns off non-essential toggles and saves', () => {
    const t1 = toggle('Necessary', true, { disabled: true });
    const t2 = toggle('Analytics', true);
    const t3 = toggle('Marketing', false);
    const t4 = toggle('Personalization', true);
    const save = el('Save preferences');
    const accept = el('Accept all');
    const plan = heuristicPlan(snap([t1, t2, t3, t4, save, accept], { round: 2 }), settings());
    expect(plan?.steps).toEqual([
      { type: 'setToggle', key: t2.key, on: false },
      { type: 'setToggle', key: t4.key, on: false },
      { type: 'click', key: save.key },
    ]);
  });

  it('respects excluded keys from earlier rounds', () => {
    const m = el('Settings');
    const a = el('Accept');
    expect(heuristicPlan(snap([m, a]), settings(), new Set([m.key]))).toBeNull();
  });
});

describe('heuristicPlan — custom', () => {
  it('keeps allowed categories on and turns others off', () => {
    const analytics = toggle('Analytics', false);
    const marketing = toggle('Marketing', true);
    const save = el('Confirm my choices');
    const s = settings({ policy: 'custom', custom: { analytics: true, marketing: false, personalization: false, functional: false } });
    const plan = heuristicPlan(snap([analytics, marketing, save], { round: 2 }), s);
    expect(plan?.steps).toEqual([
      { type: 'setToggle', key: analytics.key, on: true },
      { type: 'setToggle', key: marketing.key, on: false },
      { type: 'click', key: save.key },
    ]);
  });
});

describe('heuristicPlan — accept_all', () => {
  it('clicks accept', () => {
    const a = el('Alle akzeptieren');
    const r = el('Ablehnen');
    expect(heuristicPlan(snap([r, a]), settings({ policy: 'accept_all' }))?.steps).toEqual([{ type: 'click', key: a.key }]);
  });
});

describe('heuristicPlan — Polish wording (wp.pl / onet.pl)', () => {
  it('picks "Odrzucam…" over "Akceptuję i przechodzę do serwisu"', () => {
    const accept = el('Akceptuję i przechodzę do serwisu');
    const reject = el('Odrzucam i chcę dowiedzieć się więcej');
    const plan = heuristicPlan(snap([accept, reject], { dialogText: 'Cenimy Twoją prywatność. Kliknij, aby wyrazić zgodę.' }), settings());
    expect(plan?.steps).toEqual([{ type: 'click', key: reject.key }]);
  });
  it('recognises inflected Polish consent text as a consent dialog', () => {
    const s = snap([el('PRZEJDŹ DO SERWISU'), el('USTAWIENIA ZAAWANSOWANE')], { dialogText: 'Klikając „Przejdź do serwisu” udzielasz zgody na przetwarzanie Twoich danych osobowych' });
    expect(looksLikeConsentDialog(s)).toBe(true);
    expect(heuristicPlan(s, settings())?.expectMoreRounds).toBe(true);
  });
});
