import { useMemo, useState } from 'react';
import { useConfig, useData, useSessions } from '../app/contexts';
import { describeError } from '../app/errors';
import { navigate } from '../app/router';
import { correctAnswerLabel, responseLabel } from '../components/answerLabels';
import { BreakdownTable } from '../components/Breakdown';
import { ReviewChoices } from '../components/Choices';
import { Explanation } from '../components/Explanation';
import { ScoreRing, StatusPanel } from '../components/Feedback';
import { CheckIcon, ChevronDownIcon, CrossIcon, MinusCircleIcon, RefreshIcon } from '../components/Icons';
import { QuestionView } from '../components/QuestionView';
import { filterQuestions } from '../data/filter';
import { SUBJECT_ORDER } from '../data/taxonomy';
import type { OutcomeStatus } from '../data/types';
import { configToFilter, type CatalogMap } from '../state/config';
import { gradeTest, retakeTestSession, type TestResultItem } from '../state/testSession';

type ReviewFilter = 'all' | OutcomeStatus;

const STATUS_TEXT: Record<OutcomeStatus, string> = { correct: 'Correct', incorrect: 'Incorrect', unanswered: 'Unanswered' };

function StatusBadge({ status }: { status: OutcomeStatus }) {
  const Icon = status === 'correct' ? CheckIcon : status === 'incorrect' ? CrossIcon : MinusCircleIcon;
  return (
    <span className={`status-badge status-badge--${status}`}>
      <Icon size={16} /> {STATUS_TEXT[status]}
    </span>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ReviewItem({ result, total, expanded, onToggle }: { result: TestResultItem; total: number; expanded: boolean; onToggle(): void }) {
  const { item, status, response, index } = result;
  const yours = responseLabel(item, response);
  const panelId = `explanation-${item.question.meta.questionId}`;
  return (
    <li className={`review-item review-item--${status}`}>
      <div className="review-item__status">
        <StatusBadge status={status} />
      </div>
      <QuestionView question={item.question} heading={`Question ${index + 1} of ${total}`} headingLevel={3}>
        {item.question.kind === 'mcq' && (
          <ReviewChoices item={item} selectedId={response?.kind === 'mcq' ? response.choiceId : null} />
        )}
        <dl className="review-item__answers">
          <div>
            <dt>Your answer</dt>
            <dd>{yours ?? <em>Not answered</em>}</dd>
          </div>
          <div>
            <dt>Correct answer</dt>
            <dd>{correctAnswerLabel(item)}</dd>
          </div>
        </dl>
      </QuestionView>
      <button type="button" className="review-item__toggle" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
        {expanded ? 'Hide explanation' : 'Show explanation'}
        <ChevronDownIcon size={18} className={expanded ? 'rotate-180' : undefined} />
      </button>
      <div id={panelId} className="review-item__explanation" hidden={!expanded}>
        {expanded && <Explanation item={item} response={response} status={status} />}
      </div>
    </li>
  );
}

export function TestResultsScreen() {
  const { test, setTest, requestTest } = useSessions();
  const { repository } = useData();
  const { updateConfig } = useConfig();
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => (test?.status === 'submitted' ? gradeTest(test) : null), [test]);

  if (!test || !results) {
    return (
      <div className="page">
        <StatusPanel
          title={test ? 'This test hasn’t been submitted yet' : 'No test results to show'}
          actions={
            test ? (
              <a className="btn btn--primary" href="#/test">
                Return to the test
              </a>
            ) : (
              <a className="btn btn--primary" href="#/test/setup">
                Build a test
              </a>
            )
          }
        />
      </div>
    );
  }

  const { summary } = results;
  const counts: Record<ReviewFilter, number> = {
    all: summary.total,
    correct: summary.correct,
    incorrect: summary.incorrect,
    unanswered: summary.unanswered,
  };
  const visible = results.items.filter((r) => filter === 'all' || r.status === filter);
  const allVisibleExpanded = visible.length > 0 && visible.every((r) => expanded.has(r.item.question.meta.questionId));

  const retake = () => {
    setTest(retakeTestSession(test));
    navigate({ name: 'test' });
  };

  const newTest = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const subjects = SUBJECT_ORDER.filter((s) => test.config.subjects[s]);
      const loaded = await Promise.all(subjects.map((s) => repository.loadCatalog(s)));
      const catalogs: CatalogMap = Object.fromEntries(loaded.map((c) => [c.subject, c]));
      const pool = filterQuestions(loaded.flatMap((c) => c.questions), configToFilter(test.config, catalogs));
      setTest(null);
      requestTest({ config: test.config, pool, count: test.items.length });
      navigate({ name: 'test' });
    } catch (error) {
      setActionError(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const changeSettings = () => {
    updateConfig(() => ({ ...test.config, testLength: test.items.length }));
    navigate({ name: 'setup', mode: 'test' });
  };

  return (
    <div className="page results">
      <header className="page-header">
        <p className="eyebrow">Custom Test</p>
        <h1>Your results</h1>
      </header>

      <section className="score-hero" aria-label="Score">
        <ScoreRing ratio={summary.percent} label="score" size={150} />
        <div>
          <p className="score-hero__headline">
            <strong>{summary.correct}</strong> of {summary.total} correct
          </p>
          <dl className="stat-grid">
            <div className="stat stat--correct">
              <dt>
                <CheckIcon size={16} /> Correct
              </dt>
              <dd>{summary.correct}</dd>
            </div>
            <div className="stat stat--incorrect">
              <dt>
                <CrossIcon size={16} /> Incorrect
              </dt>
              <dd>{summary.incorrect}</dd>
            </div>
            <div className="stat stat--unanswered">
              <dt>
                <MinusCircleIcon size={16} /> Unanswered
              </dt>
              <dd>{summary.unanswered}</dd>
            </div>
            {test.submittedAt && (
              <div className="stat">
                <dt>Time</dt>
                <dd className="stat__small">{formatDuration(test.submittedAt - test.createdAt)}</dd>
              </div>
            )}
          </dl>
          <p className="muted small">The score counts unanswered questions as not correct. This isn’t a scaled SAT score.</p>
        </div>
      </section>

      <div className="action-row">
        <button type="button" className="btn btn--primary" onClick={retake}>
          <RefreshIcon size={18} /> Retake this test
        </button>
        <button type="button" className="btn btn--ghost" onClick={newTest} disabled={busy}>
          {busy ? 'Preparing…' : 'New test, same settings'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={changeSettings}>
          Change settings
        </button>
      </div>
      {actionError && (
        <p className="field-error" role="alert">
          {actionError}
        </p>
      )}

      <BreakdownTable records={results.records} showUnanswered measure="percent" />

      <section className="review" aria-labelledby="review-heading">
        <div className="review__header">
          <h2 id="review-heading">Question review</h2>
          <div className="review__controls">
            <div className="segmented" role="group" aria-label="Show questions">
              {(['all', 'correct', 'incorrect', 'unanswered'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`segmented__option${filter === value ? ' segmented__option--active' : ''}`}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === 'all' ? 'All' : STATUS_TEXT[value]} <span className="segmented__count">{counts[value]}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={visible.length === 0}
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  for (const r of visible) {
                    if (allVisibleExpanded) next.delete(r.item.question.meta.questionId);
                    else next.add(r.item.question.meta.questionId);
                  }
                  return next;
                })
              }
            >
              {allVisibleExpanded ? 'Collapse all explanations' : 'Expand all explanations'}
            </button>
          </div>
        </div>
        {test.replaced.length > 0 && (
          <p className="muted small">
            {test.replaced.length} drawn question{test.replaced.length === 1 ? ' was' : 's were'} replaced with another matching question
            because the question bank’s data couldn’t be used.
          </p>
        )}
        {visible.length === 0 ? (
          <p className="notice">No {filter === 'all' ? '' : STATUS_TEXT[filter as OutcomeStatus].toLowerCase()} questions.</p>
        ) : (
          <ol className="review__list" aria-labelledby="review-heading">
            {visible.map((result) => {
              const id = result.item.question.meta.questionId;
              return (
                <ReviewItem
                  key={id}
                  result={result}
                  total={summary.total}
                  expanded={expanded.has(id)}
                  onToggle={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
