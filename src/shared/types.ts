/** Kind of interactive element found inside a consent dialog. */
export type ElementKind = 'button' | 'link' | 'checkbox' | 'switch' | 'radio';

/** One interactive element, described without any DOM reference. */
export interface SnapshotElement {
  /** Stable key within one snapshot (e.g. "e3"). */
  key: string;
  kind: ElementKind;
  tag: string;
  /** Element id attribute (max 80 chars) or "". */
  id: string;
  /** Space-separated class tokens (max 200 chars) or "". */
  classes: string;
  /** Visible text, trimmed, max 120 chars. */
  text: string;
  ariaLabel: string;
  /** Only for checkbox/switch/radio. */
  checked?: boolean;
  disabled: boolean;
}

/** Privacy-minimal description of a consent dialog. Never contains the page URL or cookies. */
export interface DialogSnapshot {
  /** Text content of the dialog, trimmed, max 1500 chars. */
  dialogText: string;
  /** Document language (html[lang]) or "". */
  lang: string;
  /** Known CMP identifier when the container matched a known selector, else "". */
  cmpHint: string;
  elements: SnapshotElement[];
  /** Round number within one page (1-based). */
  round: number;
}

export type Step =
  | { type: 'click'; key: string }
  | { type: 'setToggle'; key: string; on: boolean }
  | { type: 'wait'; ms: number };

export type DecisionSource = 'cmp-rule' | 'openjev' | 'heuristic' | 'cache';

export interface ActionPlan {
  steps: Step[];
  source: DecisionSource;
  confidence: number;
  /** True when the plan is expected to open a further dialog (settings) and another round is needed. */
  expectMoreRounds: boolean;
  /** Human-readable reason for popup/debugging. */
  reason: string;
}

export type Policy = 'reject_all' | 'accept_all' | 'custom';

export interface CustomCategories {
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  functional: boolean;
}

export interface OpenJevSettings {
  enabled: boolean;
  endpoint: string;
  token: string;
}

export interface Settings {
  enabled: boolean;
  policy: Policy;
  custom: CustomCategories;
  openjev: OpenJevSettings;
  confidenceThreshold: number;
  disabledHosts: string[];
  showBadge: boolean;
}

export type TabStatus =
  | { state: 'idle' }
  | { state: 'disabled-host' }
  | { state: 'handled'; source: DecisionSource; confidence: number; rounds: number; reason: string }
  | { state: 'not-consent' }
  | { state: 'failed'; reason: string };

export type Category = 'necessary' | 'analytics' | 'marketing' | 'personalization' | 'functional' | 'unknown';
