import type { ActionPlan, DialogSnapshot, Settings } from '../shared/types';
import { cmpRulePlan } from './cmp-rules';
import { heuristicPlan, looksLikeConsentDialog } from './heuristics';
import { OpenJevClient, OpenJevError } from './openjev-client';
import { buildQuestions, buildState, decisionFromAnswers } from './openjev-decider';
import { PlanCache, planKey } from './plan-cache';

export interface DecideInput {
  hostname: string;
  snapshot: DialogSnapshot;
  settings: Settings;
  /** Keys already clicked in earlier rounds on this page. */
  exclude?: Set<string>;
}

export interface DecideOutput {
  plan: ActionPlan | null;
  planKey: string;
  reason: string;
}

export interface DecisionEngineDeps {
  cache: PlanCache;
  /** Factory so settings changes take effect; null disables OpenJev. */
  clientFor: (settings: Settings) => OpenJevClient | null;
  now?: () => number;
  log?: (msg: string) => void;
  /** Called whenever the OpenJev error state changes (null = last call succeeded). */
  onOpenJevError?: (error: string | null) => void;
}

export const OPENJEV_BACKOFF_MS = 60_000;

export function policyKey(settings: Settings): string {
  if (settings.policy !== 'custom') return settings.policy;
  const c = settings.custom;
  return `custom:${+c.analytics}${+c.marketing}${+c.personalization}${+c.functional}`;
}

export class DecisionEngine {
  private openjevUnavailableUntil = 0;
  public lastOpenJevError: string | null = null;

  constructor(private readonly deps: DecisionEngineDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private log(msg: string): void {
    this.deps.log?.(msg);
  }

  async decide(input: DecideInput): Promise<DecideOutput> {
    const { hostname, snapshot, settings } = input;
    const exclude = input.exclude ?? new Set<string>();
    const key = planKey(hostname, snapshot, policyKey(settings));

    // T-1: cache
    const cached = await this.deps.cache.get(key);
    if (cached && cached.steps.every((s) => s.type === 'wait' || !exclude.has(s.key))) {
      return { plan: cached, planKey: key, reason: 'cache' };
    }

    // T0: deterministic CMP rules
    const ruled = cmpRulePlan(snapshot, settings, exclude);
    if (ruled) {
      await this.deps.cache.set(key, ruled);
      return { plan: ruled, planKey: key, reason: ruled.reason };
    }

    // Generic dialogs must at least look like consent before we spend a model call.
    // Later rounds belong to a flow that already passed this check (settings panes rarely say "cookie").
    if (snapshot.round <= 1 && !looksLikeConsentDialog(snapshot)) {
      return { plan: null, planKey: key, reason: 'not-consent' };
    }

    // T1: OpenJev
    const viaModel = await this.tryOpenJev(snapshot, settings, exclude);
    if (viaModel) {
      if (viaModel.plan) {
        await this.deps.cache.set(key, viaModel.plan);
        return { plan: viaModel.plan, planKey: key, reason: viaModel.plan.reason };
      }
      if (viaModel.consentProbability < 0.6) {
        return { plan: null, planKey: key, reason: 'not-consent' };
      }
      // model unsure → heuristics
    }

    // T2: heuristics
    const h = heuristicPlan(snapshot, settings, exclude);
    if (h) {
      if (h.confidence >= settings.confidenceThreshold) await this.deps.cache.set(key, h);
      return { plan: h, planKey: key, reason: h.reason };
    }
    return { plan: null, planKey: key, reason: viaModel ? viaModel.reason : 'no-plan' };
  }

  private async tryOpenJev(snapshot: DialogSnapshot, settings: Settings, exclude: Set<string>) {
    if (!settings.openjev.enabled) return null;
    if (this.now() < this.openjevUnavailableUntil) return null;
    const client = this.deps.clientFor(settings);
    if (!client) return null;
    const questions = buildQuestions(snapshot, settings, exclude);
    if (Object.keys(questions).length === 0) return null;
    const state = buildState(snapshot);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await client.ask(state, questions);
        this.lastOpenJevError = null;
        this.deps.onOpenJevError?.(null);
        return decisionFromAnswers(snapshot, settings, res.answers, settings.confidenceThreshold);
      } catch (err) {
        const e = err instanceof OpenJevError ? err : new OpenJevError('network', String(err));
        this.lastOpenJevError = `${e.kind}: ${e.message}`;
        this.deps.onOpenJevError?.(this.lastOpenJevError);
        this.log(`openjev ${e.kind}: ${e.message}`);
        if (e.kind === 'auth' || e.kind === 'network') {
          this.openjevUnavailableUntil = this.now() + OPENJEV_BACKOFF_MS;
          return null;
        }
        // timeout / http / bad-response → one retry
      }
    }
    this.openjevUnavailableUntil = this.now() + OPENJEV_BACKOFF_MS;
    return null;
  }

  async invalidate(key: string): Promise<void> {
    await this.deps.cache.invalidate(key);
  }
}
