import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/qbankClient';
import { mcqQuestion, metaFor } from '../test/fixtures';
import { QuestionFormatError } from './normalize';
import { seededRng } from './sampling';
import { generateTest, TestGenerationError, validateTestRequest, type QuestionLoader } from './testGenerator';
import type { QuestionMeta } from './types';

function makePool(): QuestionMeta[] {
  return [
    ...Array.from({ length: 20 }, (_, i) => metaFor('CID', 'E', `cid-${i}`)),
    ...Array.from({ length: 4 }, (_, i) => metaFor('WIC', 'M', `wic-${i}`)),
    ...Array.from({ length: 8 }, (_, i) => metaFor('H.A.', 'H', `ha-${i}`)),
  ];
}

const okLoader: QuestionLoader = async (meta) => mcqQuestion(meta);

describe('validateTestRequest', () => {
  it('rejects non-positive and fractional counts', () => {
    expect(validateTestRequest(10, 0)?.kind).toBe('invalid-count');
    expect(validateTestRequest(10, 2.5)?.kind).toBe('invalid-count');
  });

  it('explains an empty pool and a pool that is too small', () => {
    expect(validateTestRequest(0, 5)?.kind).toBe('empty-pool');
    const tooSmall = validateTestRequest(3, 5);
    expect(tooSmall?.kind).toBe('insufficient');
    expect(tooSmall?.available).toBe(3);
    expect(validateTestRequest(5, 5)).toBeNull();
  });
});

describe('generateTest', () => {
  it('returns the requested number of distinct questions from the pool', async () => {
    const pool = makePool();
    const { items } = await generateTest({ pool, count: 15, mix: 'random', shuffleChoices: false, loadQuestion: okLoader, rng: seededRng(1) });
    const ids = items.map((i) => i.question.meta.questionId);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    const poolIds = new Set(pool.map((q) => q.questionId));
    expect(ids.every((id) => poolIds.has(id))).toBe(true);
  });

  it('balanced mix samples across every selected skill', async () => {
    const { items } = await generateTest({
      pool: makePool(),
      count: 12,
      mix: 'balanced',
      shuffleChoices: false,
      loadQuestion: okLoader,
      rng: seededRng(5),
    });
    const bySkill = new Map<string, number>();
    for (const item of items) bySkill.set(item.question.meta.skillCode, (bySkill.get(item.question.meta.skillCode) ?? 0) + 1);
    expect(Object.fromEntries(bySkill)).toEqual({ CID: 4, WIC: 4, 'H.A.': 4 });
  });

  it('randomizes question order', async () => {
    const pool = makePool();
    const orders = new Set<string>();
    for (let seed = 0; seed < 5; seed++) {
      const { items } = await generateTest({ pool, count: 5, mix: 'balanced', shuffleChoices: false, loadQuestion: okLoader, rng: seededRng(seed) });
      orders.add(items.map((i) => i.question.meta.questionId).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('shuffles answer choices only when asked, keeping every choice', async () => {
    const pool = makePool();
    const plain = await generateTest({ pool, count: 5, mix: 'random', shuffleChoices: false, loadQuestion: okLoader, rng: seededRng(2) });
    for (const item of plain.items) {
      expect(item.choiceOrder).toEqual(item.question.kind === 'mcq' ? item.question.choices.map((c) => c.id) : []);
    }
    const shuffled = await generateTest({ pool, count: 10, mix: 'random', shuffleChoices: true, loadQuestion: okLoader, rng: seededRng(2) });
    const reordered = shuffled.items.filter((item) => item.question.kind === 'mcq' && item.choiceOrder.join() !== item.question.choices.map((c) => c.id).join());
    expect(reordered.length).toBeGreaterThan(0);
    for (const item of shuffled.items) expect(item.choiceOrder).toHaveLength(4);
  });

  it('replaces unusable questions with others from the same skill and reports them', async () => {
    const pool = makePool();
    const loader: QuestionLoader = async (meta) => {
      if (meta.questionId === 'wic-0' || meta.questionId === 'wic-1') {
        throw new QuestionFormatError('unsupported', meta.questionId, 'No answer key.');
      }
      return mcqQuestion(meta);
    };
    const { items, skipped } = await generateTest({ pool, count: 32 - 2, mix: 'balanced', shuffleChoices: false, loadQuestion: loader, rng: seededRng(9) });
    expect(items).toHaveLength(30);
    const ids = items.map((i) => i.question.meta.questionId);
    expect(ids).not.toContain('wic-0');
    expect(ids).not.toContain('wic-1');
    expect(new Set(ids).size).toBe(30);
    expect(skipped.map((s) => s.meta.questionId).sort()).toEqual(['wic-0', 'wic-1']);
  });

  it('fails with an "insufficient" error rather than padding with unrelated questions', async () => {
    const pool = makePool().slice(0, 5);
    const loader: QuestionLoader = async (meta) => {
      if (meta.questionId === 'cid-0') throw new ApiError('not-found', 'gone');
      return mcqQuestion(meta);
    };
    const error = await generateTest({ pool, count: 5, mix: 'random', shuffleChoices: false, loadQuestion: loader, rng: seededRng(1) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TestGenerationError);
    expect((error as TestGenerationError).kind).toBe('insufficient');
    expect((error as TestGenerationError).available).toBe(4);
  });

  it('stops on connection errors instead of skipping questions', async () => {
    const loader = vi.fn<QuestionLoader>(async () => {
      throw new ApiError('network', 'offline');
    });
    await expect(
      generateTest({ pool: makePool(), count: 10, mix: 'random', shuffleChoices: false, loadQuestion: loader }),
    ).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports loading progress up to the requested count', async () => {
    const progress: number[] = [];
    await generateTest({
      pool: makePool(),
      count: 6,
      mix: 'random',
      shuffleChoices: false,
      loadQuestion: okLoader,
      onProgress: (loaded) => progress.push(loaded),
    });
    expect(progress.at(-1)).toBe(6);
    expect(progress).toHaveLength(6);
  });

  it('validates the request before loading anything', async () => {
    const loader = vi.fn(okLoader);
    await expect(generateTest({ pool: [], count: 3, mix: 'random', shuffleChoices: false, loadQuestion: loader })).rejects.toMatchObject({
      kind: 'empty-pool',
    });
    await expect(
      generateTest({ pool: makePool(), count: 100, mix: 'random', shuffleChoices: false, loadQuestion: loader }),
    ).rejects.toMatchObject({ kind: 'insufficient', available: 32 });
    expect(loader).not.toHaveBeenCalled();
  });
});
