import { describe, expect, it, vi } from 'vitest';
import { ApiError, type QbankClient } from '../api/qbankClient';
import type { KeyValueStore } from '../state/storage';
import { meta, rawListRecord, rawStandardMcq } from '../test/fixtures';
import { QuestionFormatError } from './normalize';
import { createQuestionRepository, isQuestionUnavailableError } from './repository';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function fakeClient(overrides: Partial<QbankClient> = {}): QbankClient {
  return {
    getQuestionList: vi.fn(async () => [
      rawListRecord({ questionId: 'a1', skill_cd: 'CID', difficulty: 'E' }),
      rawListRecord({ questionId: 'a2', skill_cd: 'INF', skill_desc: 'Inferences', difficulty: 'H' }),
      rawListRecord({ questionId: 'a3', primary_class_cd: 'CAS', primary_class_cd_desc: 'Craft and Structure', skill_cd: 'WIC', skill_desc: 'Words in Context' }),
      { broken: true },
    ]),
    getQuestionDetail: vi.fn(async () => rawStandardMcq({ externalid: undefined })),
    ...overrides,
  };
}

describe('question repository', () => {
  it('requests every documented domain for the subject', async () => {
    const client = fakeClient();
    await createQuestionRepository({ client, store: null }).loadCatalog('rw');
    expect(client.getQuestionList).toHaveBeenCalledWith(1, ['INI', 'CAS', 'EOI', 'SEC']);
    const math = fakeClient();
    await createQuestionRepository({ client: math, store: null }).loadCatalog('math');
    expect(math.getQuestionList).toHaveBeenCalledWith(2, ['H', 'P', 'Q', 'S']);
  });

  it('builds a catalog and counts malformed records', async () => {
    const catalog = await createQuestionRepository({ client: fakeClient(), store: null }).loadCatalog('rw');
    expect(catalog.questions.map((q) => q.questionId)).toEqual(['a1', 'a2', 'a3']);
    expect(catalog.malformedCount).toBe(1);
    expect(catalog.domains.map((d) => d.code)).toEqual(['INI', 'CAS']);
  });

  it('caches catalogs in storage and reuses them until they expire', async () => {
    const store = memoryStore();
    let now = 1_000_000;
    const first = fakeClient();
    await createQuestionRepository({ client: first, store, now: () => now }).loadCatalog('rw');
    expect(store.data.size).toBe(1);

    const second = fakeClient();
    const cached = await createQuestionRepository({ client: second, store, now: () => now }).loadCatalog('rw');
    expect(second.getQuestionList).not.toHaveBeenCalled();
    expect(cached.questions.map((q) => q.questionId)).toEqual(['a1', 'a2', 'a3']);
    expect(cached.questions[1]).toMatchObject({ skillName: 'Inferences', difficulty: 'H', domainCode: 'INI' });

    now += 13 * 60 * 60 * 1000;
    const third = fakeClient();
    await createQuestionRepository({ client: third, store, now: () => now }).loadCatalog('rw');
    expect(third.getQuestionList).toHaveBeenCalledTimes(1);
  });

  it('refetches on demand and ignores corrupt cache entries', async () => {
    const store = memoryStore();
    store.setItem('studysat.catalog.v1.rw', '{not json');
    const client = fakeClient();
    const repo = createQuestionRepository({ client, store });
    await repo.loadCatalog('rw');
    await repo.loadCatalog('rw', { forceRefresh: true });
    expect(client.getQuestionList).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when the list cannot be read at all', async () => {
    const client = fakeClient({ getQuestionList: vi.fn(async () => [{ junk: 1 }, { junk: 2 }]) });
    await expect(createQuestionRepository({ client, store: null }).loadCatalog('rw')).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('caches question details and deduplicates concurrent requests', async () => {
    const client = fakeClient();
    const repo = createQuestionRepository({ client, store: null });
    const m = meta({ fetchId: 'ext-1' });
    const [a, b] = await Promise.all([repo.loadQuestion(m), repo.loadQuestion(m)]);
    await repo.loadQuestion(m);
    expect(a).toBe(b);
    expect(client.getQuestionDetail).toHaveBeenCalledTimes(1);
    expect(client.getQuestionDetail).toHaveBeenCalledWith('ext-1');
  });
});

describe('cancellation', () => {
  it('lets one caller stop waiting without cancelling the shared request for others', async () => {
    let finish: (value: Record<string, unknown>) => void = () => {};
    const client = fakeClient({
      getQuestionDetail: vi.fn(() => new Promise<Record<string, unknown>>((resolve) => (finish = resolve))),
    });
    const repo = createQuestionRepository({ client, store: null });
    const m = meta({ fetchId: 'ext-1' });
    const controller = new AbortController();
    const first = repo.loadQuestion(m, { signal: controller.signal });
    const second = repo.loadQuestion(m);
    controller.abort();
    finish(rawStandardMcq({ externalid: undefined }));
    await expect(first).rejects.toMatchObject({ kind: 'aborted' });
    await expect(second).resolves.toMatchObject({ kind: 'mcq' });
    // The finished request was cached for later callers.
    await repo.loadQuestion(m);
    expect(client.getQuestionDetail).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const repo = createQuestionRepository({ client: fakeClient(), store: null });
    await expect(repo.loadQuestion(meta(), { signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('isQuestionUnavailableError', () => {
  it('distinguishes bad question data from connection problems', () => {
    expect(isQuestionUnavailableError(new QuestionFormatError('unsupported', 'x', 'no key'))).toBe(true);
    expect(isQuestionUnavailableError(new ApiError('not-found', 'gone'))).toBe(true);
    expect(isQuestionUnavailableError(new ApiError('malformed', 'bad json'))).toBe(true);
    expect(isQuestionUnavailableError(new ApiError('network', 'offline'))).toBe(false);
    expect(isQuestionUnavailableError(new ApiError('rate-limited', 'slow down'))).toBe(false);
    expect(isQuestionUnavailableError(new Error('other'))).toBe(false);
  });
});
