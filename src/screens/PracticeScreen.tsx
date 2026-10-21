import { useEffect, useRef, useState } from 'react';
import { useData, useSessions } from '../app/contexts';
import { describeError } from '../app/errors';
import { navigate } from '../app/router';
import { correctAnswerLabel } from '../components/answerLabels';
import { PracticeChoices } from '../components/Choices';
import { Explanation } from '../components/Explanation';
import { ConfirmDialog, ProgressBar, Spinner, StatusPanel } from '../components/Feedback';
import { FreeResponseInput } from '../components/FreeResponseInput';
import { ArrowRightIcon, CheckIcon, CrossIcon, FlameIcon } from '../components/Icons';
import { QuestionView } from '../components/QuestionView';
import { isQuestionUnavailableError } from '../data/repository';
import { createSessionItem } from '../data/sampling';
import { formatPercent, summarize } from '../data/scoring';
import { checkFreeResponseInput } from '../data/validation';
import { currentStreak, practiceRecords, roundProgress, type PracticeState } from '../state/practiceSession';

function Hud({ state, onEnd }: { state: PracticeState; onEnd(): void }) {
  const summary = summarize(practiceRecords(state).map((r) => r.status));
  const streak = currentStreak(state.history);
  const progress = roundProgress(state);
  return (
    <div className="hud">
      <div className="hud__stats">
        <div className="hud__stat">
          <span className="hud__label">Answered</span>
          <span className="hud__value">{summary.answered}</span>
        </div>
        <div className="hud__stat">
          <span className="hud__label">Score</span>
          <span className="hud__value" key={summary.correct} data-bump={summary.correct > 0 || undefined}>
            {summary.correct}
          </span>
        </div>
        <div className="hud__stat">
          <span className="hud__label">Accuracy</span>
          <span className="hud__value">{formatPercent(summary.accuracy)}</span>
        </div>
        <div className={`hud__stat hud__streak${streak >= 3 ? ' hud__streak--hot' : ''}`}>
          <span className="hud__label">Streak</span>
          <span className="hud__value">
            <FlameIcon size={20} /> {streak}
          </span>
        </div>
      </div>
      <button type="button" className="btn btn--ghost btn--small" onClick={onEnd}>
        End session
      </button>
      <div className="hud__progress">
        <ProgressBar value={progress.seen} max={progress.total} label="Progress through the matching questions" tone="accent" />
        <span className="hud__progress-label">
          {progress.seen.toLocaleString()} of {progress.total.toLocaleString()} matching questions
          {state.round > 1 ? ` · round ${state.round}` : ''}
        </span>
      </div>
    </div>
  );
}

interface PracticeFreeResponseProps {
  questionId: string;
  /** The submitted entry once answered; the field is locked from then on. */
  submittedValue: string | null;
  onSubmit(value: string): void;
}

/** Free-response entry for one question. Keyed by question id, so it starts empty for each question. */
function PracticeFreeResponse({ questionId, submittedValue, onSubmit }: PracticeFreeResponseProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const locked = submittedValue !== null;

  const submit = () => {
    const check = checkFreeResponseInput(value);
    if (!check.ok) {
      setError(check.message);
      ref.current?.focus();
      return;
    }
    setError(null);
    onSubmit(check.value);
  };

  return (
    <FreeResponseInput
      ref={ref}
      id={`spr-${questionId}`}
      value={locked ? submittedValue : value}
      onChange={(v) => {
        setValue(v);
        if (error) setError(null);
      }}
      onEnter={locked ? undefined : submit}
      disabled={locked}
      error={error}
    >
      {!locked && (
        <button type="button" className="btn btn--primary" onClick={submit}>
          Check answer
        </button>
      )}
    </FreeResponseInput>
  );
}

export function PracticeScreen() {
  const { practice: state, dispatchPractice: dispatch } = useSessions();
  const { repository } = useData();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const phase = state?.phase;
  const loadingMeta = phase === 'loading' ? state?.deck[0] : undefined;
  const shuffleChoices = state?.config.shuffleChoices ?? false;
  const currentId = state?.current?.item.question.meta.questionId;

  // Load the question at the top of the deck.
  useEffect(() => {
    if (!loadingMeta) return;
    const controller = new AbortController();
    repository
      .loadQuestion(loadingMeta, { signal: controller.signal })
      .then((question) => dispatch({ type: 'loaded', questionId: loadingMeta.questionId, item: createSessionItem(question, shuffleChoices) }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isQuestionUnavailableError(error)) {
          dispatch({ type: 'unavailable', questionId: loadingMeta.questionId, reason: describeError(error) });
        } else {
          dispatch({ type: 'load-failed', questionId: loadingMeta.questionId, message: describeError(error) });
        }
      });
    return () => controller.abort();
  }, [loadingMeta, repository, dispatch, shuffleChoices]);

  // Prefetch the next question while this one is on screen.
  const upcoming = phase === 'question' || phase === 'feedback' ? state?.deck[0] : undefined;
  useEffect(() => {
    if (upcoming) repository.loadQuestion(upcoming).catch(() => {});
  }, [upcoming, repository]);

  // New question: move focus to it for screen-reader and keyboard users.
  useEffect(() => {
    if (!currentId) return;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentId]);

  useEffect(() => {
    if (phase === 'feedback') nextRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Keyboard shortcuts: A–D or 1–4 to answer, Enter/N for the next question.
  useEffect(() => {
    if (!state?.current) return;
    const { item } = state.current;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (document.querySelector('dialog[open]')) return;
      if (phase === 'question' && item.question.kind === 'mcq') {
        const key = event.key.toUpperCase();
        const index = /^[1-9]$/.test(key) ? Number(key) - 1 : key.length === 1 ? key.charCodeAt(0) - 65 : -1;
        const choiceId = item.choiceOrder[index];
        if (index >= 0 && choiceId) {
          event.preventDefault();
          dispatch({ type: 'answer', response: { kind: 'mcq', choiceId } });
        }
      } else if (phase === 'feedback' && (event.key === 'n' || event.key === 'N')) {
        event.preventDefault();
        dispatch({ type: 'next' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, phase, dispatch]);

  // Once the session ends, show the summary (replacing this page in history).
  useEffect(() => {
    if (phase === 'ended') navigate({ name: 'practice-summary' }, { replace: true });
  }, [phase]);

  if (!state) {
    return (
      <div className="page">
        <StatusPanel
          title="No practice session in progress"
          actions={
            <a className="btn btn--primary" href="#/practice/setup">
              Set up practice
            </a>
          }
        >
          <p>Choose subjects and skills to start an endless practice session.</p>
        </StatusPanel>
      </div>
    );
  }

  const endSession = () => {
    setConfirmEnd(false);
    dispatch({ type: 'end' });
  };

  if (phase === 'ended') return null;

  const current = state.current;
  // The answered question is already in history while its feedback is shown.
  const questionNumber = state.history.length + state.passedOver + (phase === 'feedback' ? 0 : 1);

  return (
    <div className="page practice">
      <Hud state={state} onEnd={() => (state.history.length > 0 || current ? setConfirmEnd(true) : endSession())} />

      {state.unavailable.length > 0 && (
        <p className="notice notice--muted small">
          {state.unavailable.length} question{state.unavailable.length === 1 ? ' was' : 's were'} skipped because the question
          bank’s data for {state.unavailable.length === 1 ? 'it' : 'them'} couldn’t be used.
        </p>
      )}

      {phase === 'loading' && (
        <div className="question-skeleton" aria-busy="true">
          <Spinner label="Loading the next question…" />
        </div>
      )}

      {phase === 'error' && (
        <StatusPanel
          tone="error"
          title="Couldn’t load the next question"
          onRetry={() => dispatch({ type: 'retry' })}
          actions={
            <button type="button" className="btn btn--ghost" onClick={endSession}>
              End session
            </button>
          }
        >
          <p>{state.error}</p>
          <p className="muted">Your progress so far is saved.</p>
        </StatusPanel>
      )}

      {phase === 'exhausted' && (
        <StatusPanel
          title={state.history.length === 0 && state.pool.length === state.unavailable.length ? 'No usable questions' : 'You’ve seen every matching question'}
          actions={
            <>
              {state.pool.length > state.unavailable.length && (
                <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: 'reshuffle' })}>
                  Reshuffle and keep going
                </button>
              )}
              <button type="button" className="btn btn--ghost" onClick={endSession}>
                See summary
              </button>
              <a className="btn btn--ghost" href="#/practice/setup">
                Change settings
              </a>
            </>
          }
        >
          {state.pool.length === state.unavailable.length ? (
            <p>None of the questions that match your settings could be loaded from the question bank. Try different skills.</p>
          ) : (
            <p>
              That’s all {(state.pool.length - state.unavailable.length).toLocaleString()} questions that match your settings. Reshuffle
              to go through them again, or add more skills.
            </p>
          )}
        </StatusPanel>
      )}

      {current && (phase === 'question' || phase === 'feedback') && (
        <div className={`practice__card${phase === 'feedback' ? ` practice__card--${current.status}` : ''}`}>
          <QuestionView question={current.item.question} heading={`Question ${questionNumber}`} headingRef={headingRef}>
            {current.item.question.kind === 'mcq' ? (
              <PracticeChoices
                item={current.item}
                selectedId={current.response?.kind === 'mcq' ? current.response.choiceId : null}
                onAnswer={(choiceId) => dispatch({ type: 'answer', response: { kind: 'mcq', choiceId } })}
              />
            ) : (
              <PracticeFreeResponse
                key={current.item.question.meta.questionId}
                questionId={current.item.question.meta.questionId}
                submittedValue={current.response?.kind === 'spr' ? current.response.value : null}
                onSubmit={(value) => dispatch({ type: 'answer', response: { kind: 'spr', value } })}
              />
            )}

            {phase === 'question' && (
              <div className="practice__actions">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => dispatch({ type: 'skip' })}>
                  Skip this question
                </button>
                {current.item.question.kind === 'mcq' && (
                  <span className="muted small kbd-hint">
                    Tip: press <kbd>A</kbd>–<kbd>{String.fromCharCode(64 + current.item.choiceOrder.length)}</kbd> to answer
                  </span>
                )}
              </div>
            )}
          </QuestionView>

          <div className="practice__feedback" role="status" aria-live="polite">
            {phase === 'feedback' && current.status && (
              <div className={`verdict verdict--${current.status}`}>
                <span className="verdict__icon" aria-hidden="true">
                  {current.status === 'correct' ? <CheckIcon size={28} /> : <CrossIcon size={28} />}
                </span>
                <div>
                  <p className="verdict__title">{current.status === 'correct' ? 'Correct!' : 'Not quite.'}</p>
                  <p className="verdict__detail">
                    {current.status === 'correct'
                      ? currentStreak(state.history) >= 3
                        ? `${currentStreak(state.history)} in a row. Keep it going.`
                        : 'Nice work.'
                      : `The correct answer is ${correctAnswerLabel(current.item)}.`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {phase === 'feedback' && current.status && (
            <>
              <div className="practice__next">
                <button ref={nextRef} type="button" className="btn btn--primary btn--large" onClick={() => dispatch({ type: 'next' })}>
                  Next question <ArrowRightIcon size={20} />
                </button>
                <span className="muted small kbd-hint">
                  or press <kbd>N</kbd>
                </span>
              </div>
              <section className="panel" aria-labelledby="explanation-heading">
                <h3 id="explanation-heading" className="panel__title">
                  Explanation
                </h3>
                <Explanation item={current.item} response={current.response} status={current.status} />
              </section>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmEnd}
        title="End this practice session?"
        confirmLabel="End and see summary"
        cancelLabel="Keep practicing"
        onConfirm={endSession}
        onCancel={() => setConfirmEnd(false)}
      >
        <p>
          You’ve answered {state.history.length} question{state.history.length === 1 ? '' : 's'}.
          {phase === 'question' ? ' The question on screen hasn’t been answered and won’t be counted.' : ''}
        </p>
      </ConfirmDialog>
    </div>
  );
}
