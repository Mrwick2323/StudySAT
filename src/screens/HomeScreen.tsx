import { useEffect, useState } from 'react';
import { useData, useSessions } from '../app/contexts';
import { navigate, routeHref } from '../app/router';
import { ArrowRightIcon, BoltIcon, CheckIcon, ClipboardIcon, FlameIcon } from '../components/Icons';
import { summarize } from '../data/scoring';
import { SUBJECT_ORDER, SUBJECTS } from '../data/taxonomy';
import { clearTestSession, gradeTest, unansweredIndexes } from '../state/testSession';

function ResumeCards() {
  const { practice, storedPractice, resumeStoredPractice, discardStoredPractice, test, setTest } = useSessions();
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const cards = [];

  if (practice && practice.phase !== 'ended') {
    cards.push(
      <div className="resume-card" key="practice-live">
        <div>
          <p className="resume-card__title">
            <BoltIcon size={18} /> Practice session in progress
          </p>
          <p className="muted">{practice.history.length} answered so far</p>
        </div>
        <a className="btn btn--primary btn--small" href={routeHref({ name: 'practice' })}>
          Continue
        </a>
      </div>,
    );
  } else if (storedPractice) {
    cards.push(
      <div className="resume-card" key="practice-stored">
        <div>
          <p className="resume-card__title">
            <BoltIcon size={18} /> Unfinished practice session
          </p>
          <p className="muted">
            {storedPractice.history.length} answered · saved {new Date(storedPractice.savedAt).toLocaleString()}
          </p>
          {resumeError && <p className="field-error">{resumeError}</p>}
        </div>
        <div className="resume-card__actions">
          <button
            type="button"
            className="btn btn--primary btn--small"
            disabled={resuming}
            onClick={async () => {
              setResuming(true);
              const ok = await resumeStoredPractice();
              setResuming(false);
              if (ok) navigate({ name: 'practice' });
              else setResumeError('This session couldn’t be restored. The question bank may be unreachable; try again later.');
            }}
          >
            {resuming ? 'Restoring…' : 'Resume'}
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={discardStoredPractice}>
            Discard
          </button>
        </div>
      </div>,
    );
  }

  if (test?.status === 'in-progress') {
    const unanswered = unansweredIndexes(test).length;
    cards.push(
      <div className="resume-card" key="test">
        <div>
          <p className="resume-card__title">
            <ClipboardIcon size={18} /> Test in progress
          </p>
          <p className="muted">
            Question {test.currentIndex + 1} of {test.items.length} · {test.items.length - unanswered} answered
          </p>
        </div>
        <div className="resume-card__actions">
          <a className="btn btn--primary btn--small" href={routeHref({ name: 'test' })}>
            Resume test
          </a>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              clearTestSession();
              setTest(null);
            }}
          >
            Discard
          </button>
        </div>
      </div>,
    );
  } else if (test?.status === 'submitted') {
    const summary = summarize(gradeTest(test).items.map((i) => i.status));
    cards.push(
      <div className="resume-card" key="results">
        <div>
          <p className="resume-card__title">
            <CheckIcon size={18} /> Last test: {summary.correct} of {summary.total} correct
          </p>
          <p className="muted">Review every question with explanations.</p>
        </div>
        <a className="btn btn--ghost btn--small" href={routeHref({ name: 'test-results' })}>
          View results
        </a>
      </div>,
    );
  }

  if (cards.length === 0) return null;
  return (
    <section className="resume" aria-label="Pick up where you left off">
      {cards}
    </section>
  );
}

export function HomeScreen() {
  const { catalogs, loadCatalog } = useData();

  // Warm the question lists so setup is instant.
  useEffect(() => {
    for (const subject of SUBJECT_ORDER) loadCatalog(subject);
  }, [loadCatalog]);

  return (
    <div className="page home">
      <section className="hero">
        <h1 className="hero__title">
          Study for the SAT with <span className="hero__highlight">real College Board questions</span>.
        </h1>
        <p className="hero__lede">
          Pick the subjects, domains and skills you want to work on, then drill them endlessly or take a custom test. Every
          question, answer and explanation comes straight from the official SAT Suite Question Bank.
        </p>
        <ul className="hero__stats" aria-label="Question bank size">
          {SUBJECT_ORDER.map((subject) => {
            const catalog = catalogs[subject].catalog;
            return (
              <li key={subject}>
                <strong>{catalog ? catalog.questions.length.toLocaleString() : '…'}</strong>
                <span>{SUBJECTS[subject].name} questions</span>
              </li>
            );
          })}
        </ul>
      </section>

      <ResumeCards />

      <section className="modes" aria-label="Study modes">
        <article className="mode-card mode-card--practice">
          <div className="mode-card__icon" aria-hidden="true">
            <BoltIcon size={28} />
          </div>
          <h2>Endless Practice</h2>
          <p>
            One question after another, with instant feedback and an explanation after each answer. Build a streak, watch your
            accuracy, and stop whenever you like.
          </p>
          <ul className="mode-card__points">
            <li>
              <FlameIcon size={16} className="streak-icon" /> Streaks, score and accuracy as you go
            </li>
            <li>
              <CheckIcon size={16} /> No repeats until you’ve seen every match
            </li>
          </ul>
          <a className="btn btn--primary btn--large" href={routeHref({ name: 'setup', mode: 'practice' })}>
            Start practicing <ArrowRightIcon size={20} />
          </a>
        </article>

        <article className="mode-card mode-card--test">
          <div className="mode-card__icon" aria-hidden="true">
            <ClipboardIcon size={28} />
          </div>
          <h2>Custom Test</h2>
          <p>
            Choose how many questions you want. Answer them one at a time, change answers freely, then submit to see your score,
            a breakdown by skill, and a full review.
          </p>
          <ul className="mode-card__points">
            <li>
              <CheckIcon size={16} /> No answers revealed until you submit
            </li>
            <li>
              <CheckIcon size={16} /> Retake it or generate a fresh one
            </li>
          </ul>
          <a className="btn btn--primary btn--large" href={routeHref({ name: 'setup', mode: 'test' })}>
            Build a test <ArrowRightIcon size={20} />
          </a>
        </article>
      </section>

      <section className="how" aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <ol className="how__steps">
          <li>
            <strong>Choose what to study.</strong> Turn on Reading and Writing, Math, or both, then pick whole domains or individual
            skills. Your choices are remembered.
          </li>
          <li>
            <strong>Pick a mode.</strong> Endless Practice gives feedback after every question; a Custom Test waits until you submit.
          </li>
          <li>
            <strong>Learn from the explanations.</strong> See why the right answer is right and why yours wasn’t, in the College
            Board’s own words.
          </li>
        </ol>
      </section>
    </div>
  );
}
