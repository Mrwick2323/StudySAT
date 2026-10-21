import { useState } from 'react';
import { breakdown, formatPercent, type BreakdownLevel, type GradedRecord } from '../data/scoring';

const LEVELS: { level: BreakdownLevel; label: string }[] = [
  { level: 'subject', label: 'Subject' },
  { level: 'domain', label: 'Domain' },
  { level: 'skill', label: 'Skill' },
];

interface BreakdownTableProps {
  records: GradedRecord[];
  /** Whether to show an "Unanswered" column (tests) or not (practice). */
  showUnanswered: boolean;
  /** Which ratio to show: share of answered questions (practice) or of all questions (tests). */
  measure: 'accuracy' | 'percent';
}

/** Performance by subject, domain or skill, as a table with bar meters. */
export function BreakdownTable({ records, showUnanswered, measure }: BreakdownTableProps) {
  const [level, setLevel] = useState<BreakdownLevel>('domain');
  const rows = breakdown(records, level);
  const measureLabel = measure === 'accuracy' ? 'Accuracy' : 'Score';
  return (
    <section className="breakdown" aria-labelledby="breakdown-title">
      <div className="breakdown__header">
        <h2 id="breakdown-title">Performance breakdown</h2>
        <div className="segmented" role="group" aria-label="Group results by">
          {LEVELS.map(({ level: value, label }) => (
            <button
              key={value}
              type="button"
              className={`segmented__option${level === value ? ' segmented__option--active' : ''}`}
              aria-pressed={level === value}
              onClick={() => setLevel(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">Answer some questions to see a breakdown.</p>
      ) : (
        <div className="table-scroll">
          <table className="breakdown__table">
            <thead>
              <tr>
                <th scope="col">{LEVELS.find((l) => l.level === level)!.label}</th>
                <th scope="col" className="num">Correct</th>
                <th scope="col" className="num">Incorrect</th>
                {showUnanswered && <th scope="col" className="num">Unanswered</th>}
                <th scope="col" className="breakdown__meter-col">{measureLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const ratio = measure === 'accuracy' ? row.summary.accuracy : row.summary.percent;
                return (
                  <tr key={row.key}>
                    <th scope="row">
                      <span className="breakdown__label">{row.label}</span>
                      {row.context.length > 0 && <span className="breakdown__context">{row.context.join(' · ')}</span>}
                    </th>
                    <td className="num">{row.summary.correct}</td>
                    <td className="num">{row.summary.incorrect}</td>
                    {showUnanswered && <td className="num">{row.summary.unanswered}</td>}
                    <td>
                      <div className="meter">
                        <div className="meter__bar" aria-hidden="true">
                          <div className="meter__fill" style={{ width: `${(ratio ?? 0) * 100}%` }} />
                        </div>
                        <span className="meter__value">{formatPercent(ratio)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
