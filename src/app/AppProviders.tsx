import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { questionRepository, type QuestionRepository } from '../data/repository';
import { SUBJECT_ORDER } from '../data/taxonomy';
import type { QuestionMeta, SubjectId } from '../data/types';
import { loadConfig, saveConfig, type StudyConfig } from '../state/config';
import {
  clearPracticeSession,
  createPracticeState,
  loadStoredPracticeSession,
  practiceReducer,
  restorePracticeState,
  savePracticeSession,
  type PracticeAction,
  type PracticeState,
  type StoredPracticeSession,
} from '../state/practiceSession';
import { loadTestSession, saveTestSession, testReducer, type TestAction, type TestSession } from '../state/testSession';
import {
  ConfigContext,
  DataContext,
  SessionContext,
  type CatalogEntry,
  type ConfigContextValue,
  type DataContextValue,
  type SessionContextValue,
  type TestRequest,
} from './contexts';
import { describeError } from './errors';

interface AppProvidersProps {
  children: ReactNode;
  /** Injected in tests; the app uses the shared College Board repository. */
  repository?: QuestionRepository;
}

const IDLE: CatalogEntry = { status: 'idle' };

export function AppProviders({ children, repository = questionRepository }: AppProvidersProps) {
  // --- Question data --------------------------------------------------------
  const [catalogs, setCatalogs] = useState<Record<SubjectId, CatalogEntry>>({ rw: IDLE, math: IDLE });
  const inFlight = useRef(new Set<SubjectId>());
  const loaded = useRef(new Set<SubjectId>());

  const loadCatalog = useCallback<DataContextValue['loadCatalog']>(
    (subject, { force = false } = {}) => {
      if (inFlight.current.has(subject) || (loaded.current.has(subject) && !force)) return;
      inFlight.current.add(subject);
      setCatalogs((prev) => ({ ...prev, [subject]: { ...prev[subject], status: 'loading', error: undefined } }));
      repository
        .loadCatalog(subject, { forceRefresh: force })
        .then((catalog) => {
          loaded.current.add(subject);
          setCatalogs((prev) => ({ ...prev, [subject]: { status: 'ready', catalog } }));
        })
        .catch((error: unknown) =>
          setCatalogs((prev) => ({ ...prev, [subject]: { ...prev[subject], status: 'error', error: describeError(error) } })),
        )
        .finally(() => inFlight.current.delete(subject));
    },
    [repository],
  );

  const data = useMemo<DataContextValue>(() => ({ repository, catalogs, loadCatalog }), [repository, catalogs, loadCatalog]);

  // --- Configuration --------------------------------------------------------
  const [config, setConfig] = useState<StudyConfig>(loadConfig);
  const updateConfig = useCallback<ConfigContextValue['updateConfig']>((update) => {
    setConfig((prev) => {
      const next = update(prev);
      saveConfig(next);
      return next;
    });
  }, []);
  const configValue = useMemo<ConfigContextValue>(() => ({ config, updateConfig }), [config, updateConfig]);

  // --- Sessions -------------------------------------------------------------
  const [practice, setPractice] = useState<PracticeState | null>(null);
  const [storedPractice, setStoredPractice] = useState<StoredPracticeSession | null>(loadStoredPracticeSession);
  const [test, setTestState] = useState<TestSession | null>(loadTestSession);
  const [testRequest, setTestRequest] = useState<TestRequest | null>(null);

  const dispatchPractice = useCallback((action: PracticeAction) => {
    setPractice((state) => (state ? practiceReducer(state, action) : state));
  }, []);

  const startPractice = useCallback((sessionConfig: StudyConfig, pool: QuestionMeta[]) => {
    setStoredPractice(null);
    setPractice(createPracticeState(sessionConfig, pool));
  }, []);

  const resumeStoredPractice = useCallback(async () => {
    if (!storedPractice) return false;
    const subjects = SUBJECT_ORDER.filter((s) => storedPractice.config.subjects[s]);
    try {
      const loaded = await Promise.all(subjects.map((s) => repository.loadCatalog(s)));
      const byId = new Map(loaded.flatMap((c) => c.questions.map((q) => [q.questionId, q] as const)));
      const restored = restorePracticeState(storedPractice, (id) => byId.get(id));
      if (!restored) return false;
      setStoredPractice(null);
      setPractice(restored);
      return true;
    } catch {
      return false;
    }
  }, [storedPractice, repository]);

  const discardStoredPractice = useCallback(() => {
    clearPracticeSession();
    setStoredPractice(null);
  }, []);

  // Keep the saved practice session in step with the live one.
  useEffect(() => {
    if (!practice) return;
    if (practice.phase === 'ended') clearPracticeSession();
    else savePracticeSession(practice);
  }, [practice]);

  const dispatchTest = useCallback((action: TestAction) => {
    setTestState((session) => (session ? testReducer(session, action) : session));
  }, []);

  useEffect(() => {
    if (test) saveTestSession(test);
  }, [test]);

  const clearTestRequest = useCallback(() => setTestRequest(null), []);
  const requestCounter = useRef(0);
  const requestTest = useCallback<SessionContextValue['requestTest']>((request) => {
    requestCounter.current += 1;
    setTestRequest({ ...request, id: requestCounter.current });
  }, []);

  const sessions = useMemo<SessionContextValue>(
    () => ({
      practice,
      dispatchPractice,
      startPractice,
      storedPractice,
      resumeStoredPractice,
      discardStoredPractice,
      test,
      dispatchTest,
      setTest: setTestState,
      testRequest,
      requestTest,
      clearTestRequest,
    }),
    [
      practice,
      dispatchPractice,
      startPractice,
      storedPractice,
      resumeStoredPractice,
      discardStoredPractice,
      test,
      dispatchTest,
      testRequest,
      requestTest,
      clearTestRequest,
    ],
  );

  return (
    <DataContext.Provider value={data}>
      <ConfigContext.Provider value={configValue}>
        <SessionContext.Provider value={sessions}>{children}</SessionContext.Provider>
      </ConfigContext.Provider>
    </DataContext.Provider>
  );
}
