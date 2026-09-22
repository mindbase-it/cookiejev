/**
 * Turns a DialogSnapshot into OpenJev questions and OpenJev answers into an ActionPlan.
 * Pure functions; the HTTP call is injected so this stays unit-testable.
 */
import type { ActionPlan, Category, DialogSnapshot, Settings, SnapshotElement, Step } from '../shared/types';
import { desiredToggleState, elementLabel } from './heuristics';
import type { OpenJevAnswer, OpenJevQuestion } from './openjev-client';

const NONE = 'none';
const CATEGORY_KEYS: Category[] = ['necessary', 'analytics', 'marketing', 'personalization', 'functional', 'unknown'];

function isToggle(el: SnapshotElement): boolean {
  return (el.kind === 'checkbox' || el.kind === 'switch') && !el.disabled;
}
function isClickable(el: SnapshotElement): boolean {
  return (el.kind === 'button' || el.kind === 'link') && !el.disabled;
}

/** Compact, privacy-minimal textual state for the model. */
export function buildState(snapshot: DialogSnapshot): string {
  const lines: string[] = [];
  lines.push(`Cookie/consent dialog on a website. Page language: ${snapshot.lang || 'unknown'}. Round ${snapshot.round}.`);
  if (snapshot.cmpHint) lines.push(`Known consent platform: ${snapshot.cmpHint}.`);
  lines.push('Dialog text:');
  lines.push(snapshot.dialogText.slice(0, 1500));
  lines.push('Interactive elements:');
  for (const el of snapshot.elements) {
    const state = el.checked === undefined ? '' : el.checked ? ', checked' : ', unchecked';
    const dis = el.disabled ? ', disabled' : '';
    lines.push(`${el.key} [${el.kind}${state}${dis}] "${elementLabel(el).slice(0, 120)}"`);
  }
  return lines.join('\n');
}

function policyText(settings: Settings): string {
  switch (settings.policy) {
    case 'reject_all':
      return 'The user wants to REJECT all non-essential cookies (analytics, marketing, personalization, functional) and keep only strictly necessary ones.';
    case 'accept_all':
      return 'The user wants to ACCEPT all cookies.';
    case 'custom': {
      const on = Object.entries(settings.custom).filter(([, v]) => v).map(([k]) => k);
      const off = Object.entries(settings.custom).filter(([, v]) => !v).map(([k]) => k);
      return `The user wants to ALLOW these cookie categories: ${on.join(', ') || 'none'}; and REJECT these: ${off.join(', ') || 'none'}.`;
    }
  }
}

export function buildQuestions(snapshot: DialogSnapshot, settings: Settings, exclude: Set<string>): Record<string, OpenJevQuestion> {
  const q: Record<string, OpenJevQuestion> = {};
  const clickable = snapshot.elements.filter((e) => isClickable(e) && !exclude.has(e.key));
  const toggles = snapshot.elements.filter(isToggle);
  const criteria: Record<string, string | null> = { [NONE]: 'No element fits' };
  for (const el of clickable) criteria[el.key] = elementLabel(el).slice(0, 120) || null;

  if (!snapshot.cmpHint) {
    q.is_consent = {
      type: 'noul',
      instructions: 'Is this dialog asking the visitor to accept or reject cookies / tracking / privacy consent?',
    };
  }
  const p = policyText(settings);
  if (clickable.length > 0) {
    if (settings.policy === 'accept_all') {
      q.accept_button = { type: 'choice', instructions: `${p} Which element accepts all cookies with one click?`, criteria };
    } else {
      q.reject_button = {
        type: 'choice',
        instructions: `${p} Which single element rejects / declines all non-essential cookies directly (e.g. "Reject all", "Only necessary", "Continue without accepting")? Choose "none" if there is no such element. Never choose an element that accepts cookies.`,
        criteria,
      };
      q.manage_button = {
        type: 'choice',
        instructions: `${p} Which element opens the detailed cookie settings / preferences / purposes where individual categories can be switched off? Choose "none" if there is no such element.`,
        criteria,
      };
      if (toggles.length > 0) {
        q.save_button = {
          type: 'choice',
          instructions: `${p} The category toggles will be set first. Which element then saves / confirms the current selection WITHOUT accepting everything? Choose "none" if there is no such element.`,
          criteria,
        };
      }
    }
  }
  for (const t of toggles) {
    const cat: Record<string, string | null> = {};
    for (const c of CATEGORY_KEYS) cat[c] = null;
    q[`toggle_${t.key}`] = {
      type: 'choice',
      instructions: `Which consent category does the toggle ${t.key} ("${elementLabel(t).slice(0, 120)}") control?`,
      criteria: cat,
    };
  }
  return q;
}

function choice(answers: Record<string, OpenJevAnswer>, id: string): { key: string; confidence: number } | null {
  const a = answers[id];
  if (!a || a.type !== 'choice') return null;
  return { key: a.choice, confidence: a.confidence };
}

export interface OpenJevDecision {
  plan: ActionPlan | null;
  /** Probability that this is a consent dialog (1 when cmpHint known or question absent). */
  consentProbability: number;
  reason: string;
}

export function decisionFromAnswers(
  snapshot: DialogSnapshot,
  settings: Settings,
  answers: Record<string, OpenJevAnswer>,
  threshold: number,
): OpenJevDecision {
  const isConsent = answers.is_consent;
  const consentProbability = isConsent && isConsent.type === 'noul' ? isConsent.noul : 1;
  if (consentProbability < 0.6) return { plan: null, consentProbability, reason: `not a consent dialog (p=${consentProbability.toFixed(2)})` };

  const byKey = new Map(snapshot.elements.map((e) => [e.key, e]));
  const valid = (c: { key: string; confidence: number } | null) =>
    c && c.key !== NONE && byKey.has(c.key) && !byKey.get(c.key)!.disabled && c.confidence >= threshold ? c : null;

  if (settings.policy === 'accept_all') {
    const accept = valid(choice(answers, 'accept_button'));
    if (accept) {
      return { plan: { steps: [{ type: 'click', key: accept.key }], source: 'openjev', confidence: accept.confidence, expectMoreRounds: false, reason: `openjev accept ${accept.key}` }, consentProbability, reason: 'ok' };
    }
    return { plan: null, consentProbability, reason: 'no confident accept button' };
  }

  const toggles = snapshot.elements.filter(isToggle);
  const reject = valid(choice(answers, 'reject_button'));
  if (reject && settings.policy === 'reject_all') {
    return { plan: { steps: [{ type: 'click', key: reject.key }], source: 'openjev', confidence: reject.confidence, expectMoreRounds: false, reason: `openjev reject ${reject.key}` }, consentProbability, reason: 'ok' };
  }

  if (toggles.length > 0) {
    const steps: Step[] = [];
    let confSum = 0;
    let n = 0;
    for (const t of toggles) {
      const c = choice(answers, `toggle_${t.key}`);
      if (!c) continue;
      const category = (CATEGORY_KEYS as string[]).includes(c.key) ? (c.key as Category) : 'unknown';
      const desired = desiredToggleState(category, settings);
      confSum += c.confidence;
      n++;
      if (desired === null) continue;
      if ((t.checked === true) !== desired) steps.push({ type: 'setToggle', key: t.key, on: desired });
    }
    const save = valid(choice(answers, 'save_button'));
    if (save) {
      const conf = n > 0 ? Math.min(save.confidence, confSum / n) : save.confidence;
      return { plan: { steps: [...steps, { type: 'click', key: save.key }], source: 'openjev', confidence: conf, expectMoreRounds: false, reason: `openjev toggles(${steps.length}) + save ${save.key}` }, consentProbability, reason: 'ok' };
    }
    if (reject) {
      return { plan: { steps: [{ type: 'click', key: reject.key }], source: 'openjev', confidence: reject.confidence, expectMoreRounds: false, reason: `openjev reject ${reject.key}` }, consentProbability, reason: 'ok' };
    }
  }

  if (reject) {
    // custom policy without toggles: a direct reject is still the best available action.
    return { plan: { steps: [{ type: 'click', key: reject.key }], source: 'openjev', confidence: reject.confidence, expectMoreRounds: false, reason: `openjev reject ${reject.key}` }, consentProbability, reason: 'ok' };
  }
  const manage = valid(choice(answers, 'manage_button'));
  if (manage) {
    return { plan: { steps: [{ type: 'click', key: manage.key }], source: 'openjev', confidence: manage.confidence, expectMoreRounds: true, reason: `openjev manage ${manage.key}` }, consentProbability, reason: 'ok' };
  }
  return { plan: null, consentProbability, reason: 'no confident action' };
}
