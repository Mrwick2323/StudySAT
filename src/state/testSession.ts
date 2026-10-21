import { createSessionItem, shuffle, type Rng, type SessionItem } from '../data/sampling';
import { summarize, type GradedRecord, type ScoreSummary } from '../data/scoring';
import type { SkippedQuestion } from '../data/testGenerator';
import type { OutcomeStatus, UserResponse } from '../data/types';
import { gradeResponse, isAnswered } from '../data/validation';
import type { StudyConfig } from './config';
import { readJson, removeKey, STORAGE_KEYS, writeJson } from './storage';

/**
 * Custom test session state. Answers are stored by question id, separately
 * from which question is on screen, so moving between questions never loses
 * a response. Nothing is graded until the test is submitted.
 */

export interface TestSession {
  id: string;
  createdAt: number;
  config: StudyConfig;
  items: SessionItem[];
  answers: Record<string, UserResponse>;
  currentIndex: number;
  status: 'in-progress' | 'submitted';
  submittedAt: number | null;
  /** Drawn questions that were unusable and replaced while generating the test. */
  replaced: SkippedQuestion[];
}

export type TestAction =
  | { type: 'answer'; questionId: string; response: UserResponse }
  | { type: 'clear'; questionId: string }
  | { type: 'go-to'; index: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'submit'; at: number };

export function createTestSession(
  config: StudyConfig,
  items: SessionItem[],
  replaced: SkippedQuestion[] = [],
  now = Date.now(),
): TestSession {
  return {
    id: `test-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    config,
    items,
    answers: {},
    currentIndex: 0,
    status: 'in-progress',
    submittedAt: null,
    replaced,
  };
}

/** Same questions, fresh attempt: new question order (and choice order if enabled), no answers. */
export function retakeTestSession(session: TestSession, rng?: Rng, now = Date.now()): TestSession {
  const items = shuffle(session.items, rng).map((item) =>
    createSessionItem(item.question, session.config.shuffleChoices, rng),
  );
  return createTestSession(session.config, items, [], now);
}

function clampIndex(session: TestSession, index: number): number {
  return Math.min(Math.max(0, index), session.items.length - 1);
}

export function testReducer(session: TestSession, action: TestAction): TestSession {
  if (session.status === 'submitted') return session; // Submitted tests are read-only.
  switch (action.type) {
    case 'answer': {
      if (!session.items.some((item) => item.question.meta.questionId === action.questionId)) return session;
      if (!isAnswered(action.response)) {
        const { [action.questionId]: _removed, ...rest } = session.answers;
        return { ...session, answers: rest };
      }
      return { ...session, answers: { ...session.answers, [action.questionId]: action.response } };
    }
    case 'clear': {
      const { [action.questionId]: _removed, ...rest } = session.answers;
      return { ...session, answers: rest };
    }
    case 'go-to':
      return { ...session, currentIndex: clampIndex(session, action.index) };
    case 'next':
      return { ...session, currentIndex: clampIndex(session, session.currentIndex + 1) };
    case 'previous':
      return { ...session, currentIndex: clampIndex(session, session.currentIndex - 1) };
    case 'submit':
      return { ...session, status: 'submitted', submittedAt: action.at };
  }
}

export function unansweredIndexes(session: TestSession): number[] {
  return session.items
    .map((item, index) => (isAnswered(session.answers[item.question.meta.questionId]) ? -1 : index))
    .filter((index) => index !== -1);
}

export interface TestResultItem {
  item: SessionItem;
  index: number;
  response: UserResponse | undefined;
  status: OutcomeStatus;
}

export interface TestResults {
  items: TestResultItem[];
  summary: ScoreSummary;
  records: GradedRecord[];
}

/** Grades every question from the recorded answers. */
export function gradeTest(session: TestSession): TestResults {
  const items = session.items.map((item, index) => {
    const response = session.answers[item.question.meta.questionId];
    return { item, index, response, status: gradeResponse(item.question, response) };
  });
  return {
    items,
    summary: summarize(items.map((i) => i.status)),
    records: items.map((i) => ({ meta: i.item.question.meta, status: i.status })),
  };
}

// ---------------------------------------------------------------------------
// Persistence: lets an in-progress or just-finished test survive a reload.
// ---------------------------------------------------------------------------

interface StoredTestSession {
  version: 1;
  session: TestSession;
}

/** Saves the session; if it doesn't fit in storage, removes any older saved session so it can't be resumed by mistake. */
export function saveTestSession(session: TestSession): boolean {
  const saved = writeJson(STORAGE_KEYS.testSession, { version: 1, session } satisfies StoredTestSession);
  if (!saved) removeKey(STORAGE_KEYS.testSession);
  return saved;
}

export function loadTestSession(): TestSession | null {
  const stored = readJson<StoredTestSession>(STORAGE_KEYS.testSession);
  const session = stored?.version === 1 ? stored.session : null;
  if (!session || !Array.isArray(session.items) || session.items.length === 0 || typeof session.answers !== 'object') {
    return null;
  }
  const valid = session.items.every(
    (item) => item?.question?.meta?.questionId && Array.isArray(item.choiceOrder) && (item.question.kind === 'mcq' || item.question.kind === 'spr'),
  );
  return valid ? { ...session, currentIndex: clampIndex(session, session.currentIndex ?? 0) } : null;
}

export function clearTestSession(): void {
  removeKey(STORAGE_KEYS.testSession);
}
