import { ApiError, qbankClient, type QbankClient } from '../api/qbankClient';
import { readJson, removeKey, STORAGE_KEYS, writeJson, type KeyValueStore } from '../state/storage';
import { buildSubjectCatalog } from './catalog';
import { normalizeQuestionDetail, normalizeQuestionList, QuestionFormatError } from './normalize';
import { SUBJECTS } from './taxonomy';
import type { Difficulty, Question, QuestionMeta, SubjectCatalog, SubjectId } from './types';

/**
 * Data access for the rest of the app: loads the question list for a subject
 * (cached in localStorage) and individual question details (cached in memory).
 */
export interface QuestionRepository {
  loadCatalog(subject: SubjectId, options?: { forceRefresh?: boolean; signal?: AbortSignal }): Promise<SubjectCatalog>;
  loadQuestion(meta: QuestionMeta, options?: { signal?: AbortSignal }): Promise<Question>;
}

export interface RepositoryOptions {
  client?: QbankClient;
  /** Where to cache question lists; null disables persistent caching. */
  store?: KeyValueStore | null;
  now?: () => number;
  catalogTtlMs?: number;
  detailCacheSize?: number;
}

const CATALOG_VERSION = 1;
const DEFAULT_CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

/** Compact on-disk form of a catalog: ~100 bytes per question instead of ~400. */
interface StoredCatalog {
  version: number;
  subject: SubjectId;
  fetchedAt: number;
  malformedCount: number;
  domains: Array<[code: string, name: string]>;
  skills: Array<[code: string, name: string, domainCode: string]>;
  rows: Array<
    [questionId: string, skillCode: string, difficulty: string, scoreBand: number, fetchId: string, format: 's' | 'l', updatedAt: number]
  >;
}

function toStored(catalog: SubjectCatalog): StoredCatalog {
  return {
    version: CATALOG_VERSION,
    subject: catalog.subject,
    fetchedAt: catalog.fetchedAt,
    malformedCount: catalog.malformedCount,
    domains: catalog.domains.map((d) => [d.code, d.name]),
    skills: catalog.domains.flatMap((d) => d.skills.map((s) => [s.code, s.name, d.code] as [string, string, string])),
    rows: catalog.questions.map((q) => [
      q.questionId,
      q.skillCode,
      q.difficulty ?? '',
      q.scoreBand ?? -1,
      q.fetchId,
      q.format === 'standard' ? 's' : 'l',
      q.updatedAt ?? 0,
    ]),
  };
}

function fromStored(stored: StoredCatalog, subject: SubjectId): SubjectCatalog | null {
  if (!stored || stored.version !== CATALOG_VERSION || stored.subject !== subject || !Array.isArray(stored.rows)) {
    return null;
  }
  const domainNames = new Map(stored.domains);
  const skills = new Map(stored.skills.map(([code, name, domainCode]) => [code, { name, domainCode }]));
  const questions: QuestionMeta[] = [];
  for (const [questionId, skillCode, difficulty, scoreBand, fetchId, format, updatedAt] of stored.rows) {
    const skill = skills.get(skillCode);
    if (!skill || !questionId || !fetchId) return null;
    questions.push({
      questionId,
      subject,
      domainCode: skill.domainCode,
      domainName: domainNames.get(skill.domainCode) ?? skill.domainCode,
      skillCode,
      skillName: skill.name,
      difficulty: (['E', 'M', 'H'].includes(difficulty) ? difficulty : null) as Difficulty | null,
      scoreBand: scoreBand >= 0 ? scoreBand : null,
      fetchId,
      format: format === 's' ? 'standard' : 'legacy',
      updatedAt: updatedAt || null,
    });
  }
  return buildSubjectCatalog(subject, questions, stored.malformedCount, stored.fetchedAt);
}

/**
 * True when an error means this particular question cannot be used (bad or
 * missing data), as opposed to a connection problem that affects everything.
 */
export function isQuestionUnavailableError(error: unknown): boolean {
  if (error instanceof QuestionFormatError) return true;
  return error instanceof ApiError && ['not-found', 'malformed', 'bad-request'].includes(error.kind);
}

/**
 * Lets one caller stop waiting for a shared request without cancelling it for
 * everyone else. The underlying request still finishes and fills the cache.
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ApiError('aborted', 'Request cancelled.'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ApiError('aborted', 'Request cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function createQuestionRepository(options: RepositoryOptions = {}): QuestionRepository {
  const client = options.client ?? qbankClient;
  const store = options.store;
  const now = options.now ?? Date.now;
  const ttl = options.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS;
  const detailCacheSize = options.detailCacheSize ?? 300;

  const catalogs = new Map<SubjectId, SubjectCatalog>();
  const catalogRequests = new Map<SubjectId, Promise<SubjectCatalog>>();
  const details = new Map<string, Question>();
  const detailRequests = new Map<string, Promise<Question>>();

  // An undefined store falls through to storage.ts's default (real localStorage).
  const read = <T,>(key: string) => readJson<T>(key, store);
  const write = (key: string, value: unknown) => writeJson(key, value, store);
  const remove = (key: string) => removeKey(key, store);

  async function fetchCatalog(subject: SubjectId): Promise<SubjectCatalog> {
    const definition = SUBJECTS[subject];
    const raw = await client.getQuestionList(
      definition.apiTestCode,
      definition.domains.map((d) => d.code),
    );
    const { questions, malformedCount } = normalizeQuestionList(raw, subject);
    if (questions.length === 0 && raw.length > 0) {
      throw new ApiError('malformed', 'The question bank returned a question list we could not read.');
    }
    const catalog = buildSubjectCatalog(subject, questions, malformedCount, now());
    if (!write(STORAGE_KEYS.catalog(subject), toStored(catalog))) remove(STORAGE_KEYS.catalog(subject));
    return catalog;
  }

  return {
    async loadCatalog(subject, { forceRefresh = false, signal } = {}) {
      if (!forceRefresh) {
        const inMemory = catalogs.get(subject);
        if (inMemory && now() - inMemory.fetchedAt < ttl) return inMemory;
        const stored = read<StoredCatalog>(STORAGE_KEYS.catalog(subject));
        const cached = stored ? fromStored(stored, subject) : null;
        if (cached && now() - cached.fetchedAt < ttl && cached.questions.length > 0) {
          catalogs.set(subject, cached);
          return cached;
        }
      }
      const pending = catalogRequests.get(subject);
      if (pending && !forceRefresh) return abortable(pending, signal);
      const request = fetchCatalog(subject)
        .then((catalog) => {
          catalogs.set(subject, catalog);
          return catalog;
        })
        .finally(() => catalogRequests.delete(subject));
      catalogRequests.set(subject, request);
      return abortable(request, signal);
    },

    async loadQuestion(meta, { signal } = {}) {
      const cached = details.get(meta.questionId);
      if (cached) {
        // Refresh LRU position.
        details.delete(meta.questionId);
        details.set(meta.questionId, cached);
        return cached;
      }
      // Requests are shared between callers, so they don't take any one caller's signal.
      const pending = detailRequests.get(meta.questionId);
      if (pending) return abortable(pending, signal);
      const request = client
        .getQuestionDetail(meta.fetchId)
        .then((raw) => {
          const question = normalizeQuestionDetail(raw, meta);
          details.set(meta.questionId, question);
          while (details.size > detailCacheSize) details.delete(details.keys().next().value!);
          return question;
        })
        .finally(() => detailRequests.delete(meta.questionId));
      detailRequests.set(meta.questionId, request);
      return abortable(request, signal);
    },
  };
}

/** Shared repository used by the app. */
export const questionRepository = createQuestionRepository();
