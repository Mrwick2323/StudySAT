import type { CatalogEntry } from '../../app/contexts';
import { filterQuestions } from '../../data/filter';
import { DIFFICULTY_LABELS, SUBJECT_ORDER, SUBJECTS } from '../../data/taxonomy';
import { DIFFICULTIES, type Difficulty, type QuestionMeta, type SkillInfo, type SubjectId } from '../../data/types';
import { configToFilter, resolveSkillCodes, type CatalogMap, type StudyConfig } from '../../state/config';

/** Questions in a skill that match the selected difficulties. */
export function eligibleInSkill(skill: SkillInfo, difficulties: readonly Difficulty[]): number {
  const all = DIFFICULTIES.every((d) => difficulties.includes(d));
  return difficulties.reduce((sum, d) => sum + skill.byDifficulty[d], 0) + (all ? skill.byDifficulty.unknown : 0);
}

export interface SetupModel {
  /** Eligible questions across all enabled, loaded subjects. */
  pool: QuestionMeta[];
  bySubject: Partial<Record<SubjectId, number>>;
  /** Reasons the session can't start yet; empty when ready. */
  blockers: string[];
  /** Selected skills that have no questions at the selected difficulties. */
  emptySkills: { subject: SubjectId; name: string }[];
}

export function buildSetupModel(config: StudyConfig, entries: Record<SubjectId, CatalogEntry>): SetupModel {
  const catalogs: CatalogMap = {};
  for (const subject of SUBJECT_ORDER) {
    const catalog = entries[subject].catalog;
    if (catalog) catalogs[subject] = catalog;
  }
  const enabled = SUBJECT_ORDER.filter((s) => config.subjects[s]);
  const blockers: string[] = [];
  const emptySkills: SetupModel['emptySkills'] = [];
  const bySubject: SetupModel['bySubject'] = {};
  const questions: QuestionMeta[] = [];

  if (enabled.length === 0) blockers.push('Choose at least one subject.');
  if (config.difficulties.length === 0) blockers.push('Choose at least one difficulty level.');

  for (const subject of enabled) {
    const entry = entries[subject];
    const name = SUBJECTS[subject].name;
    if (!entry.catalog) {
      blockers.push(
        entry.status === 'error'
          ? `${name} questions couldn’t be loaded. Try again, or turn ${name} off.`
          : `Loading ${name} questions…`,
      );
      continue;
    }
    if (entry.catalog.questions.length === 0) {
      blockers.push(`The question bank returned no ${name} questions. Turn ${name} off, or try again later.`);
      continue;
    }
    const codes = resolveSkillCodes(config, subject, entry.catalog);
    if (codes.length === 0) {
      blockers.push(`Select at least one ${name} skill, or turn ${name} off.`);
      continue;
    }
    const selected = new Set(codes);
    for (const domain of entry.catalog.domains) {
      for (const skill of domain.skills) {
        if (selected.has(skill.code) && eligibleInSkill(skill, config.difficulties) === 0) {
          emptySkills.push({ subject, name: skill.name });
        }
      }
    }
    questions.push(...entry.catalog.questions);
  }

  const pool = filterQuestions(questions, configToFilter(config, catalogs));
  for (const q of pool) bySubject[q.subject] = (bySubject[q.subject] ?? 0) + 1;
  if (blockers.length === 0 && pool.length === 0) {
    const levels = config.difficulties.map((d) => DIFFICULTY_LABELS[d].toLowerCase()).join(', ');
    blockers.push(`No ${levels} questions match the selected skills. Add skills or difficulty levels.`);
  }
  return { pool, bySubject, blockers, emptySkills };
}
