import { useSessions } from '../app/contexts';
import { navigate } from '../app/router';
import { BreakdownTable } from '../components/Breakdown';
import { ScoreRing, StatusPanel } from '../components/Feedback';
import { CheckIcon, CrossIcon, FlameIcon, RefreshIcon } from '../components/Icons';
import { summarize } from '../data/scoring';
import { bestStreak, practiceRecords } from '../state/practiceSession';

export function PracticeSummaryScreen() {
  const { practice, startPractice } = useSessions();

  if (!practice) {
    return (
      <div className="page">
        <StatusPanel
          title="No practice session to summarize"
          actions={
            <a className="btn btn--primary" href="#/practice/setup">
              Start practicing
            </a>
          }
        />
      </div>
    );
  }

  const records = practiceRecords(practice);
  const summary = summarize(records.map((r) => r.status));

  const restart = () => {
    const unavailable = new Set(practice.unavailable.map((u) => u.meta.questionId));
    startPractice(practice.config, practice.pool.filter((q) => !unavailable.has(q.questionId)));
    navigate({ name: 'practice' });
  };

  return (
    <div className="page summary">
      <header className="page-header">
        <p className="eyebrow">Endless Practice</p>
        <h1>Session summary</h1>
      </header>

      {summary.answered === 0 ? (
        <StatusPanel title="No questions answered">
          <p>
            You ended the session before answering any questions{practice.passedOver > 0 ? ` (you skipped ${practice.passedOver})` : ''}, so
            there’s nothing to score yet.
          </p>
        </StatusPanel>
      ) : (
        <section className="score-hero" aria-label="Score">
          <ScoreRing ratio={summary.accuracy} label="accuracy" size={150} />
          <dl className="stat-grid">
            <div className="stat">
              <dt>Answered</dt>
              <dd>{summary.answered}</dd>
            </div>
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
            <div className="stat stat--streak">
              <dt>
                <FlameIcon size={16} /> Best streak
              </dt>
              <dd>{bestStreak(practice.history)}</dd>
            </div>
          </dl>
        </section>
      )}

      {(practice.passedOver > 0 || practice.unavailable.length > 0) && (
        <p className="muted small">
          {practice.passedOver > 0 && `${practice.passedOver} skipped question${practice.passedOver === 1 ? '' : 's'} not counted. `}
          {practice.unavailable.length > 0 &&
            `${practice.unavailable.length} question${practice.unavailable.length === 1 ? '' : 's'} couldn’t be loaded and ${
              practice.unavailable.length === 1 ? 'was' : 'were'
            } left out.`}
        </p>
      )}

      {summary.answered > 0 && <BreakdownTable records={records} showUnanswered={false} measure="accuracy" />}

      <div className="action-row">
        <button type="button" className="btn btn--primary" onClick={restart}>
          <RefreshIcon size={18} /> Practice again with the same settings
        </button>
        <a className="btn btn--ghost" href="#/practice/setup">
          Change settings
        </a>
        <a className="btn btn--ghost" href="#/test/setup">
          Take a test instead
        </a>
      </div>
    </div>
  );
}
