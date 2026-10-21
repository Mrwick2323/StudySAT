import { skillKey } from './taxonomy';
import { DIFFICULTIES, type Difficulty, type QuestionMeta } from './types';

export interface QuestionFilter {
  /** Selected skills as `skillKey(subject, skillCode)`. A skill implies its domain and subject. */
  skills: ReadonlySet<string>;
  /** Selected difficulties. Questions without a difficulty are kept only when all three are selected. */
  difficulties: ReadonlySet<Difficulty>;
}

export function createFilter(skillKeys: Iterable<string>, difficulties: Iterable<Difficulty> = DIFFICULTIES): QuestionFilter {
  return { skills: new Set(skillKeys), difficulties: new Set(difficulties) };
}

export function matchesFilter(meta: QuestionMeta, filter: QuestionFilter): boolean {
  if (!filter.skills.has(skillKey(meta.subject, meta.skillCode))) return false;
  if (meta.difficulty === null) return DIFFICULTIES.every((d) => filter.difficulties.has(d));
  return filter.difficulties.has(meta.difficulty);
}

export function filterQuestions(questions: readonly QuestionMeta[], filter: QuestionFilter): QuestionMeta[] {
  return questions.filter((q) => matchesFilter(q, filter));
}

export function countEligible(questions: readonly QuestionMeta[], filter: QuestionFilter): number {
  let count = 0;
  for (const q of questions) if (matchesFilter(q, filter)) count++;
  return count;
}

/** Eligible-question counts per selected skill, including selected skills with zero matches. */
export function countBySkill(questions: readonly QuestionMeta[], filter: QuestionFilter): Map<string, number> {
  const counts = new Map<string, number>([...filter.skills].map((key) => [key, 0]));
  for (const q of questions) {
    if (matchesFilter(q, filter)) {
      const key = skillKey(q.subject, q.skillCode);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
