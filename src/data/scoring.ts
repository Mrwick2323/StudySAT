import { SUBJECT_ORDER, SUBJECTS } from './taxonomy';
import type { OutcomeStatus, QuestionMeta } from './types';

export interface ScoreSummary {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  /** Correct ÷ answered, or null when nothing was answered. Used in practice mode. */
  accuracy: number | null;
  /** Correct ÷ total, or null for an empty set. The test score: unanswered counts as wrong. */
  percent: number | null;
}

export function summarize(statuses: readonly OutcomeStatus[]): ScoreSummary {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  for (const status of statuses) {
    if (status === 'correct') correct++;
    else if (status === 'incorrect') incorrect++;
    else unanswered++;
  }
  const total = statuses.length;
  const answered = correct + incorrect;
  return {
    total,
    answered,
    correct,
    incorrect,
    unanswered,
    accuracy: answered === 0 ? null : correct / answered,
    percent: total === 0 ? null : correct / total,
  };
}

/** Formats a 0–1 ratio as a whole percentage, or an em dash when undefined. */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

export interface GradedRecord {
  meta: QuestionMeta;
  status: OutcomeStatus;
}

export type BreakdownLevel = 'subject' | 'domain' | 'skill';

export interface BreakdownRow {
  key: string;
  label: string;
  /** Parent labels, e.g. ["Math", "Algebra"] for a Math skill. */
  context: string[];
  summary: ScoreSummary;
}

function sortKey(meta: QuestionMeta): [number, number, number] {
  const subject = SUBJECTS[meta.subject];
  const domainIndex = subject.domains.findIndex((d) => d.code === meta.domainCode);
  const skillIndex = domainIndex === -1 ? -1 : subject.domains[domainIndex]!.skillOrder.indexOf(meta.skillCode);
  return [
    SUBJECT_ORDER.indexOf(meta.subject),
    domainIndex === -1 ? 999 : domainIndex,
    skillIndex === -1 ? 999 : skillIndex,
  ];
}

/** Performance grouped by subject, domain or skill, in taxonomy order. */
export function breakdown(records: readonly GradedRecord[], level: BreakdownLevel): BreakdownRow[] {
  const groups = new Map<string, { meta: QuestionMeta; statuses: OutcomeStatus[] }>();
  for (const record of records) {
    const { meta } = record;
    const key =
      level === 'subject'
        ? meta.subject
        : level === 'domain'
          ? `${meta.subject}:${meta.domainCode}`
          : `${meta.subject}:${meta.skillCode}`;
    const group = groups.get(key);
    if (group) group.statuses.push(record.status);
    else groups.set(key, { meta, statuses: [record.status] });
  }
  const depth = level === 'subject' ? 1 : level === 'domain' ? 2 : 3;
  return [...groups.entries()]
    .sort(([keyA, a], [keyB, b]) => {
      const ka = sortKey(a.meta).slice(0, depth);
      const kb = sortKey(b.meta).slice(0, depth);
      for (let i = 0; i < depth; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
      return keyA.localeCompare(keyB);
    })
    .map(([key, { meta, statuses }]) => {
      const subjectName = SUBJECTS[meta.subject].name;
      return {
        key,
        label: level === 'subject' ? subjectName : level === 'domain' ? meta.domainName : meta.skillName,
        context: level === 'subject' ? [] : level === 'domain' ? [subjectName] : [subjectName, meta.domainName],
        summary: summarize(statuses),
      };
    });
}
