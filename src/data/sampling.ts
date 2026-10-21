import { skillKey } from './taxonomy';
import type { Question, QuestionMeta } from './types';

/** Returns a number in [0, 1). Injected so tests can be deterministic. */
export type Rng = () => number;

/**
 * How questions are drawn from the eligible pool:
 * - `balanced`: rotate through the selected skills so each gets a similar share.
 * - `random`: every eligible question is equally likely (skills with more
 *   questions in the bank appear more often).
 */
export type QuestionMix = 'balanced' | 'random';

/** Unbiased Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** Deterministic pseudo-random generator (mulberry32) for tests and reproducible shuffles. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function metaSkillKey(meta: QuestionMeta): string {
  return skillKey(meta.subject, meta.skillCode);
}

/**
 * Orders the whole eligible pool into a draw sequence with no repeats.
 * Drawing from the front of the deck is sampling without replacement.
 */
export function buildDeck(pool: readonly QuestionMeta[], mix: QuestionMix, rng: Rng = Math.random): QuestionMeta[] {
  const unique = [...new Map(pool.map((q) => [q.questionId, q])).values()];
  if (mix === 'random') return shuffle(unique, rng);

  const groups = new Map<string, QuestionMeta[]>();
  for (const q of unique) {
    const key = metaSkillKey(q);
    const group = groups.get(key);
    if (group) group.push(q);
    else groups.set(key, [q]);
  }
  const queues = [...groups.values()].map((g) => shuffle(g, rng));
  const deck: QuestionMeta[] = [];
  // Each round takes one question from every skill that still has some, in a
  // fresh random order, so no skill is favored by its position in the filter.
  while (deck.length < unique.length) {
    for (const queue of shuffle(queues.filter((q) => q.length > 0), rng)) deck.push(queue.shift()!);
  }
  return deck;
}

/**
 * Removes and returns a replacement for a question that could not be loaded,
 * preferring one from the same skill so a balanced selection stays balanced.
 */
export function takeReplacement(reserve: QuestionMeta[], preferred: QuestionMeta): QuestionMeta | undefined {
  if (reserve.length === 0) return undefined;
  const key = metaSkillKey(preferred);
  const index = reserve.findIndex((q) => metaSkillKey(q) === key);
  return reserve.splice(index === -1 ? 0 : index, 1)[0];
}

/** A question as presented in a session, with its display order of answer choices. */
export interface SessionItem {
  question: Question;
  /** Choice ids in display order (empty for free-response questions). */
  choiceOrder: string[];
}

export function createSessionItem(question: Question, shuffleChoices: boolean, rng: Rng = Math.random): SessionItem {
  if (question.kind !== 'mcq') return { question, choiceOrder: [] };
  const ids = question.choices.map((c) => c.id);
  return { question, choiceOrder: shuffleChoices ? shuffle(ids, rng) : ids };
}

/** Display letter for a choice: its position in `choiceOrder` (A, B, C, ...). */
export function displayLetter(item: SessionItem, choiceId: string): string {
  const index = item.choiceOrder.indexOf(choiceId);
  return index === -1 ? '?' : String.fromCharCode(65 + index);
}

/** Whether the displayed order differs from the source order the rationale refers to. */
export function isReordered(item: SessionItem): boolean {
  const { question } = item;
  if (question.kind !== 'mcq') return false;
  return item.choiceOrder.some((id, i) => question.choices[i]?.id !== id);
}
