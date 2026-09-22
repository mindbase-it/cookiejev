import {
  ACCEPT_PHRASES,
  CATEGORY_WORDS,
  CONFIRM_PHRASES,
  MANAGE_PHRASES,
  PAY_WORDS,
  REJECT_PHRASES,
  SAVE_PHRASES,
  hasTopicWord,
  normalize,
} from '../shared/keywords';
import type { ActionPlan, Category, DialogSnapshot, Settings, SnapshotElement, Step } from '../shared/types';

export type ButtonIntent = 'reject' | 'save' | 'manage' | 'accept' | 'other';

const NORMALIZED = {
  confirm: CONFIRM_PHRASES.map(normalize),
  reject: REJECT_PHRASES.map(normalize),
  save: SAVE_PHRASES.map(normalize),
  manage: MANAGE_PHRASES.map(normalize),
  accept: ACCEPT_PHRASES.map(normalize),
};

const NORMALIZED_CATEGORIES: Record<Exclude<Category, 'unknown'>, string[]> = {
  necessary: CATEGORY_WORDS.necessary.map(normalize),
  analytics: CATEGORY_WORDS.analytics.map(normalize),
  marketing: CATEGORY_WORDS.marketing.map(normalize),
  personalization: CATEGORY_WORDS.personalization.map(normalize),
  functional: CATEGORY_WORDS.functional.map(normalize),
};

function containsWholePhrase(haystack: string, phrase: string): boolean {
  const idx = haystack.indexOf(phrase);
  if (idx < 0) return false;
  const before = idx === 0 ? ' ' : haystack[idx - 1];
  const afterIdx = idx + phrase.length;
  const after = afterIdx >= haystack.length ? ' ' : haystack[afterIdx];
  return before === ' ' && after === ' ';
}

/** Best match of `text` against a phrase list: 1.0 exact, partial (0.5..0.9) for whole-phrase containment, else 0. */
export function scoreAgainst(text: string, phrases: string[]): number {
  const t = normalize(text);
  if (!t) return 0;
  let best = 0;
  for (const p of phrases) {
    if (!p) continue;
    if (t === p) return 1;
    if (containsWholePhrase(t, p)) {
      const ratio = p.length / t.length;
      best = Math.max(best, 0.5 + 0.4 * ratio);
    }
  }
  return best;
}

export function elementLabel(el: SnapshotElement): string {
  return (el.text || el.ariaLabel || '').trim();
}

export interface IntentScores {
  reject: number;
  save: number;
  manage: number;
  accept: number;
}

const PAY_NORMALIZED = PAY_WORDS.map(normalize).filter(Boolean);

/** True when a control label mentions paying / subscribing / a price. */
export function mentionsPayment(label: string): boolean {
  const raw = label.toLowerCase();
  if (/[€$£]|\d+[.,]\d{2}\s*(kč|czk|zł|pln|eur|usd|chf|ft|huf|sek|nok|dkk|ron)/u.test(raw)) return true;
  const t = normalize(label);
  return PAY_NORMALIZED.some((w) => containsWholePhrase(t, w));
}

export function scoreIntents(el: SnapshotElement): IntentScores {
  const label = elementLabel(el);
  if (mentionsPayment(label)) return { reject: 0, save: 0, manage: 0, accept: 0 };
  const penalty = el.kind === 'link' ? 0.9 : 1;
  return {
    reject: scoreAgainst(label, NORMALIZED.reject) * penalty,
    save: scoreAgainst(label, NORMALIZED.save) * penalty,
    manage: scoreAgainst(label, NORMALIZED.manage) * penalty,
    accept: scoreAgainst(label, NORMALIZED.accept) * penalty,
  };
}

/** Classifies a button/link label. Ties resolve reject > save > manage > accept. */
export function classifyIntent(el: SnapshotElement): { intent: ButtonIntent; score: number } {
  const s = scoreIntents(el);
  const order: ButtonIntent[] = ['reject', 'save', 'manage', 'accept'];
  let best: ButtonIntent = 'other';
  let bestScore = 0;
  for (const k of order) {
    const v = s[k as keyof IntentScores];
    if (v > bestScore) {
      best = k;
      bestScore = v;
    }
  }
  return bestScore >= 0.5 ? { intent: best, score: bestScore } : { intent: 'other', score: 0 };
}

/** Classifies a toggle/checkbox label into a consent category. Necessary wins when present. */
export function classifyCategory(label: string): Category {
  const t = normalize(label);
  if (!t) return 'unknown';
  const hits = (words: string[]) => words.filter((w) => containsWholePhrase(t, w)).length;
  if (hits(NORMALIZED_CATEGORIES.necessary) > 0) return 'necessary';
  const candidates: Array<[Category, number]> = [
    ['marketing', hits(NORMALIZED_CATEGORIES.marketing)],
    ['analytics', hits(NORMALIZED_CATEGORIES.analytics)],
    ['personalization', hits(NORMALIZED_CATEGORIES.personalization)],
    ['functional', hits(NORMALIZED_CATEGORIES.functional)],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  const top = candidates[0];
  return top && top[1] > 0 ? top[0] : 'unknown';
}

/** Desired toggle state for a category under the given settings; null = leave untouched. */
export function desiredToggleState(category: Category, settings: Settings): boolean | null {
  if (category === 'necessary') return null;
  switch (settings.policy) {
    case 'accept_all':
      return true;
    case 'reject_all':
      return false;
    case 'custom':
      if (category === 'unknown') return false;
      return settings.custom[category];
  }
}

/** True when the dialog text mentions cookies/consent in some EU language. */
export function looksLikeConsentDialog(snapshot: DialogSnapshot): boolean {
  if (snapshot.cmpHint) return true;
  const hasControl = snapshot.elements.some((e) => !e.disabled);
  return hasControl && hasTopicWord(snapshot.dialogText);
}

function isToggle(el: SnapshotElement): boolean {
  return (el.kind === 'checkbox' || el.kind === 'switch') && !el.disabled;
}

function isClickable(el: SnapshotElement): boolean {
  return (el.kind === 'button' || el.kind === 'link') && !el.disabled;
}

function best(
  elements: SnapshotElement[],
  intent: keyof IntentScores,
  exclude: Set<string>,
): { el: SnapshotElement; score: number } | null {
  let winner: { el: SnapshotElement; score: number } | null = null;
  for (const el of elements) {
    if (!isClickable(el) || exclude.has(el.key)) continue;
    const s = scoreIntents(el);
    const score = s[intent];
    if (score < 0.5) continue;
    // Never pick an element whose accept score dominates when we are looking for reject/save/manage.
    if (intent !== 'accept' && s.accept > score) continue;
    if (intent === 'accept' && s.reject > score) continue;
    if (!winner || score > winner.score) winner = { el, score };
  }
  return winner;
}

/** Plans toggles for the given settings; returns steps and how many toggles were changed. */
export function planToggles(elements: SnapshotElement[], settings: Settings): { steps: Step[]; touched: number; classified: number } {
  const steps: Step[] = [];
  let touched = 0;
  let classified = 0;
  for (const el of elements) {
    if (!isToggle(el)) continue;
    const category = classifyCategory(elementLabel(el));
    if (category !== 'unknown') classified++;
    const desired = desiredToggleState(category, settings);
    if (desired === null) continue;
    const current = el.checked === true;
    if (current !== desired) {
      steps.push({ type: 'setToggle', key: el.key, on: desired });
      touched++;
    }
  }
  return { steps, touched, classified };
}

/**
 * Keyword-based plan. Returns null when nothing safe can be done.
 * `exclude` holds keys already clicked in previous rounds.
 */
export function heuristicPlan(snapshot: DialogSnapshot, settings: Settings, exclude: Set<string> = new Set()): ActionPlan | null {
  const els = snapshot.elements;
  const toggles = els.filter(isToggle);

  // Post-consent confirmation ("We have received your choices — OK"): a later-round dialog with one button.
  if (snapshot.round > 1 && toggles.length === 0 && snapshot.dialogText.length <= 300) {
    const buttons = els.filter((e) => isClickable(e) && !exclude.has(e.key));
    const only = buttons.length === 1 ? buttons[0]! : null;
    if (only && !mentionsPayment(elementLabel(only)) && (scoreAgainst(elementLabel(only), NORMALIZED.confirm) >= 0.9 || scoreAgainst(elementLabel(only), NORMALIZED.accept) >= 0.9)) {
      return { steps: [{ type: 'click', key: only.key }], source: 'heuristic', confidence: 0.8, expectMoreRounds: false, reason: `confirmation: "${elementLabel(only)}"` };
    }
  }

  if (settings.policy === 'accept_all') {
    const accept = best(els, 'accept', exclude);
    if (accept) {
      return { steps: [{ type: 'click', key: accept.el.key }], source: 'heuristic', confidence: accept.score, expectMoreRounds: false, reason: `accept: "${elementLabel(accept.el)}"` };
    }
    return null;
  }

  // Reject-ish policies (reject_all, custom).
  if (toggles.length > 0) {
    const { steps, touched, classified } = planToggles(els, settings);
    const save = best(els, 'save', exclude);
    const reject = settings.policy === 'reject_all' ? best(els, 'reject', exclude) : null;
    // A direct reject button beats fiddling with toggles when the user wants everything off.
    if (reject && reject.score >= 0.9) {
      return { steps: [{ type: 'click', key: reject.el.key }], source: 'heuristic', confidence: reject.score, expectMoreRounds: false, reason: `reject: "${elementLabel(reject.el)}"` };
    }
    if (save) {
      const conf = classified > 0 ? Math.min(save.score, 0.6 + 0.3 * (classified / toggles.length)) : Math.min(save.score, 0.55);
      return { steps: [...steps, { type: 'click', key: save.el.key }], source: 'heuristic', confidence: conf, expectMoreRounds: false, reason: `toggles(${touched}) + save: "${elementLabel(save.el)}"` };
    }
    if (reject) {
      return { steps: [{ type: 'click', key: reject.el.key }], source: 'heuristic', confidence: reject.score, expectMoreRounds: false, reason: `reject: "${elementLabel(reject.el)}"` };
    }
    if (steps.length > 0) {
      return { steps, source: 'heuristic', confidence: 0.5, expectMoreRounds: true, reason: `toggles(${touched}) without save button` };
    }
    return null;
  }

  const reject = best(els, 'reject', exclude);
  if (reject) {
    return { steps: [{ type: 'click', key: reject.el.key }], source: 'heuristic', confidence: reject.score, expectMoreRounds: false, reason: `reject: "${elementLabel(reject.el)}"` };
  }
  const manage = best(els, 'manage', exclude);
  if (manage) {
    return { steps: [{ type: 'click', key: manage.el.key }], source: 'heuristic', confidence: Math.min(manage.score, 0.8), expectMoreRounds: true, reason: `manage: "${elementLabel(manage.el)}"` };
  }
  return null;
}
