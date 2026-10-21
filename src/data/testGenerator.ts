import { ApiError } from '../api/qbankClient';
import { isQuestionUnavailableError } from './repository';
import { buildDeck, createSessionItem, shuffle, takeReplacement, type QuestionMix, type Rng, type SessionItem } from './sampling';
import type { Question, QuestionMeta } from './types';

export type QuestionLoader = (meta: QuestionMeta, options: { signal?: AbortSignal }) => Promise<Question>;

export interface SkippedQuestion {
  meta: QuestionMeta;
  reason: string;
}

export interface GenerateTestOptions {
  /** Eligible questions (already filtered by subject, domain, skill and difficulty). */
  pool: readonly QuestionMeta[];
  count: number;
  mix: QuestionMix;
  shuffleChoices: boolean;
  loadQuestion: QuestionLoader;
  rng?: Rng;
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (loaded: number, total: number) => void;
}

export interface GeneratedTest {
  items: SessionItem[];
  /** Questions that were drawn but could not be used, and were replaced from the same pool. */
  skipped: SkippedQuestion[];
}

export type TestGenerationErrorKind = 'invalid-count' | 'empty-pool' | 'insufficient';

export class TestGenerationError extends Error {
  readonly kind: TestGenerationErrorKind;
  /** For `insufficient`: how many usable questions could be prepared. */
  readonly available: number;

  constructor(kind: TestGenerationErrorKind, message: string, available = 0) {
    super(message);
    this.name = 'TestGenerationError';
    this.kind = kind;
    this.available = available;
  }
}

export function validateTestRequest(poolSize: number, count: number): TestGenerationError | null {
  if (!Number.isInteger(count) || count < 1) {
    return new TestGenerationError('invalid-count', 'Choose at least one question.');
  }
  if (poolSize === 0) {
    return new TestGenerationError('empty-pool', 'No questions match the selected subjects, skills and difficulties.');
  }
  if (count > poolSize) {
    return new TestGenerationError(
      'insufficient',
      `Only ${poolSize} question${poolSize === 1 ? '' : 's'} match your selection, so a ${count}-question test isn't possible.`,
      poolSize,
    );
  }
  return null;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : 'The question could not be loaded.';
}

/**
 * Builds a complete test before it is shown: draws `count` distinct questions,
 * loads every one, replaces any that turn out to be unusable with another
 * question from the same filtered pool (same skill when possible), then
 * randomizes question and (optionally) answer-choice order.
 *
 * Connection problems abort generation with the original error so the caller
 * can offer a retry; questions are never substituted from outside the pool.
 */
export async function generateTest(options: GenerateTestOptions): Promise<GeneratedTest> {
  const { pool, count, mix, shuffleChoices, loadQuestion, onProgress } = options;
  const rng = options.rng ?? Math.random;
  const invalid = validateTestRequest(pool.length, count);
  if (invalid) throw invalid;

  const deck = buildDeck(pool, mix, rng);
  const selected = deck.slice(0, count);
  const reserve = deck.slice(count);
  const slots: Array<Question | null> = new Array(count).fill(null);
  const skipped: SkippedQuestion[] = [];

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abortFromParent, { once: true });

  let next = 0;
  let loaded = 0;
  async function worker(): Promise<void> {
    while (next < count) {
      const slot = next++;
      let meta: QuestionMeta | undefined = selected[slot];
      while (meta && !controller.signal.aborted) {
        try {
          slots[slot] = await loadQuestion(meta, { signal: controller.signal });
          loaded++;
          onProgress?.(loaded, count);
          break;
        } catch (error) {
          if (!isQuestionUnavailableError(error)) throw error;
          skipped.push({ meta, reason: errorReason(error) });
          meta = takeReplacement(reserve, meta);
        }
      }
    }
  }

  try {
    const workers = Array.from({ length: Math.min(options.concurrency ?? 4, count) }, () =>
      worker().catch((error: unknown) => {
        controller.abort();
        throw error;
      }),
    );
    const results = await Promise.allSettled(workers);
    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) throw failure.reason;
  } finally {
    options.signal?.removeEventListener('abort', abortFromParent);
  }

  if (controller.signal.aborted) throw new ApiError('aborted', 'Test generation was cancelled.');
  const questions = slots.filter((q): q is Question => q !== null);
  if (questions.length < count) {
    throw new TestGenerationError(
      'insufficient',
      `Only ${questions.length} of the ${pool.length} matching questions could be loaded, so a ${count}-question test isn't possible.`,
      questions.length,
    );
  }
  const items = shuffle(questions, rng).map((q) => createSessionItem(q, shuffleChoices, rng));
  return { items, skipped };
}
