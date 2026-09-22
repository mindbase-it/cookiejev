import { describe, expect, it, vi } from 'vitest';
import { OpenJevClient, OpenJevError } from '../../src/engine/openjev-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('OpenJevClient.ask', () => {
  it('posts to /v1/systemone with bearer token and parses answers', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        id: 'shim-1',
        model: 'openjev',
        answers: {
          reject_button: { type: 'choice', choice: 'e2', probabilities: { e1: 0.1, e2: 0.9 }, confidence: 0.9 },
          is_consent: { type: 'noul', noul: 0.97 },
          junk: { type: 'weird' },
        },
      }),
    );
    const client = new OpenJevClient({ endpoint: 'http://localhost:3000/', token: 'abc', fetchFn: fetchFn as unknown as typeof fetch });
    const res = await client.ask('state', { reject_button: { type: 'choice', instructions: 'x', criteria: { e1: null, e2: null } } });
    expect(res.model).toBe('openjev');
    expect(res.answers.reject_button).toEqual({ type: 'choice', choice: 'e2', probabilities: { e1: 0.1, e2: 0.9 }, confidence: 0.9 });
    expect(res.answers.is_consent).toEqual({ type: 'noul', noul: 0.97 });
    expect(res.answers.junk).toBeUndefined();

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/v1/systemone');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer abc');
    const body = JSON.parse(init!.body as string);
    expect(body.state).toBe('state');
    expect(body.questions.reject_button.type).toBe('choice');
  });

  it('derives confidence from probabilities when missing', async () => {
    const fetchFn = async () => jsonResponse({ answers: { q: { type: 'choice', choice: 'a', probabilities: { a: 0.7, b: 0.3 } } } });
    const client = new OpenJevClient({ endpoint: 'http://x', fetchFn: fetchFn as unknown as typeof fetch });
    const res = await client.ask('s', { q: { type: 'choice', instructions: 'i', criteria: { a: null, b: null } } });
    expect(res.answers.q).toMatchObject({ confidence: 0.7 });
  });

  it('maps 401 to auth error', async () => {
    const fetchFn = async () => jsonResponse({ error: { code: 401, message: 'nope' } }, 401);
    const client = new OpenJevClient({ endpoint: 'http://x', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.ask('s', {})).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps 500 to http error and invalid JSON to bad-response', async () => {
    const c1 = new OpenJevClient({ endpoint: 'http://x', fetchFn: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch });
    await expect(c1.ask('s', {})).rejects.toMatchObject({ kind: 'http' });
    const c2 = new OpenJevClient({ endpoint: 'http://x', fetchFn: (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch });
    await expect(c2.ask('s', {})).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('maps fetch rejection to network error', async () => {
    const fetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    const client = new OpenJevClient({ endpoint: 'http://x', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.ask('s', {})).rejects.toBeInstanceOf(OpenJevError);
    await expect(client.ask('s', {})).rejects.toMatchObject({ kind: 'network' });
  });

  it('times out via AbortController', async () => {
    const fetchFn = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const client = new OpenJevClient({ endpoint: 'http://x', timeoutMs: 10, fetchFn: fetchFn as unknown as typeof fetch });
    await expect(client.ask('s', {})).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('version() reads model_dir', async () => {
    const fetchFn = async () => jsonResponse({ model_dir: '/models/openjev', T: 1.2 });
    const client = new OpenJevClient({ endpoint: 'http://x', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await client.version()).toEqual({ model: '/models/openjev' });
  });
});
