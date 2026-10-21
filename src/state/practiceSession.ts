import { buildDeck, type Rng, type SessionItem } from '../data/sampling';
import type { GradedRecord } from '../data/scoring';
import type { SkippedQuestion } from '../data/testGenerator';
import type { OutcomeStatus, QuestionMeta, UserResponse } from '../data/types';
import { gradeResponse } from '../data/validation';
import type { StudyConfig } from './config';
import { readJson, removeKey, STORAGE_KEYS, writeJson } from './storage';

/**
 * Endless practice session state.
 *
 * The eligible pool is shuffled into a deck once; questions are drawn from the
 * front (sampling without replacement). The question at `deck[0]` is the one
 * being loaded while `phase` is "loading". Scores are always computed from
 * `history`, never from separate counters.
 */

export interface PracticeAnswer {
  meta: QuestionMeta;
  response: UserResponse;
  status: Exclude<OutcomeStatus, 'unanswered'>;
}

export type PracticePhase = 'loading' | 'question' | 'feedback' | 'exhausted' | 'error' | 'ended';

export interface PracticeState {
  config: StudyConfig;
  /** Eligible questions for this session (fixed when the session starts). */
  pool: QuestionMeta[];
  /** Remaining draw order. */
  deck: QuestionMeta[];
  phase: PracticePhase;
  current: { item: SessionItem; response: UserResponse | null; status: PracticeAnswer['status'] | null } | null;
  history: PracticeAnswer[];
  /** Questions that could not be loaded or graded and were left out. */
  unavailable: SkippedQuestion[];
  /** Questions the user chose to skip without answering (not scored). */
  passedOver: number;
  /** How many times the deck has been reshuffled after running out. */
  round: number;
  error: string | null;
}

export type PracticeAction =
  | { type: 'loaded'; questionId: string; item: SessionItem }
  | { type: 'unavailable'; questionId: string; reason: string }
  | { type: 'load-failed'; questionId: string; message: string }
  | { type: 'retry' }
  | { type: 'answer'; response: UserResponse }
  | { type: 'next' }
  | { type: 'skip' }
  | { type: 'reshuffle'; rng?: Rng }
  | { type: 'end' };

export function createPracticeState(config: StudyConfig, pool: readonly QuestionMeta[], rng?: Rng): PracticeState {
  const deck = buildDeck(pool, config.mix, rng);
  return {
    config,
    pool: [...pool],
    deck,
    phase: deck.length === 0 ? 'exhausted' : 'loading',
    current: null,
    history: [],
    unavailable: [],
    passedOver: 0,
    round: 1,
    error: null,
  };
}

/** Moves on to load the next question, or reports that the deck is used up. */
function advance(state: PracticeState, deck: QuestionMeta[]): PracticeState {
  return { ...state, deck, current: null, error: null, phase: deck.length === 0 ? 'exhausted' : 'loading' };
}

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  if (state.phase === 'ended') return state;
  switch (action.type) {
    case 'loaded': {
      // Ignore late results for a question that is no longer the one being loaded.
      if (state.phase !== 'loading' || state.deck[0]?.questionId !== action.questionId) return state;
      return {
        ...state,
        deck: state.deck.slice(1),
        phase: 'question',
        current: { item: action.item, response: null, status: null },
      };
    }
    case 'unavailable': {
      const meta = state.deck[0];
      if (state.phase !== 'loading' || meta?.questionId !== action.questionId) return state;
      return advance({ ...state, unavailable: [...state.unavailable, { meta, reason: action.reason }] }, state.deck.slice(1));
    }
    case 'load-failed': {
      if (state.phase !== 'loading' || state.deck[0]?.questionId !== action.questionId) return state;
      return { ...state, phase: 'error', error: action.message };
    }
    case 'retry':
      return state.phase === 'error' ? { ...state, phase: 'loading', error: null } : state;
    case 'answer': {
      // One answer per question: later clicks or key presses are ignored.
      if (state.phase !== 'question' || !state.current) return state;
      const status = gradeResponse(state.current.item.question, action.response);
      if (status === 'unanswered') return state;
      const answer: PracticeAnswer = { meta: state.current.item.question.meta, response: action.response, status };
      return {
        ...state,
        phase: 'feedback',
        current: { ...state.current, response: action.response, status },
        history: [...state.history, answer],
      };
    }
    case 'next':
      return state.phase === 'feedback' ? advance(state, state.deck) : state;
    case 'skip':
      return state.phase === 'question' ? advance({ ...state, passedOver: state.passedOver + 1 }, state.deck) : state;
    case 'reshuffle': {
      if (state.phase !== 'exhausted') return state;
      const unavailable = new Set(state.unavailable.map((u) => u.meta.questionId));
      const pool = state.pool.filter((q) => !unavailable.has(q.questionId));
      return advance({ ...state, round: state.round + 1 }, buildDeck(pool, state.config.mix, action.rng));
    }
    case 'end':
      // A question on screen but not answered is simply dropped; it was never scored.
      return { ...state, phase: 'ended', current: null, error: null };
  }
}

export function practiceRecords(state: Pick<PracticeState, 'history'>): GradedRecord[] {
  return state.history.map((h) => ({ meta: h.meta, status: h.status }));
}

/** Current run of consecutive correct answers. */
export function currentStreak(history: readonly PracticeAnswer[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0 && history[i]!.status === 'correct'; i--) streak++;
  return streak;
}

export function bestStreak(history: readonly PracticeAnswer[]): number {
  let best = 0;
  let run = 0;
  for (const h of history) {
    run = h.status === 'correct' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Questions drawn so far this round (including the one on screen), out of the usable pool. */
export function roundProgress(state: PracticeState): { seen: number; total: number } {
  const total = state.pool.length - state.unavailable.length;
  return { seen: Math.max(0, total - state.deck.length), total };
}

// ---------------------------------------------------------------------------
// Persistence: an interrupted session can be resumed after a reload. Only ids
// are stored for the pool and deck; they are resolved against the catalog.
// ---------------------------------------------------------------------------

export interface StoredPracticeSession {
  version: 1;
  savedAt: number;
  config: StudyConfig;
  poolIds: string[];
  deckIds: string[];
  history: PracticeAnswer[];
  unavailable: SkippedQuestion[];
  passedOver: number;
  round: number;
}

export function toStoredPractice(state: PracticeState, now = Date.now()): StoredPracticeSession {
  // A question on screen but not answered goes back on top of the deck.
  const pending = state.current && state.phase === 'question' ? [state.current.item.question.meta.questionId] : [];
  return {
    version: 1,
    savedAt: now,
    config: state.config,
    poolIds: state.pool.map((q) => q.questionId),
    deckIds: [...pending, ...state.deck.map((q) => q.questionId)],
    history: state.history,
    unavailable: state.unavailable,
    passedOver: state.passedOver,
    round: state.round,
  };
}

export function restorePracticeState(
  stored: StoredPracticeSession,
  lookup: (questionId: string) => QuestionMeta | undefined,
): PracticeState | null {
  if (stored?.version !== 1 || !Array.isArray(stored.poolIds) || !Array.isArray(stored.history)) return null;
  const resolve = (ids: string[]) => ids.map(lookup).filter((q): q is QuestionMeta => q !== undefined);
  const pool = resolve(stored.poolIds);
  if (pool.length === 0) return null;
  const deck = resolve(stored.deckIds ?? []);
  return {
    config: stored.config,
    pool,
    deck,
    phase: deck.length === 0 ? 'exhausted' : 'loading',
    current: null,
    history: stored.history,
    unavailable: stored.unavailable ?? [],
    passedOver: stored.passedOver ?? 0,
    round: stored.round ?? 1,
    error: null,
  };
}

export function savePracticeSession(state: PracticeState): boolean {
  const saved = writeJson(STORAGE_KEYS.practiceSession, toStoredPractice(state));
  if (!saved) removeKey(STORAGE_KEYS.practiceSession);
  return saved;
}

export function loadStoredPracticeSession(): StoredPracticeSession | null {
  const stored = readJson<StoredPracticeSession>(STORAGE_KEYS.practiceSession);
  return stored?.version === 1 ? stored : null;
}

export function clearPracticeSession(): void {
  removeKey(STORAGE_KEYS.practiceSession);
}
