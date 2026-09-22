/**
 * Minimal client for the OpenJev "systemone" decision API.
 * POST {endpoint}/v1/systemone  { state, questions } → { answers }
 */

export type OpenJevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'noul'; instructions: string; criteria?: { true: string | null; false: string | null } }
  | { type: 'score'; instructions: string; criteria: string[] };

export type OpenJevAnswer =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'noul'; noul: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number };

export interface OpenJevResponse {
  id?: string;
  model?: string;
  answers: Record<string, OpenJevAnswer>;
}

export type OpenJevErrorKind = 'network' | 'timeout' | 'auth' | 'http' | 'bad-response';

export class OpenJevError extends Error {
  constructor(
    public readonly kind: OpenJevErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'OpenJevError';
  }
}

export interface OpenJevClientOptions {
  endpoint: string;
  token?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseAnswer(raw: unknown): OpenJevAnswer | null {
  if (!isRecord(raw)) return null;
  if (raw.type === 'choice' && typeof raw.choice === 'string' && isRecord(raw.probabilities)) {
    const probabilities: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.probabilities)) if (typeof v === 'number') probabilities[k] = v;
    const confidence = typeof raw.confidence === 'number' ? raw.confidence : (probabilities[raw.choice] ?? 0);
    return { type: 'choice', choice: raw.choice, probabilities, confidence };
  }
  if (raw.type === 'noul' && typeof raw.noul === 'number') return { type: 'noul', noul: raw.noul };
  if (raw.type === 'score' && typeof raw.score === 'number' && isRecord(raw.probabilities)) {
    const probabilities: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.probabilities)) if (typeof v === 'number') probabilities[k] = v;
    return { type: 'score', score: raw.score, probabilities, confidence: typeof raw.confidence === 'number' ? raw.confidence : 0 };
  }
  return null;
}

export class OpenJevClient {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OpenJevClientOptions) {
    this.endpoint = opts.endpoint.replace(/\/+$/, '');
    this.token = opts.token ?? '';
    this.timeoutMs = opts.timeoutMs ?? 2500;
    // Never store the bare global `fetch`: calling it with `this` bound to the client throws
    // "Illegal invocation" in service workers.
    this.fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchFn(this.endpoint + path, { ...init, headers: this.headers(), signal: controller.signal });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') throw new OpenJevError('timeout', `OpenJev timeout after ${this.timeoutMs} ms`);
      throw new OpenJevError('network', e?.message ?? 'network error');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new OpenJevError('auth', `OpenJev auth failed (${res.status})`);
    if (!res.ok) throw new OpenJevError('http', `OpenJev HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new OpenJevError('bad-response', 'OpenJev returned invalid JSON');
    }
  }

  async ask(state: string, questions: Record<string, OpenJevQuestion>): Promise<OpenJevResponse> {
    const body = JSON.stringify({ model: 'openjev', state, questions });
    const json = await this.request('/v1/systemone', { method: 'POST', body });
    if (!isRecord(json) || !isRecord(json.answers)) throw new OpenJevError('bad-response', 'OpenJev response has no answers');
    const answers: Record<string, OpenJevAnswer> = {};
    for (const [k, v] of Object.entries(json.answers)) {
      const a = parseAnswer(v);
      if (a) answers[k] = a;
    }
    return { answers, ...(typeof json.id === 'string' ? { id: json.id } : {}), ...(typeof json.model === 'string' ? { model: json.model } : {}) };
  }

  /** GET /v1/version — used by the options page "test connection". */
  async version(): Promise<{ model: string }> {
    const json = await this.request('/v1/version', { method: 'GET' });
    if (!isRecord(json)) throw new OpenJevError('bad-response', 'OpenJev version response invalid');
    const model = typeof json.model_dir === 'string' ? json.model_dir : typeof json.model === 'string' ? json.model : 'openjev';
    return { model };
  }
}
