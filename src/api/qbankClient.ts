/**
 * Thin client for the two College Board question bank endpoints documented in
 * `documentation.txt`:
 *
 *   POST {base}/get-questions  {"asmtEventId":99,"test":<1|2>,"domain":"<codes>"}
 *   POST {base}/get-question   {"external_id":"<id>"}
 *
 * The API needs no credentials and answers with `Access-Control-Allow-Origin: *`,
 * so the browser calls it directly. The browser-specific headers in the
 * documentation's curl examples (origin, referer, sec-ch-ua, user-agent) are
 * set by the browser itself and cannot be overridden by page scripts.
 *
 * This module only does transport: retries, timeouts, concurrency limits and
 * error classification. It returns raw JSON; see `data/normalize.ts`.
 */

export const DEFAULT_API_BASE =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital';

/** Documented as "always 99"; identifies the SAT assessment in the question bank. */
export const ASSESSMENT_EVENT_ID = 99;

export type ApiErrorKind =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'server'
  | 'not-found'
  | 'bad-request'
  | 'malformed'
  | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(kind: ApiErrorKind, message: string, options: { status?: number; retryAfterMs?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }

  /** Whether trying the same request again later might succeed. */
  get isTransient(): boolean {
    return ['offline', 'network', 'timeout', 'rate-limited', 'server'].includes(this.kind);
  }
}

export interface QbankClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Maximum simultaneous requests; keeps us polite to an unofficial API. */
  maxConcurrent?: number;
  /** Attempts per request, including the first one. */
  maxAttempts?: number;
  timeoutMs?: number;
  /** Base delay for exponential backoff between attempts. */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isOnline?: () => boolean;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface QbankClient {
  /** Raw metadata list for one subject (`test` code) and a set of domain codes. */
  getQuestionList(testCode: 1 | 2, domainCodes: readonly string[], options?: RequestOptions): Promise<unknown[]>;
  /** Raw detail payload for one question. Accepts an `external_id` (or a legacy `ibn`). */
  getQuestionDetail(id: string, options?: RequestOptions): Promise<Record<string, unknown>>;
}

const MAX_RETRY_AFTER_MS = 15_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Simple FIFO semaphore. */
function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError' || error.name === 'TimeoutError'
    : (error as { name?: string })?.name === 'AbortError';
}

export function createQbankClient(options: QbankClientOptions = {}): QbankClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const backoffMs = options.backoffMs ?? 600;
  const sleep = options.sleep ?? defaultSleep;
  const isOnline = options.isOnline ?? defaultIsOnline;
  const limit = createLimiter(Math.max(1, options.maxConcurrent ?? 4));

  async function attempt(path: string, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
    if (!isOnline()) {
      throw new ApiError('offline', 'You appear to be offline. Check your connection and try again.');
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    let text: string;
    try {
      response = await fetchImpl(`${baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*' },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: 'omit',
      });
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled.', { cause: error });
      if (timedOut) throw new ApiError('timeout', 'The question bank took too long to respond.', { cause: error });
      if (isAbortError(error)) throw new ApiError('aborted', 'Request cancelled.', { cause: error });
      throw new ApiError('network', 'Could not reach the College Board question bank.', { cause: error });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    if (response.status === 429) {
      throw new ApiError('rate-limited', 'The question bank is limiting requests right now.', {
        status: 429,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      });
    }
    if (response.status === 404) {
      throw new ApiError('not-found', 'The question bank could not find that item.', { status: 404 });
    }
    if (response.status >= 500) {
      throw new ApiError('server', `The question bank returned an error (HTTP ${response.status}).`, {
        status: response.status,
      });
    }
    if (!response.ok) {
      throw new ApiError('bad-request', `The question bank rejected the request (HTTP ${response.status}).`, {
        status: response.status,
      });
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new ApiError('malformed', 'The question bank returned data that is not valid JSON.', { cause: error });
    }
    // Unknown ids come back as HTTP 200 with an S3-style error body, e.g.
    // {"$fault":"client","$metadata":{"httpStatusCode":404},"name":"NoSuchKey",...}
    if (json && typeof json === 'object' && !Array.isArray(json) && '$fault' in json) {
      const meta = (json as { $metadata?: { httpStatusCode?: number } }).$metadata;
      const status = meta?.httpStatusCode;
      if (status === 404 || (json as { name?: string }).name === 'NoSuchKey') {
        throw new ApiError('not-found', 'The question bank could not find that item.', { status: 404 });
      }
      throw new ApiError(status && status >= 500 ? 'server' : 'bad-request', 'The question bank returned an error.', {
        status,
      });
    }
    return json;
  }

  async function request(path: string, body: unknown, signal: AbortSignal | undefined): Promise<unknown> {
    return limit(async () => {
      let lastError: ApiError | undefined;
      for (let i = 0; i < maxAttempts; i++) {
        if (signal?.aborted) throw new ApiError('aborted', 'Request cancelled.');
        try {
          return await attempt(path, body, signal);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
          lastError = error;
          const retryable = error.isTransient && error.kind !== 'offline';
          if (!retryable || i === maxAttempts - 1) throw error;
          const backoff = backoffMs * 2 ** i * (0.75 + Math.random() * 0.5);
          const wait = error.retryAfterMs !== undefined ? Math.min(error.retryAfterMs, MAX_RETRY_AFTER_MS) : backoff;
          await sleep(wait);
        }
      }
      throw lastError ?? new ApiError('network', 'Request failed.');
    });
  }

  return {
    async getQuestionList(testCode, domainCodes, requestOptions = {}) {
      const json = await request(
        'get-questions',
        { asmtEventId: ASSESSMENT_EVENT_ID, test: testCode, domain: domainCodes.join(',') },
        requestOptions.signal,
      );
      if (!Array.isArray(json)) {
        throw new ApiError('malformed', 'The question list from the question bank was not in the expected format.');
      }
      return json;
    },

    async getQuestionDetail(id, requestOptions = {}) {
      const json = await request('get-question', { external_id: id }, requestOptions.signal);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new ApiError('malformed', 'The question data from the question bank was not in the expected format.');
      }
      return json as Record<string, unknown>;
    },
  };
}

function configuredBaseUrl(): string {
  const fromEnv = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_QBANK_API_BASE;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : DEFAULT_API_BASE;
}

/** Shared client used by the app. */
export const qbankClient: QbankClient = createQbankClient({ baseUrl: configuredBaseUrl() });
