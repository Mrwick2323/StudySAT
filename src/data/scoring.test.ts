import { describe, expect, it } from 'vitest';
import { metaFor } from '../test/fixtures';
import { breakdown, formatPercent, summarize } from './scoring';

describe('summarize', () => {
  it('counts outcomes and computes accuracy and percent separately', () => {
    const s = summarize(['correct', 'correct', 'incorrect', 'unanswered']);
    expect(s).toEqual({ total: 4, answered: 3, correct: 2, incorrect: 1, unanswered: 1, accuracy: 2 / 3, percent: 0.5 });
  });

  it('returns null ratios instead of dividing by zero', () => {
    expect(summarize([])).toMatchObject({ total: 0, accuracy: null, percent: null });
    expect(summarize(['unanswered', 'unanswered'])).toMatchObject({ answered: 0, accuracy: null, percent: 0 });
  });
});

describe('formatPercent', () => {
  it('rounds to whole percentages', () => {
    expect(formatPercent(2 / 3)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('breakdown', () => {
  const records = [
    { meta: metaFor('H.A.'), status: 'correct' as const },
    { meta: metaFor('CID'), status: 'incorrect' as const },
    { meta: metaFor('H.B.'), status: 'unanswered' as const },
    { meta: metaFor('WIC'), status: 'correct' as const },
    { meta: metaFor('CID'), status: 'correct' as const },
  ];

  it('groups by subject in SAT order (Reading and Writing first)', () => {
    const rows = breakdown(records, 'subject');
    expect(rows.map((r) => [r.label, r.summary.correct, r.summary.total])).toEqual([
      ['Reading and Writing', 2, 3],
      ['Math', 1, 2],
    ]);
  });

  it('groups by domain with subject context', () => {
    const rows = breakdown(records, 'domain');
    expect(rows.map((r) => r.label)).toEqual(['Information and Ideas', 'Craft and Structure', 'Algebra']);
    expect(rows[2]!.context).toEqual(['Math']);
    expect(rows[2]!.summary).toMatchObject({ correct: 1, unanswered: 1, total: 2 });
  });

  it('groups by skill in documented order', () => {
    const rows = breakdown(records, 'skill');
    expect(rows.map((r) => r.label)).toEqual([
      'Central Ideas and Details',
      'Words in Context',
      'Linear equations in one variable',
      'Linear functions',
    ]);
    expect(rows[0]!.summary).toMatchObject({ correct: 1, incorrect: 1 });
    expect(rows[0]!.context).toEqual(['Reading and Writing', 'Information and Ideas']);
  });
});
