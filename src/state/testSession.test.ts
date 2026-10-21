import { describe, expect, it, vi } from 'vitest';
import { createSessionItem, seededRng } from '../data/sampling';
import { mcqQuestion, metaFor, sprQuestion } from '../test/fixtures';
import { DEFAULT_CONFIG } from './config';
import {
  createTestSession,
  gradeTest,
  loadTestSession,
  retakeTestSession,
  saveTestSession,
  testReducer,
  unansweredIndexes,
  type TestSession,
} from './testSession';

function makeSession(): TestSession {
  const items = [
    createSessionItem(mcqQuestion(metaFor('CID', 'E', 't1')), false),
    createSessionItem(mcqQuestion(metaFor('WIC', 'M', 't2')), false),
    createSessionItem(sprQuestion(metaFor('H.A.', 'H', 't3'), ['3/17']), false),
    createSessionItem(mcqQuestion(metaFor('H.B.', 'E', 't4')), false),
  ];
  return createTestSession(DEFAULT_CONFIG, items, [], 1000);
}

describe('test session', () => {
  it('keeps answers when navigating back and forth', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't1', response: { kind: 'mcq', choiceId: 't1-b' } });
    s = testReducer(s, { type: 'next' });
    s = testReducer(s, { type: 'answer', questionId: 't2', response: { kind: 'mcq', choiceId: 't2-a' } });
    s = testReducer(s, { type: 'previous' });
    expect(s.currentIndex).toBe(0);
    expect(s.answers.t1).toEqual({ kind: 'mcq', choiceId: 't1-b' });
    expect(s.answers.t2).toEqual({ kind: 'mcq', choiceId: 't2-a' });
  });

  it('lets the user change an answer before submitting', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't1', response: { kind: 'mcq', choiceId: 't1-a' } });
    s = testReducer(s, { type: 'answer', questionId: 't1', response: { kind: 'mcq', choiceId: 't1-b' } });
    expect(s.answers.t1).toEqual({ kind: 'mcq', choiceId: 't1-b' });
    s = testReducer(s, { type: 'clear', questionId: 't1' });
    expect(s.answers.t1).toBeUndefined();
  });

  it('treats an emptied free-response box as unanswered', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't3', response: { kind: 'spr', value: '0.5' } });
    s = testReducer(s, { type: 'answer', questionId: 't3', response: { kind: 'spr', value: '' } });
    expect(s.answers.t3).toBeUndefined();
    expect(unansweredIndexes(s)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the question index within bounds', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'previous' });
    expect(s.currentIndex).toBe(0);
    s = testReducer(s, { type: 'go-to', index: 99 });
    expect(s.currentIndex).toBe(3);
    s = testReducer(s, { type: 'next' });
    expect(s.currentIndex).toBe(3);
  });

  it('ignores answers for questions not in the test', () => {
    const s = makeSession();
    expect(testReducer(s, { type: 'answer', questionId: 'nope', response: { kind: 'mcq', choiceId: 'x' } })).toBe(s);
  });

  it('lists unanswered questions', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't2', response: { kind: 'mcq', choiceId: 't2-b' } });
    expect(unansweredIndexes(s)).toEqual([0, 2, 3]);
  });

  it('becomes read-only after submission and cannot be submitted twice', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'submit', at: 5000 });
    expect(s.status).toBe('submitted');
    const after = testReducer(s, { type: 'answer', questionId: 't1', response: { kind: 'mcq', choiceId: 't1-b' } });
    expect(after).toBe(s);
    expect(testReducer(s, { type: 'submit', at: 9999 }).submittedAt).toBe(5000);
  });

  it('grades from recorded answers, counting unanswered questions as not correct', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't1', response: { kind: 'mcq', choiceId: 't1-b' } }); // correct
    s = testReducer(s, { type: 'answer', questionId: 't2', response: { kind: 'mcq', choiceId: 't2-c' } }); // wrong
    s = testReducer(s, { type: 'answer', questionId: 't3', response: { kind: 'spr', value: '.1765' } }); // correct (rounded)
    s = testReducer(s, { type: 'submit', at: 2000 });
    const results = gradeTest(s);
    expect(results.items.map((i) => i.status)).toEqual(['correct', 'incorrect', 'correct', 'unanswered']);
    expect(results.summary).toMatchObject({ total: 4, correct: 2, incorrect: 1, unanswered: 1, percent: 0.5 });
  });

  it('retakes the same questions with answers cleared', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't1', response: { kind: 'mcq', choiceId: 't1-b' } });
    s = testReducer(s, { type: 'submit', at: 2000 });
    const retake = retakeTestSession(s, seededRng(1));
    expect(retake.status).toBe('in-progress');
    expect(retake.answers).toEqual({});
    expect(retake.id).not.toBe(s.id);
    expect(retake.items.map((i) => i.question.meta.questionId).sort()).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('survives a save and reload', () => {
    let s = makeSession();
    s = testReducer(s, { type: 'answer', questionId: 't3', response: { kind: 'spr', value: '3/17' } });
    s = testReducer(s, { type: 'go-to', index: 2 });
    expect(saveTestSession(s)).toBe(true);
    const loaded = loadTestSession();
    expect(loaded?.answers).toEqual(s.answers);
    expect(loaded?.currentIndex).toBe(2);
    expect(loaded?.items).toHaveLength(4);
  });

  it('never leaves an older session behind when a save does not fit', () => {
    const older = makeSession();
    expect(saveTestSession(older)).toBe(true);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(saveTestSession(makeSession())).toBe(false);
    setItem.mockRestore();
    expect(loadTestSession()).toBeNull();
  });

  it('ignores corrupt stored sessions', () => {
    localStorage.setItem('studysat.test-session.v1', JSON.stringify({ version: 1, session: { items: [{}] } }));
    expect(loadTestSession()).toBeNull();
    localStorage.setItem('studysat.test-session.v1', 'garbage');
    expect(loadTestSession()).toBeNull();
  });
});
