import { useEffect, useMemo, useState } from 'react';
import { useConfig, useData, useSessions } from '../../app/contexts';
import { navigate, routeHref } from '../../app/router';
import { ConfirmDialog } from '../../components/Feedback';
import { ArrowRightIcon, BoltIcon, ClipboardIcon, InfoIcon } from '../../components/Icons';
import { DIFFICULTY_LABELS, SUBJECT_ORDER, SUBJECTS } from '../../data/taxonomy';
import { DIFFICULTIES, type Difficulty, type SubjectId } from '../../data/types';
import { DEFAULT_CONFIG, MAX_TEST_LENGTH, resolveSkillCodes, type StudyConfig } from '../../state/config';
import { buildSetupModel, eligibleInSkill } from './setupModel';
import { SkillSelector } from './SkillSelector';

const TEST_LENGTH_PRESETS = [5, 10, 20, 27];

interface SetupScreenProps {
  mode: 'practice' | 'test';
}

export function SetupScreen({ mode }: SetupScreenProps) {
  const { catalogs, loadCatalog } = useData();
  const { config, updateConfig } = useConfig();
  const sessions = useSessions();
  const [confirmReplace, setConfirmReplace] = useState(false);

  // Load the question lists for every enabled subject.
  useEffect(() => {
    for (const subject of SUBJECT_ORDER) if (config.subjects[subject]) loadCatalog(subject);
  }, [config.subjects, loadCatalog]);

  const model = useMemo(() => buildSetupModel(config, catalogs), [config, catalogs]);
  const eligible = model.pool.length;
  const lengthError =
    mode === 'test' && model.blockers.length === 0
      ? !Number.isInteger(config.testLength) || config.testLength < 1
        ? 'Enter a whole number of questions.'
        : config.testLength > eligible
          ? `Only ${eligible.toLocaleString()} question${eligible === 1 ? '' : 's'} match your selection.`
          : null
      : null;
  const canStart = model.blockers.length === 0 && !lengthError;

  const set = (patch: Partial<StudyConfig>) => updateConfig((c) => ({ ...c, ...patch }));
  const setSkills = (subject: SubjectId, codes: string[]) => updateConfig((c) => ({ ...c, skills: { ...c.skills, [subject]: codes } }));
  const toggleDifficulty = (d: Difficulty, on: boolean) =>
    updateConfig((c) => ({ ...c, difficulties: DIFFICULTIES.filter((x) => (x === d ? on : c.difficulties.includes(x))) }));

  const activeSession = mode === 'practice' ? sessions.practice && sessions.practice.phase !== 'ended' : sessions.test?.status === 'in-progress';

  function start() {
    if (!canStart) return;
    if (activeSession && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    setConfirmReplace(false);
    const snapshot: StudyConfig = {
      ...config,
      // Freeze "all skills" into explicit lists so the session records exactly what was selected.
      skills: Object.fromEntries(
        SUBJECT_ORDER.map((s) => [s, resolveSkillCodes(config, s, catalogs[s].catalog)]),
      ) as StudyConfig['skills'],
    };
    if (mode === 'practice') {
      sessions.startPractice(snapshot, model.pool);
      navigate({ name: 'practice' });
    } else {
      sessions.setTest(null);
      sessions.requestTest({ config: snapshot, pool: model.pool, count: config.testLength });
      navigate({ name: 'test' });
    }
  }

  const title = mode === 'practice' ? 'Set up Endless Practice' : 'Build a Custom Test';
  const startLabel =
    mode === 'practice' ? 'Start practicing' : `Start ${Number.isFinite(config.testLength) ? `${config.testLength}-question ` : ''}test`;
  const otherMode = mode === 'practice' ? 'test' : 'practice';

  return (
    <div className="page setup">
      <header className="page-header">
        <p className="eyebrow">
          {mode === 'practice' ? <BoltIcon size={16} /> : <ClipboardIcon size={16} />}
          {mode === 'practice' ? 'Endless Practice' : 'Custom Test'}
        </p>
        <h1>{title}</h1>
        <p className="lede">
          {mode === 'practice'
            ? 'Pick what to study. You’ll get one question at a time with instant feedback, for as long as you like.'
            : 'Pick what to include and how many questions. You’ll see your score and full explanations after you submit.'}{' '}
          <a href={routeHref({ name: 'setup', mode: otherMode })}>
            Use these settings for {otherMode === 'test' ? 'a custom test' : 'endless practice'} instead
          </a>
          .
        </p>
      </header>

      <div className="setup__layout">
        <div className="setup__main">
          <section className="setup-section" aria-labelledby="subjects-heading">
            <h2 id="subjects-heading" className="setup-section__title">
              <span className="step">1</span> Subjects
            </h2>
            <div className="subject-toggles">
              {SUBJECT_ORDER.map((subject) => {
                const entry = catalogs[subject];
                const on = config.subjects[subject];
                return (
                  <label key={subject} className={`subject-toggle subject-toggle--${subject}${on ? ' subject-toggle--on' : ''}`}>
                    <input
                      type="checkbox"
                      className="subject-toggle__input"
                      checked={on}
                      onChange={(e) => set({ subjects: { ...config.subjects, [subject]: e.target.checked } })}
                    />
                    <span className="subject-toggle__text">
                      <span className="subject-toggle__name">SAT {SUBJECTS[subject].name}</span>
                      <span className="subject-toggle__meta">
                        {entry.catalog
                          ? `${entry.catalog.questions.length.toLocaleString()} questions · ${entry.catalog.domains.length} domains`
                          : entry.status === 'error'
                            ? 'Couldn’t load'
                            : on
                              ? 'Loading…'
                              : 'Turn on to load'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="setup-section" aria-labelledby="skills-heading">
            <h2 id="skills-heading" className="setup-section__title">
              <span className="step">2</span> Domains &amp; skills
            </h2>
            {SUBJECT_ORDER.every((s) => !config.subjects[s]) ? (
              <p className="notice">
                <InfoIcon size={18} /> Turn on a subject above to choose its domains and skills.
              </p>
            ) : (
              SUBJECT_ORDER.filter((s) => config.subjects[s]).map((subject) => (
                <SkillSelector
                  key={subject}
                  subject={subject}
                  entry={catalogs[subject]}
                  selectedCodes={resolveSkillCodes(config, subject, catalogs[subject].catalog)}
                  difficulties={config.difficulties}
                  onChange={(codes) => setSkills(subject, codes)}
                  onRetry={() => loadCatalog(subject, { force: true })}
                />
              ))
            )}
          </section>

          <section className="setup-section" aria-labelledby="options-heading">
            <h2 id="options-heading" className="setup-section__title">
              <span className="step">3</span> Options
            </h2>
            <div className="options-grid">
              <fieldset className="option-group">
                <legend>Difficulty</legend>
                <p className="option-group__hint">As rated by the College Board question bank.</p>
                {DIFFICULTIES.map((d) => {
                  const count = SUBJECT_ORDER.filter((s) => config.subjects[s]).reduce((sum, s) => {
                    const catalog = catalogs[s].catalog;
                    if (!catalog) return sum;
                    const codes = new Set(resolveSkillCodes(config, s, catalog));
                    return sum + catalog.domains.flatMap((dom) => dom.skills).filter((sk) => codes.has(sk.code)).reduce((n, sk) => n + eligibleInSkill(sk, [d]), 0);
                  }, 0);
                  return (
                    <span className="check" key={d}>
                      <input
                        id={`difficulty-${d}`}
                        type="checkbox"
                        className="check__input"
                        checked={config.difficulties.includes(d)}
                        onChange={(e) => toggleDifficulty(d, e.target.checked)}
                      />
                      <label htmlFor={`difficulty-${d}`} className="check__label">
                        <span>{DIFFICULTY_LABELS[d]}</span>
                        <span className="skill__count">{count.toLocaleString()} in selected skills</span>
                      </label>
                    </span>
                  );
                })}
              </fieldset>

              <fieldset className="option-group">
                <legend>Question mix</legend>
                {(
                  [
                    ['balanced', 'Balanced across skills', 'Rotates through your selected skills so each gets a similar share.'],
                    ['random', 'Random from all matches', 'Every matching question is equally likely, so larger skills appear more often.'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <span className="check check--radio" key={value}>
                    <input
                      id={`mix-${value}`}
                      type="radio"
                      name="mix"
                      className="check__input"
                      checked={config.mix === value}
                      onChange={() => set({ mix: value })}
                    />
                    <label htmlFor={`mix-${value}`} className="check__label">
                      <span>{label}</span>
                      <span className="skill__count">{hint}</span>
                    </label>
                  </span>
                ))}
              </fieldset>

              <fieldset className="option-group">
                <legend>Answer choices</legend>
                <span className="check">
                  <input
                    id="shuffle-choices"
                    type="checkbox"
                    className="check__input"
                    checked={config.shuffleChoices}
                    onChange={(e) => set({ shuffleChoices: e.target.checked })}
                  />
                  <label htmlFor="shuffle-choices" className="check__label">
                    <span>Shuffle answer choices</span>
                    <span className="skill__count">
                      Explanations mention the original letters; each choice will show its original letter after you answer.
                    </span>
                  </label>
                </span>
              </fieldset>
            </div>
          </section>
        </div>

        <aside className="setup__summary" aria-labelledby="summary-heading">
          <div className="summary-card">
            <h2 id="summary-heading" className="summary-card__title">Your selection</h2>
            <p className="summary-card__count" aria-live="polite">
              <strong>{eligible.toLocaleString()}</strong> matching question{eligible === 1 ? '' : 's'}
            </p>
            <ul className="summary-card__subjects">
              {SUBJECT_ORDER.filter((s) => config.subjects[s]).map((s) => (
                <li key={s}>
                  <span>{SUBJECTS[s].name}</span>
                  <span>{(model.bySubject[s] ?? 0).toLocaleString()}</span>
                </li>
              ))}
            </ul>

            {mode === 'test' && (
              <div className="test-length">
                <label htmlFor="test-length" className="test-length__label">
                  Number of questions
                </label>
                <div className="test-length__row">
                  <input
                    id="test-length"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.min(MAX_TEST_LENGTH, Math.max(1, eligible))}
                    step={1}
                    value={Number.isFinite(config.testLength) ? config.testLength : ''}
                    aria-invalid={lengthError ? true : undefined}
                    aria-describedby={lengthError ? 'test-length-error' : 'test-length-hint'}
                    onChange={(e) => {
                      const value = e.target.valueAsNumber;
                      set({ testLength: Number.isNaN(value) ? NaN : Math.min(MAX_TEST_LENGTH, Math.round(value)) });
                    }}
                  />
                  <div className="chips" role="group" aria-label="Common lengths">
                    {TEST_LENGTH_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`chip${config.testLength === n ? ' chip--active' : ''}`}
                        aria-pressed={config.testLength === n}
                        disabled={n > eligible}
                        onClick={() => set({ testLength: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {lengthError ? (
                  <p id="test-length-error" className="field-error" role="alert">
                    {lengthError}{' '}
                    {eligible > 0 && (
                      <button type="button" className="link-button" onClick={() => set({ testLength: Math.min(eligible, MAX_TEST_LENGTH) })}>
                        Use {Math.min(eligible, MAX_TEST_LENGTH)}
                      </button>
                    )}{' '}
                    Or add more skills or difficulty levels.
                  </p>
                ) : (
                  <p id="test-length-hint" className="option-group__hint">
                    Up to {MAX_TEST_LENGTH}. A real SAT module has 27 Reading and Writing or 22 Math questions.
                  </p>
                )}
              </div>
            )}

            {model.blockers.length > 0 && (
              <ul className="summary-card__blockers" aria-live="polite">
                {model.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {model.emptySkills.length > 0 && (
              <p className="summary-card__warning">
                <InfoIcon size={16} /> No questions at the selected difficulty for:{' '}
                {model.emptySkills.map((s) => s.name).join(', ')}.
              </p>
            )}

            <button type="button" className="btn btn--primary btn--large btn--block summary-card__start" disabled={!canStart} onClick={start}>
              {startLabel}
              <ArrowRightIcon size={20} />
            </button>
            <div className="summary-card__secondary">
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  updateConfig((c) => ({ ...c, subjects: { rw: false, math: false }, skills: { rw: [], math: [] } }))
                }
              >
                Clear selections
              </button>
              <button type="button" className="link-button" onClick={() => updateConfig(() => DEFAULT_CONFIG)}>
                Reset to defaults
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* On narrow screens the start button lives in a bar pinned to the bottom of the viewport. */}
      <div className="start-bar">
        <p className="start-bar__count">
          <strong>{eligible.toLocaleString()}</strong> matching
        </p>
        <button type="button" className="btn btn--primary" disabled={!canStart} onClick={start}>
          {startLabel}
          <ArrowRightIcon size={18} />
        </button>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title={mode === 'practice' ? 'Start a new practice session?' : 'Start a new test?'}
        confirmLabel={mode === 'practice' ? 'Start new session' : 'Start new test'}
        onConfirm={start}
        onCancel={() => setConfirmReplace(false)}
      >
        <p>
          {mode === 'practice'
            ? 'You have a practice session in progress. Starting a new one ends it.'
            : 'You have a test in progress. Starting a new one discards its answers.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}
