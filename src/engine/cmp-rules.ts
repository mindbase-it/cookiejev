import type { ActionPlan, DialogSnapshot, Settings, SnapshotElement } from '../shared/types';
import { elementLabel, planToggles, scoreAgainst } from './heuristics';
import { SAVE_PHRASES, normalize } from '../shared/keywords';

/** Matches an element by id, class token, or normalized label. All given conditions must hold. */
export interface ElementMatcher {
  id?: string;
  classToken?: string;
  /** Any of these normalized labels equals the element label. */
  labelIn?: string[];
}

export interface CmpRule {
  id: string;
  /** Selectors of the dialog container; used by the content-script detector and as cmpHint. */
  containerSelectors: string[];
  /** Whether the container lives inside a shadow root (detector needs to pierce). */
  shadow?: boolean;
  reject?: ElementMatcher[];
  manage?: ElementMatcher[];
  save?: ElementMatcher[];
  accept?: ElementMatcher[];
}

export const CMP_RULES: CmpRule[] = [
  {
    id: 'onetrust',
    containerSelectors: ['#onetrust-banner-sdk', '#onetrust-consent-sdk', '#onetrust-pc-sdk'],
    reject: [{ id: 'onetrust-reject-all-handler' }, { classToken: 'ot-pc-refuse-all-handler' }],
    manage: [{ id: 'onetrust-pc-btn-handler' }],
    save: [{ classToken: 'save-preference-btn-handler' }],
    accept: [{ id: 'onetrust-accept-btn-handler' }, { id: 'accept-recommended-btn-handler' }],
  },
  {
    id: 'cookiebot',
    containerSelectors: ['#CybotCookiebotDialog', '#CookiebotWidget'],
    reject: [
      { id: 'CybotCookiebotDialogBodyButtonDecline' },
      { id: 'CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll' },
    ],
    manage: [{ id: 'CybotCookiebotDialogBodyLevelButtonCustomize' }, { id: 'CybotCookiebotDialogBodyButtonDetails' }],
    save: [{ id: 'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection' }],
    accept: [{ id: 'CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll' }, { id: 'CybotCookiebotDialogBodyButtonAccept' }],
  },
  {
    id: 'usercentrics',
    containerSelectors: ['#usercentrics-root', '#usercentrics-cmp-ui'],
    shadow: true,
    reject: [{ id: 'uc-deny-all-button' }, { classToken: 'uc-deny-all-button' }],
    manage: [{ id: 'uc-more-button' }, { classToken: 'uc-more-button' }],
    save: [{ id: 'uc-save-button' }, { classToken: 'uc-save-button' }],
    accept: [{ id: 'uc-accept-all-button' }, { classToken: 'uc-accept-all-button' }],
  },
  {
    id: 'didomi',
    containerSelectors: ['#didomi-host', '#didomi-popup'],
    reject: [{ id: 'didomi-notice-disagree-button' }, { classToken: 'didomi-continue-without-agreeing' }],
    manage: [{ id: 'didomi-notice-learn-more-button' }],
    save: [{ classToken: 'didomi-components-button--save' }],
    accept: [{ id: 'didomi-notice-agree-button' }],
  },
  {
    id: 'quantcast',
    containerSelectors: ['.qc-cmp2-container', '#qc-cmp2-container'],
    reject: [{ labelIn: ['reject all', 'disagree', 'reject'] }],
    manage: [{ labelIn: ['more options', 'manage options', 'partners', 'purposes'] }],
    save: [{ labelIn: ['save & exit', 'save and exit', 'save'] }],
    accept: [{ labelIn: ['agree', 'accept all', 'accept'] }],
  },
  {
    id: 'sourcepoint',
    containerSelectors: ['[id^="sp_message_container_"]', '.message-container', '#sp_message_iframe'],
    reject: [{ classToken: 'sp_choice_type_13' }, { labelIn: ['reject all', 'reject', 'decline'] }],
    manage: [{ classToken: 'sp_choice_type_12' }],
    save: [{ classToken: 'sp_choice_type_SAVE_AND_EXIT' }],
    accept: [{ classToken: 'sp_choice_type_11' }],
  },
  {
    id: 'klaro',
    containerSelectors: ['.klaro', '#klaro'],
    reject: [{ classToken: 'cm-btn-decline' }, { classToken: 'cn-decline' }],
    manage: [{ classToken: 'cm-btn-lern-more' }, { classToken: 'cn-learn-more' }],
    save: [{ classToken: 'cm-btn-accept' }],
    accept: [{ classToken: 'cm-btn-accept-all' }, { classToken: 'cn-accept-all' }],
  },
  {
    id: 'cookieyes',
    containerSelectors: ['.cky-consent-container', '.cky-modal', '#cookie-law-info-bar'],
    reject: [{ classToken: 'cky-btn-reject' }, { id: 'cookie_action_close_header_reject' }],
    manage: [{ classToken: 'cky-btn-customize' }],
    save: [{ classToken: 'cky-btn-preferences' }],
    accept: [{ classToken: 'cky-btn-accept' }, { id: 'cookie_action_close_header' }],
  },
  {
    id: 'tarteaucitron',
    containerSelectors: ['#tarteaucitronRoot', '#tarteaucitronAlertBig'],
    reject: [{ id: 'tarteaucitronAllDenied2' }, { id: 'tarteaucitronAllDenied' }],
    manage: [{ id: 'tarteaucitronCloseAlert' }, { id: 'tarteaucitronPersonalize' }],
    save: [{ id: 'tarteaucitronSaveButton' }],
    accept: [{ id: 'tarteaucitronPersonalize2' }, { id: 'tarteaucitronAllAllowed' }],
  },
  {
    id: 'osano',
    containerSelectors: ['.cc-window', '.osano-cm-window'],
    reject: [{ classToken: 'cc-deny' }, { classToken: 'osano-cm-denyAll' }],
    manage: [{ classToken: 'osano-cm-manage' }],
    save: [{ classToken: 'osano-cm-save' }],
    accept: [{ classToken: 'cc-allow' }, { classToken: 'osano-cm-acceptAll' }],
  },
  {
    id: 'complianz',
    containerSelectors: ['#cmplz-cookiebanner-container', '.cmplz-cookiebanner'],
    reject: [{ classToken: 'cmplz-deny' }],
    manage: [{ classToken: 'cmplz-manage-options' }],
    save: [{ classToken: 'cmplz-save-preferences' }],
    accept: [{ classToken: 'cmplz-accept' }],
  },
  {
    id: 'iubenda',
    containerSelectors: ['#iubenda-cs-banner', '.iubenda-cs-container'],
    reject: [{ classToken: 'iubenda-cs-reject-btn' }],
    manage: [{ classToken: 'iubenda-cs-customize-btn' }],
    save: [{ classToken: 'purposes-btn-apply' }],
    accept: [{ classToken: 'iubenda-cs-accept-btn' }],
  },
  {
    id: 'civic',
    containerSelectors: ['#ccc', '#ccc-module'],
    reject: [{ id: 'ccc-reject-settings' }, { id: 'ccc-notify-reject' }],
    manage: [{ id: 'ccc-notify-dismiss' }],
    save: [{ id: 'ccc-close' }],
    accept: [{ id: 'ccc-recommended-settings' }, { id: 'ccc-notify-accept' }],
  },
  {
    id: 'trustarc',
    containerSelectors: ['#truste-consent-track', '.truste_box_overlay', '#consent_blackbar'],
    reject: [{ id: 'truste-consent-required' }],
    manage: [{ id: 'truste-show-consent' }],
    accept: [{ id: 'truste-consent-button' }],
  },
  {
    id: 'cookiescript',
    containerSelectors: ['#cookiescript_injected', '#cookiescript_injected_wrapper'],
    reject: [{ id: 'cookiescript_reject' }],
    manage: [{ id: 'cookiescript_manage' }],
    save: [{ id: 'cookiescript_save' }],
    accept: [{ id: 'cookiescript_accept' }],
  },
  {
    id: 'termly',
    containerSelectors: ['#termly-code-snippet-support', '.t-consentPrompt'],
    reject: [{ classToken: 't-declineAllButton' }],
    manage: [{ classToken: 't-preference-button' }],
    save: [{ classToken: 't-saveButton' }],
    accept: [{ classToken: 't-allowAllButton' }],
  },
  {
    id: 'consentmanager',
    containerSelectors: ['#cmpbox', '#cmpbox2', '.cmpboxWelcome'],
    reject: [{ classToken: 'cmpboxbtnno' }, { id: 'cmpwelcomebtnno' }],
    manage: [{ classToken: 'cmpboxbtncustom' }, { id: 'cmpwelcomebtncustom' }],
    save: [{ classToken: 'cmpboxbtnsave' }],
    accept: [{ classToken: 'cmpboxbtnyes' }, { id: 'cmpwelcomebtnyes' }],
  },
  {
    id: 'borlabs',
    containerSelectors: ['#BorlabsCookieBox', '.BorlabsCookie'],
    reject: [{ classToken: '_brlbs-refuse-btn' }, { classToken: 'brlbs-cmpnt-refuse-btn' }],
    manage: [{ classToken: '_brlbs-btn-cookie-preference' }, { classToken: 'brlbs-cmpnt-manage-btn' }],
    save: [{ classToken: '_brlbs-btn-save' }, { classToken: 'brlbs-cmpnt-save-btn' }],
    accept: [{ classToken: '_brlbs-btn-accept-all' }, { classToken: 'brlbs-cmpnt-accept-all-btn' }],
  },
  {
    id: 'moove',
    containerSelectors: ['#moove_gdpr_cookie_info_bar', '#moove_gdpr_cookie_modal'],
    reject: [{ classToken: 'moove-gdpr-infobar-reject-btn' }],
    manage: [{ classToken: 'change-settings-button' }],
    save: [{ classToken: 'moove-gdpr-modal-save-settings' }],
    accept: [{ classToken: 'moove-gdpr-infobar-allow-all' }],
  },
  {
    id: 'seznam',
    containerSelectors: ['#szn-cmp-dialog-container', 'szn-cmp-dialog', '.szn-cmp-dialog-container'],
    shadow: true,
    reject: [{ labelIn: ['odmítnout vše', 'odmítnout', 'nesouhlasím', 'pouze nezbytné'] }],
    manage: [{ labelIn: ['nastavení', 'podrobné nastavení', 'upravit nastavení', 'nastavit'] }],
    save: [{ labelIn: ['uložit nastavení', 'uložit', 'potvrdit', 'uložit a zavřít'] }],
    accept: [{ labelIn: ['souhlasím', 'přijmout vše', 'rozumím a souhlasím'] }],
  },
  {
    id: 'google',
    containerSelectors: ['form[action*="consent.google"]', 'form[action*="consent.youtube"]', 'div[aria-modal="true"][data-consent]'],
    reject: [{ labelIn: ['reject all', 'odmitnout vse', 'alle ablehnen', 'tout refuser', 'rifiuta tutto', 'rechazar todo', 'odrzuc wszystko'] }],
    manage: [{ labelIn: ['more options', 'dalsi moznosti', 'weitere optionen', 'plus d\'options'] }],
    accept: [{ labelIn: ['accept all', 'prijmout vse', 'alle akzeptieren', 'tout accepter'] }],
  },
];

/** All container selectors that live in the light DOM (for querySelectorAll in the detector). */
export function lightDomContainerSelectors(): Array<{ cmpId: string; selector: string }> {
  const out: Array<{ cmpId: string; selector: string }> = [];
  for (const r of CMP_RULES) {
    for (const s of r.containerSelectors) out.push({ cmpId: r.id, selector: s });
  }
  return out;
}

export function ruleById(id: string): CmpRule | undefined {
  return CMP_RULES.find((r) => r.id === id);
}

function matches(el: SnapshotElement, m: ElementMatcher): boolean {
  if (m.id !== undefined && el.id !== m.id) return false;
  if (m.classToken !== undefined && !el.classes.split(' ').includes(m.classToken)) return false;
  if (m.labelIn !== undefined) {
    const label = normalize(elementLabel(el));
    if (!m.labelIn.map(normalize).includes(label)) return false;
  }
  return true;
}

function findMatch(elements: SnapshotElement[], matchers: ElementMatcher[] | undefined, exclude: Set<string>): SnapshotElement | null {
  if (!matchers) return null;
  for (const m of matchers) {
    const el = elements.find((e) => !e.disabled && !exclude.has(e.key) && matches(e, m));
    if (el) return el;
  }
  return null;
}

/** Deterministic plan from a known-CMP rule. Returns null when the rule does not apply to this snapshot. */
export function cmpRulePlan(snapshot: DialogSnapshot, settings: Settings, exclude: Set<string> = new Set()): ActionPlan | null {
  const rule = ruleById(snapshot.cmpHint);
  if (!rule) return null;
  const els = snapshot.elements;

  if (settings.policy === 'accept_all') {
    const accept = findMatch(els, rule.accept, exclude);
    return accept
      ? { steps: [{ type: 'click', key: accept.key }], source: 'cmp-rule', confidence: 0.98, expectMoreRounds: false, reason: `${rule.id}: accept` }
      : null;
  }

  const toggles = els.filter((e) => (e.kind === 'checkbox' || e.kind === 'switch') && !e.disabled);
  if (toggles.length > 0) {
    const { steps, touched } = planToggles(els, settings);
    let save = findMatch(els, rule.save, exclude);
    if (!save) {
      const savePhrases = SAVE_PHRASES.map(normalize);
      const candidate = els
        .filter((e) => (e.kind === 'button' || e.kind === 'link') && !e.disabled && !exclude.has(e.key))
        .map((e) => ({ e, s: scoreAgainst(elementLabel(e), savePhrases) }))
        .filter((x) => x.s >= 0.9)
        .sort((a, b) => b.s - a.s)[0];
      save = candidate ? candidate.e : null;
    }
    if (settings.policy === 'reject_all') {
      const reject = findMatch(els, rule.reject, exclude);
      if (reject) {
        return { steps: [{ type: 'click', key: reject.key }], source: 'cmp-rule', confidence: 0.98, expectMoreRounds: false, reason: `${rule.id}: reject` };
      }
    }
    if (save) {
      return { steps: [...steps, { type: 'click', key: save.key }], source: 'cmp-rule', confidence: 0.95, expectMoreRounds: false, reason: `${rule.id}: toggles(${touched}) + save` };
    }
    return null;
  }

  const reject = findMatch(els, rule.reject, exclude);
  if (reject) {
    return { steps: [{ type: 'click', key: reject.key }], source: 'cmp-rule', confidence: 0.98, expectMoreRounds: false, reason: `${rule.id}: reject` };
  }
  const manage = findMatch(els, rule.manage, exclude);
  if (manage) {
    return { steps: [{ type: 'click', key: manage.key }], source: 'cmp-rule', confidence: 0.9, expectMoreRounds: true, reason: `${rule.id}: manage` };
  }
  return null;
}
