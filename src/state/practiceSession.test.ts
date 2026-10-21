import { describe, expect, it } from 'vitest';
import { createSessionItem, seededRng } from '../data/sampling';
import { summarize } from '../data/scoring';
import { mcqQuestion, metaFor, sprQuestion } from '../test/fixtures';
import { DEFAULT_CONFIG } from './config';
import {
  bestStreak,
  createPracticeState,
  currentStreak,
  practiceReducer,
  practiceRecords,
  restorePracticeState,
  roundProgress,
  toStoredPractice,
  type PracticeState,
} from './practiceSession';

const pool = [metaFor('CID', 'E', 'p1'), metaFor('CID', 'E', 'p2'), metaFor('H.A.', 'E', 'p3')];

/** Simulates the hook loading whatever question is at the top of the deck. */
function loadNext(state: PracticeState): PracticeState {
  const m = state.deck[0]!;
  const question = m.subject === 'math' ? sprQuestion(m, ['12']) : mcqQuestion(m);
  return practiceReducer(state, { type: 'loaded', questionId: m.questionId, item: createSessionItem(question, false) });
}

function answerCorrectly(state: PracticeState): PracticeState {
  const q = state.current!.item.question;
  return practiceReducer(state, {
    type: 'answer',
    response: q.kind === 'mcq' ? { kind: 'mcq', choiceId: q.correctChoiceId } : { kind: 'spr', value: '12' },
  });
}

function answerWrong(state: PracticeState): PracticeState {
  const q = state.current!.item.question;
  return practiceReducer(state, {
    type: 'answer',
    response: q.kind === 'mcq' ? { kind: 'mcq', choiceId: q.choices[0]!.id } : { kind: 'spr', value: '13' },
  });
}

describe('practice session', () => {
  it('starts by loading the first card of a deck containing the whole pool', () => {
    const state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(1));
    expect(state.phase).toBe('loading');
    expect(state.deck.map((q) => q.questionId).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('reports an empty pool immediately instead of loading forever', () => {
    expect(createPracticeState(DEFAULT_CONFIG, []).phase).toBe('exhausted');
  });

  it('records one answer per question and ignores repeated submissions', () => {
    let state = loadNext(createPracticeState(DEFAULT_CONFIG, pool, seededRng(1)));
    expect(state.phase).toBe('question');
    state = answerCorrectly(state);
    state = answerWrong(state); // second click on the same question
    state = answerCorrectly(state);
    expect(state.phase).toBe('feedback');
    expect(state.history).toHaveLength(1);
    expect(state.history[0]!.status).toBe('correct');
  });

  it('ignores a blank free-response submission', () => {
    let state = createPracticeState(DEFAULT_CONFIG, [metaFor('H.A.', 'E', 'only')]);
    state = loadNext(state);
    state = practiceReducer(state, { type: 'answer', response: { kind: 'spr', value: '  ' } });
    expect(state.phase).toBe('question');
    expect(state.history).toHaveLength(0);
  });

  it('does not count skipped questions as answered', () => {
    let state = loadNext(createPracticeState(DEFAULT_CONFIG, pool, seededRng(2)));
    state = practiceReducer(state, { type: 'skip' });
    expect(state.passedOver).toBe(1);
    expect(state.history).toHaveLength(0);
    expect(state.phase).toBe('loading');
  });

  it('draws without replacement and reports when the pool is exhausted', () => {
    let state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(3));
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      state = loadNext(state);
      seen.push(state.current!.item.question.meta.questionId);
      state = practiceReducer(answerCorrectly(state), { type: 'next' });
    }
    expect(new Set(seen).size).toBe(3);
    expect(state.phase).toBe('exhausted');
    state = practiceReducer(state, { type: 'reshuffle', rng: seededRng(4) });
    expect(state.phase).toBe('loading');
    expect(state.round).toBe(2);
    expect(state.deck).toHaveLength(3);
    expect(state.history).toHaveLength(3); // history survives a reshuffle
  });

  it('removes unavailable questions and never reshuffles them back in', () => {
    let state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(5));
    const broken = state.deck[0]!.questionId;
    state = practiceReducer(state, { type: 'unavailable', questionId: broken, reason: 'No answer key' });
    expect(state.unavailable.map((u) => u.meta.questionId)).toEqual([broken]);
    expect(state.deck.map((q) => q.questionId)).not.toContain(broken);
    while (state.phase !== 'exhausted') state = practiceReducer(answerCorrectly(loadNext(state)), { type: 'next' });
    state = practiceReducer(state, { type: 'reshuffle' });
    expect(state.deck.map((q) => q.questionId)).not.toContain(broken);
    expect(state.deck).toHaveLength(2);
  });

  it('ignores stale load results for a question that is no longer current', () => {
    const state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(6));
    const stale = practiceReducer(state, { type: 'loaded', questionId: 'not-the-top', item: createSessionItem(mcqQuestion(), false) });
    expect(stale).toBe(state);
  });

  it('turns a connection failure into a retryable error', () => {
    let state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(7));
    const top = state.deck[0]!.questionId;
    state = practiceReducer(state, { type: 'load-failed', questionId: top, message: 'Offline' });
    expect(state.phase).toBe('error');
    state = practiceReducer(state, { type: 'retry' });
    expect(state.phase).toBe('loading');
    expect(state.deck[0]!.questionId).toBe(top);
  });

  it('computes scores and streaks from recorded answers', () => {
    let state = createPracticeState(DEFAULT_CONFIG, [...pool, metaFor('CID', 'M', 'p4')], seededRng(8));
    state = practiceReducer(answerCorrectly(loadNext(state)), { type: 'next' });
    state = practiceReducer(answerCorrectly(loadNext(state)), { type: 'next' });
    state = practiceReducer(answerWrong(loadNext(state)), { type: 'next' });
    state = answerCorrectly(loadNext(state));
    const summary = summarize(practiceRecords(state).map((r) => r.status));
    expect(summary).toMatchObject({ answered: 4, correct: 3, incorrect: 1, accuracy: 0.75 });
    expect(currentStreak(state.history)).toBe(1);
    expect(bestStreak(state.history)).toBe(2);
    expect(roundProgress(state)).toEqual({ seen: 4, total: 4 });
  });

  it('persists and restores a session, returning an unanswered question to the deck', () => {
    let state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(9));
    state = practiceReducer(answerCorrectly(loadNext(state)), { type: 'next' });
    state = loadNext(state); // on screen, not answered
    const onScreen = state.current!.item.question.meta.questionId;
    const stored = toStoredPractice(state);
    const byId = new Map(pool.map((q) => [q.questionId, q]));
    const restored = restorePracticeState(JSON.parse(JSON.stringify(stored)), (id) => byId.get(id))!;
    expect(restored.history).toHaveLength(1);
    expect(restored.phase).toBe('loading');
    expect(restored.deck[0]!.questionId).toBe(onScreen);
    expect(restored.deck).toHaveLength(2);
  });
});

describe('ending a practice session', () => {
  it('does not count a question that was on screen but unanswered', () => {
    let state = createPracticeState(DEFAULT_CONFIG, pool, seededRng(10));
    state = practiceReducer(answerCorrectly(loadNext(state)), { type: 'next' });
    state = loadNext(state);
    state = practiceReducer(state, { type: 'end' });
    expect(state.phase).toBe('ended');
    expect(state.history).toHaveLength(1);
    expect(state.current).toBeNull();
    // Nothing can be answered after the session ends.
    expect(practiceReducer(state, { type: 'answer', response: { kind: 'mcq', choiceId: 'x' } })).toBe(state);
  });
});
