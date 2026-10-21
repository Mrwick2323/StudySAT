import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/qbankClient';
import { useData, useSessions, type TestRequest } from '../app/contexts';
import { describeError } from '../app/errors';
import { navigate } from '../app/router';
import { TestChoices } from '../components/Choices';
import { ConfirmDialog, ProgressBar, StatusPanel } from '../components/Feedback';
import { FreeResponseInput } from '../components/FreeResponseInput';
import { ArrowLeftIcon, ArrowRightIcon, GridIcon } from '../components/Icons';
import { QuestionView } from '../components/QuestionView';
import { generateTest, TestGenerationError } from '../data/testGenerator';
import { checkFreeResponseInput, isAnswered } from '../data/validation';
import { createTestSession, unansweredIndexes, type TestSession } from '../state/testSession';

function TestPreparation({ request }: { request: TestRequest }) {
  const { repository } = useData();
  const { setTest, clearTestRequest, requestTest } = useSessions();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>(null);

  // Runs once per request; retrying issues a new request, which remounts this component.
  useEffect(() => {
    const controller = new AbortController();
    generateTest({
      pool: request.pool,
      count: request.count,
      mix: request.config.mix,
      shuffleChoices: request.config.shuffleChoices,
      loadQuestion: (meta, options) => repository.loadQuestion(meta, options),
      signal: controller.signal,
      onProgress: (loaded) => setProgress(loaded),
    })
      .then(({ items, skipped }) => {
        if (controller.signal.aborted) return;
        setTest(createTestSession(request.config, items, skipped));
        clearTestRequest();
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e);
      });
    return () => controller.abort();
  }, [request, repository, setTest, clearTestRequest]);

  const cancel = () => {
    clearTestRequest();
    navigate({ name: 'setup', mode: 'test' });
  };

  if (error) {
    if (error instanceof TestGenerationError && error.kind === 'insufficient' && error.available > 0) {
      return (
        <div className="page">
          <StatusPanel
            tone="error"
            title="Not enough questions for this test"
            actions={
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => requestTest({ config: request.config, pool: request.pool, count: error.available })}
                >
                  Start a {error.available}-question test
                </button>
                <button type="button" className="btn btn--ghost" onClick={cancel}>
                  Change settings
                </button>
              </>
            }
          >
            <p>{error.message}</p>
            <p className="muted">Some questions in the bank are missing data and can’t be used. Questions are never added from outside your selection.</p>
          </StatusPanel>
        </div>
      );
    }
    const retryable = error instanceof ApiError && error.isTransient;
    return (
      <div className="page">
        <StatusPanel
          tone="error"
          title="Couldn’t prepare your test"
          onRetry={retryable ? () => requestTest({ config: request.config, pool: request.pool, count: request.count }) : undefined}
          actions={
            <button type="button" className="btn btn--ghost" onClick={cancel}>
              Change settings
            </button>
          }
        >
          <p>{describeError(error)}</p>
        </StatusPanel>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="status-panel" aria-busy="true">
        <h1 className="status-panel__title">Preparing your test…</h1>
        <p role="status">
          Loaded {progress} of {request.count} questions from the College Board question bank.
        </p>
        <ProgressBar value={progress} max={request.count} label="Questions loaded" />
        <div className="status-panel__actions">
          <button type="button" className="btn btn--ghost" onClick={cancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function QuestionNavigator({ session, onGoTo }: { session: TestSession; onGoTo(index: number): void }) {
  return (
    <nav className="navigator" aria-label="Questions">
      <ol className="navigator__grid">
        {session.items.map((item, index) => {
          const answered = isAnswered(session.answers[item.question.meta.questionId]);
          const current = index === session.currentIndex;
          return (
            <li key={item.question.meta.questionId}>
              <button
                type="button"
                className={`navigator__item${answered ? ' navigator__item--answered' : ''}${current ? ' navigator__item--current' : ''}`}
                aria-current={current ? 'step' : undefined}
                aria-label={`Question ${index + 1}, ${answered ? 'answered' : 'unanswered'}`}
                onClick={() => onGoTo(index)}
              >
                {index + 1}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="navigator__legend">
        <span className="navigator__swatch navigator__swatch--answered" aria-hidden="true" /> Answered
        <span className="navigator__swatch" aria-hidden="true" /> Unanswered
      </p>
    </nav>
  );
}

function TestTaking({ session }: { session: TestSession }) {
  const { dispatchTest: dispatch } = useSessions();
  const [showNavigator, setShowNavigator] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const total = session.items.length;
  const index = session.currentIndex;
  const item = session.items[index]!;
  const questionId = item.question.meta.questionId;
  const response = session.answers[questionId];
  const unanswered = unansweredIndexes(session);
  const isLast = index === total - 1;

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [index]);

  const goTo = (i: number) => dispatch({ type: 'go-to', index: i });
  const submit = () => {
    setConfirmSubmit(false);
    dispatch({ type: 'submit', at: Date.now() });
  };
  const requestSubmit = () => (unanswered.length > 0 ? setConfirmSubmit(true) : submit());

  const sprValue = response?.kind === 'spr' ? response.value : '';
  const sprCheck = sprValue.trim() ? checkFreeResponseInput(sprValue) : null;

  return (
    <div className="page test">
      <div className="test-bar">
        <div className="test-bar__top">
          <p className="test-bar__counter">
            Question <strong>{index + 1}</strong> of {total}
          </p>
          <p className="test-bar__answered">
            {total - unanswered.length} answered
            {unanswered.length > 0 && (
              <span className="badge badge--warning">{unanswered.length} unanswered</span>
            )}
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-expanded={showNavigator}
            aria-controls="question-navigator"
            onClick={() => setShowNavigator((v) => !v)}
          >
            <GridIcon size={18} /> {showNavigator ? 'Hide questions' : 'All questions'}
          </button>
        </div>
        <ProgressBar value={index + 1} max={total} label={`Question ${index + 1} of ${total}`} />
        <div id="question-navigator" hidden={!showNavigator}>
          <QuestionNavigator session={session} onGoTo={goTo} />
        </div>
      </div>

      <div className="test__card">
        <QuestionView key={questionId} question={item.question} heading={`Question ${index + 1} of ${total}`} headingRef={headingRef}>
          {item.question.kind === 'mcq' ? (
            <TestChoices
              item={item}
              selectedId={response?.kind === 'mcq' ? response.choiceId : null}
              onSelect={(choiceId) => dispatch({ type: 'answer', questionId, response: { kind: 'mcq', choiceId } })}
            />
          ) : (
            <FreeResponseInput
              id={`spr-${questionId}`}
              value={sprValue}
              onChange={(value) => dispatch({ type: 'answer', questionId, response: { kind: 'spr', value } })}
              error={sprCheck && !sprCheck.ok ? `${sprCheck.message} As written, this entry would be marked incorrect.` : null}
            />
          )}
          <div className="test__answer-tools">
            {isAnswered(response) ? (
              <button type="button" className="link-button" onClick={() => dispatch({ type: 'clear', questionId })}>
                Clear answer
              </button>
            ) : (
              <span className="muted small">Not answered yet</span>
            )}
          </div>
        </QuestionView>
      </div>

      <div className="test-nav">
        <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: 'previous' })} disabled={index === 0}>
          <ArrowLeftIcon size={18} /> Previous
        </button>
        <a className="link-button test-nav__exit" href="#/">
          Save and exit
        </a>
        {isLast ? (
          <button type="button" className="btn btn--primary" onClick={requestSubmit}>
            Submit test
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'next' })}>
            Next <ArrowRightIcon size={18} />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title={`Submit with ${unanswered.length} unanswered question${unanswered.length === 1 ? '' : 's'}?`}
        confirmLabel="Submit anyway"
        cancelLabel="Keep working"
        onConfirm={submit}
        onCancel={() => setConfirmSubmit(false)}
        extraActions={
          unanswered.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setConfirmSubmit(false);
                goTo(unanswered[0]!);
              }}
            >
              Go to question {unanswered[0]! + 1}
            </button>
          )
        }
      >
        <p>
          Unanswered: {unanswered.map((i) => i + 1).join(', ')}. Unanswered questions are scored as not correct. You can’t change
          answers after submitting.
        </p>
      </ConfirmDialog>
    </div>
  );
}

export function TestScreen() {
  const { test, testRequest } = useSessions();
  const submitted = test?.status === 'submitted' && !testRequest;

  useEffect(() => {
    if (submitted) navigate({ name: 'test-results' }, { replace: true });
  }, [submitted]);

  if (testRequest) return <TestPreparation key={testRequest.id} request={testRequest} />;
  if (!test) {
    return (
      <div className="page">
        <StatusPanel
          title="No test in progress"
          actions={
            <a className="btn btn--primary" href="#/test/setup">
              Build a test
            </a>
          }
        >
          <p>Choose your subjects, skills and number of questions to generate a test.</p>
        </StatusPanel>
      </div>
    );
  }
  if (submitted) return null;
  return <TestTaking session={test} />;
}
