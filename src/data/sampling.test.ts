import { describe, expect, it } from 'vitest';
import { mcqQuestion, metaFor, sprQuestion } from '../test/fixtures';
import { buildDeck, createSessionItem, displayLetter, isReordered, seededRng, shuffle, takeReplacement } from './sampling';
import { isResponseCorrect } from './validation';

describe('shuffle', () => {
  it('returns a permutation without modifying the input', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const result = shuffle(input, seededRng(1));
    expect(result).not.toBe(input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
    expect(result).not.toEqual(input);
  });

  it('is roughly uniform', () => {
    const rng = seededRng(42);
    const firstPositions = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) firstPositions[shuffle([0, 1, 2, 3], rng)[0]!]! += 1;
    for (const count of firstPositions) expect(count).toBeGreaterThan(1800);
  });
});

describe('buildDeck', () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => metaFor('CID', 'E', `cid-${i}`)),
    ...Array.from({ length: 3 }, (_, i) => metaFor('WIC', 'E', `wic-${i}`)),
    ...Array.from({ length: 10 }, (_, i) => metaFor('H.A.', 'E', `ha-${i}`)),
  ];

  it('contains every eligible question exactly once (sampling without replacement)', () => {
    for (const mix of ['random', 'balanced'] as const) {
      const deck = buildDeck(pool, mix, seededRng(7));
      expect(deck).toHaveLength(pool.length);
      expect(new Set(deck.map((q) => q.questionId)).size).toBe(pool.length);
    }
  });

  it('ignores duplicate entries in the pool', () => {
    expect(buildDeck([...pool, pool[0]!], 'random', seededRng(1))).toHaveLength(pool.length);
  });

  it('balanced mode rotates through skills instead of favoring the largest or first one', () => {
    const deck = buildDeck(pool, 'balanced', seededRng(3));
    const firstNine = deck.slice(0, 9).map((q) => q.skillCode);
    expect(firstNine.filter((s) => s === 'CID')).toHaveLength(3);
    expect(firstNine.filter((s) => s === 'WIC')).toHaveLength(3);
    expect(firstNine.filter((s) => s === 'H.A.')).toHaveLength(3);
  });

  it('balanced mode does not always start with the same skill', () => {
    const firstSkills = new Set<string>();
    for (let seed = 0; seed < 30; seed++) firstSkills.add(buildDeck(pool, 'balanced', seededRng(seed))[0]!.skillCode);
    expect(firstSkills.size).toBe(3);
  });

  it('handles an empty pool', () => {
    expect(buildDeck([], 'balanced')).toEqual([]);
    expect(buildDeck([], 'random')).toEqual([]);
  });
});

describe('takeReplacement', () => {
  it('prefers a question from the same skill and removes it from the reserve', () => {
    const reserve = [metaFor('WIC', 'E', 'w1'), metaFor('CID', 'E', 'c1'), metaFor('CID', 'E', 'c2')];
    expect(takeReplacement(reserve, metaFor('CID'))?.questionId).toBe('c1');
    expect(reserve.map((q) => q.questionId)).toEqual(['w1', 'c2']);
  });

  it('falls back to any question, then to undefined', () => {
    const reserve = [metaFor('WIC', 'E', 'w1')];
    expect(takeReplacement(reserve, metaFor('CID'))?.questionId).toBe('w1');
    expect(takeReplacement(reserve, metaFor('CID'))).toBeUndefined();
  });
});

describe('createSessionItem', () => {
  it('shuffles choice order without breaking the answer key', () => {
    const question = mcqQuestion();
    for (let seed = 0; seed < 20; seed++) {
      const item = createSessionItem(question, true, seededRng(seed));
      expect([...item.choiceOrder].sort()).toEqual(question.choices.map((c) => c.id).sort());
      // The correct choice is still correct wherever it is displayed.
      expect(isResponseCorrect(question, { kind: 'mcq', choiceId: question.correctChoiceId })).toBe(true);
      const shownLetter = displayLetter(item, question.correctChoiceId);
      expect(item.choiceOrder[shownLetter.charCodeAt(0) - 65]).toBe(question.correctChoiceId);
    }
  });

  it('keeps the source order when shuffling is off', () => {
    const question = mcqQuestion();
    const item = createSessionItem(question, false);
    expect(item.choiceOrder).toEqual(question.choices.map((c) => c.id));
    expect(isReordered(item)).toBe(false);
  });

  it('reports when the order differs from the source', () => {
    const question = mcqQuestion();
    const item = { question, choiceOrder: [...question.choices.map((c) => c.id)].reverse() };
    expect(isReordered(item)).toBe(true);
    expect(displayLetter(item, question.choices[3]!.id)).toBe('A');
  });

  it('has no choices for free-response questions', () => {
    expect(createSessionItem(sprQuestion(), true).choiceOrder).toEqual([]);
  });
});
