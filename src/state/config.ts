import { createFilter, type QuestionFilter } from '../data/filter';
import type { QuestionMix } from '../data/sampling';
import { SUBJECT_ORDER, skillKey } from '../data/taxonomy';
import { DIFFICULTIES, type Difficulty, type SubjectCatalog, type SubjectId } from '../data/types';
import { readJson, STORAGE_KEYS, writeJson } from './storage';

/** Study configuration shared by both modes. */
export interface StudyConfig {
  /** Which subjects are included. Skill selections are kept even while a subject is off. */
  subjects: Record<SubjectId, boolean>;
  /**
   * Selected skill codes per subject. `null` means "not chosen yet", which
   * selects every skill once the subject's question list has loaded.
   */
  skills: Record<SubjectId, string[] | null>;
  difficulties: Difficulty[];
  mix: QuestionMix;
  shuffleChoices: boolean;
  testLength: number;
}

export const MIN_TEST_LENGTH = 1;
export const MAX_TEST_LENGTH = 100;

export const DEFAULT_CONFIG: StudyConfig = {
  subjects: { rw: true, math: true },
  skills: { rw: null, math: null },
  difficulties: [...DIFFICULTIES],
  mix: 'balanced',
  shuffleChoices: false,
  testLength: 10,
};

export type CatalogMap = Partial<Record<SubjectId, SubjectCatalog>>;

/** Selected skill codes for a subject, resolving `null` to every skill in the catalog. */
export function resolveSkillCodes(config: StudyConfig, subject: SubjectId, catalog: SubjectCatalog | undefined): string[] {
  if (!catalog) return config.skills[subject] ?? [];
  const available = catalog.domains.flatMap((d) => d.skills.map((s) => s.code));
  const chosen = config.skills[subject];
  if (chosen === null) return available;
  const set = new Set(chosen);
  // Drop codes the source no longer lists.
  return available.filter((code) => set.has(code));
}

/** Filter for the questions the configuration selects (only subjects that are on and loaded). */
export function configToFilter(config: StudyConfig, catalogs: CatalogMap): QuestionFilter {
  const keys: string[] = [];
  for (const subject of SUBJECT_ORDER) {
    if (!config.subjects[subject]) continue;
    for (const code of resolveSkillCodes(config, subject, catalogs[subject])) keys.push(skillKey(subject, code));
  }
  return createFilter(keys, config.difficulties);
}

export function activeSubjects(config: StudyConfig): SubjectId[] {
  return SUBJECT_ORDER.filter((s) => config.subjects[s]);
}

/** Validates stored or imported configuration, falling back to defaults for anything invalid. */
export function parseConfig(raw: unknown): StudyConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<StudyConfig>;
  const subjects = { ...DEFAULT_CONFIG.subjects };
  const skills = { ...DEFAULT_CONFIG.skills };
  for (const subject of SUBJECT_ORDER) {
    if (typeof value.subjects?.[subject] === 'boolean') subjects[subject] = value.subjects[subject];
    const chosen = value.skills?.[subject];
    if (chosen === null || (Array.isArray(chosen) && chosen.every((c) => typeof c === 'string'))) {
      skills[subject] = chosen;
    }
  }
  const difficulties = Array.isArray(value.difficulties)
    ? DIFFICULTIES.filter((d) => value.difficulties!.includes(d))
    : DEFAULT_CONFIG.difficulties;
  const testLength =
    typeof value.testLength === 'number' && Number.isInteger(value.testLength)
      ? Math.min(MAX_TEST_LENGTH, Math.max(MIN_TEST_LENGTH, value.testLength))
      : DEFAULT_CONFIG.testLength;
  return {
    subjects,
    skills,
    difficulties,
    mix: value.mix === 'random' ? 'random' : 'balanced',
    shuffleChoices: value.shuffleChoices === true,
    testLength,
  };
}

export function loadConfig(): StudyConfig {
  return parseConfig(readJson(STORAGE_KEYS.config));
}

export function saveConfig(config: StudyConfig): void {
  writeJson(STORAGE_KEYS.config, config);
}
