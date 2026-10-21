import { createContext, useContext } from 'react';
import type { QuestionRepository } from '../data/repository';
import type { QuestionMeta, SubjectCatalog, SubjectId } from '../data/types';
import type { StudyConfig } from '../state/config';
import type { PracticeAction, PracticeState, StoredPracticeSession } from '../state/practiceSession';
import type { TestAction, TestSession } from '../state/testSession';

export interface CatalogEntry {
  status: 'idle' | 'loading' | 'ready' | 'error';
  catalog?: SubjectCatalog;
  error?: string;
}

export interface DataContextValue {
  repository: QuestionRepository;
  catalogs: Record<SubjectId, CatalogEntry>;
  /** Starts loading a subject's question list if it isn't loaded or loading already. */
  loadCatalog(subject: SubjectId, options?: { force?: boolean }): void;
}

export interface ConfigContextValue {
  config: StudyConfig;
  updateConfig(update: (config: StudyConfig) => StudyConfig): void;
}

/** A test the user asked for that is still being generated. */
export interface TestRequest {
  /** Unique per request, so retrying or changing the request starts generation afresh. */
  id: number;
  config: StudyConfig;
  pool: QuestionMeta[];
  count: number;
}

export interface SessionContextValue {
  practice: PracticeState | null;
  dispatchPractice(action: PracticeAction): void;
  startPractice(config: StudyConfig, pool: QuestionMeta[]): void;
  /** A practice session saved before the page was reloaded, if any. */
  storedPractice: StoredPracticeSession | null;
  resumeStoredPractice(): Promise<boolean>;
  discardStoredPractice(): void;

  test: TestSession | null;
  dispatchTest(action: TestAction): void;
  setTest(session: TestSession | null): void;
  testRequest: TestRequest | null;
  requestTest(request: Omit<TestRequest, 'id'>): void;
  clearTestRequest(): void;
}

export const DataContext = createContext<DataContextValue | null>(null);
export const ConfigContext = createContext<ConfigContextValue | null>(null);
export const SessionContext = createContext<SessionContextValue | null>(null);

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside <AppProviders>.`);
  return value;
}

export const useData = () => required(useContext(DataContext), 'useData');
export const useConfig = () => required(useContext(ConfigContext), 'useConfig');
export const useSessions = () => required(useContext(SessionContext), 'useSessions');
