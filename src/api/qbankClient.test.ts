import { describe, expect, it, vi } from 'vitest';
import { ApiError, ASSESSMENT_EVENT_ID, createQbankClient } from './qbankClient';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function makeClient(fetchImpl: typeof fetch, overrides = {}) {
  return createQbankClient({ baseUrl: 'https://api.test/qb/', fetchImpl, sleep: async () => {}, isOnline: () => true, ...overrides });
}

describe('qbank client', () => {
  it('sends the documented list request', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([]));
    await makeClient(fetchImpl).getQuestionList(1, ['INI', 'CAS', 'EOI']);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.test/qb/get-questions');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ asmtEventId: ASSESSMENT_EVENT_ID, test: 1, domain: 'INI,CAS,EOI' });
    expect(ASSESSMENT_EVENT_ID).toBe(99);
  });

  it('sends the documented detail request', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ stem: 'x' }));
    await makeClient(fetchImpl).getQuestionDetail('4e06110f');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.test/qb/get-question');
    expect(JSON.parse(init!.body as string)).toEqual({ external_id: '4e06110f' });
  });

  it('retries rate limiting and server errors, then succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(jsonResponse('', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse([{ ok: true }]));
    const result = await makeClient(fetchImpl, { sleep }).getQuestionList(2, ['H']);
    expect(result).toEqual([{ ok: true }]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000); // honors Retry-After
  });

  it('gives up after the configured number of attempts', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse('', { status: 429 }));
    await expect(makeClient(fetchImpl, { maxAttempts: 2 }).getQuestionList(2, ['H'])).rejects.toMatchObject({ kind: 'rate-limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps the HTTP-200 "NoSuchKey" error body to not-found without retrying', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ $fault: 'client', $metadata: { httpStatusCode: 404 }, name: 'NoSuchKey', message: 'The specified key does not exist.' }),
    );
    await expect(makeClient(fetchImpl).getQuestionDetail('missing')).rejects.toMatchObject({ kind: 'not-found' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports invalid JSON and unexpected shapes as malformed', async () => {
    await expect(makeClient(async () => jsonResponse('<html>')).getQuestionList(1, ['INI'])).rejects.toMatchObject({ kind: 'malformed' });
    await expect(makeClient(async () => jsonResponse({ not: 'a list' })).getQuestionList(1, ['INI'])).rejects.toMatchObject({
      kind: 'malformed',
    });
    await expect(makeClient(async () => jsonResponse([1, 2])).getQuestionDetail('x')).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('reports network failures after retrying', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await makeClient(fetchImpl).getQuestionList(1, ['INI']).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails fast when the browser is offline', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(makeClient(fetchImpl, { isOnline: () => false }).getQuestionList(1, ['INI'])).rejects.toMatchObject({ kind: 'offline' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse('', { status: 400 }));
    await expect(makeClient(fetchImpl).getQuestionDetail('x')).rejects.toMatchObject({ kind: 'bad-request' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent requests', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return jsonResponse({ stem: 'x' });
    });
    const client = makeClient(fetchImpl, { maxConcurrent: 2 });
    await Promise.all(Array.from({ length: 6 }, (_, i) => client.getQuestionDetail(String(i))));
    expect(peak).toBe(2);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const pending = makeClient(fetchImpl).getQuestionDetail('x', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });
});
