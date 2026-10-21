import type { SubjectId } from './types';

/**
 * The SAT question taxonomy as documented in `documentation.txt`.
 *
 * Only the parts needed to *query* the API live here: the numeric `test` code
 * for each subject and the domain codes accepted by the `domain` parameter.
 * Skill names and counts shown in the UI are derived from the live question
 * list (see `catalog.ts`); the documented skill order is used only to sort
 * them in a familiar order.
 */
export interface SubjectDefinition {
  id: SubjectId;
  /** Value of the `test` field sent to `get-questions` (1 = Reading and Writing, 2 = Math). */
  apiTestCode: 1 | 2;
  name: string;
  shortName: string;
  domains: readonly DomainDefinition[];
}

export interface DomainDefinition {
  code: string;
  name: string;
  /** Skill codes in the order the documentation lists them. */
  skillOrder: readonly string[];
}

export const SUBJECTS: Record<SubjectId, SubjectDefinition> = {
  rw: {
    id: 'rw',
    apiTestCode: 1,
    name: 'Reading and Writing',
    shortName: 'R&W',
    domains: [
      { code: 'INI', name: 'Information and Ideas', skillOrder: ['CID', 'INF', 'COE'] },
      { code: 'CAS', name: 'Craft and Structure', skillOrder: ['WIC', 'TSP', 'CTC'] },
      { code: 'EOI', name: 'Expression of Ideas', skillOrder: ['SYN', 'TRA'] },
      { code: 'SEC', name: 'Standard English Conventions', skillOrder: ['BOU', 'FSS'] },
    ],
  },
  math: {
    id: 'math',
    apiTestCode: 2,
    name: 'Math',
    shortName: 'Math',
    domains: [
      { code: 'H', name: 'Algebra', skillOrder: ['H.A.', 'H.B.', 'H.C.', 'H.D.', 'H.E.'] },
      { code: 'P', name: 'Advanced Math', skillOrder: ['P.A.', 'P.B.', 'P.C.'] },
      {
        code: 'Q',
        name: 'Problem-Solving and Data Analysis',
        skillOrder: ['Q.A.', 'Q.B.', 'Q.C.', 'Q.D.', 'Q.E.', 'Q.F.', 'Q.G.'],
      },
      { code: 'S', name: 'Geometry and Trigonometry', skillOrder: ['S.A.', 'S.B.', 'S.C.', 'S.D.'] },
    ],
  },
};

/** Subjects in display order (the digital SAT presents Reading and Writing first). */
export const SUBJECT_ORDER: readonly SubjectId[] = ['rw', 'math'];

export function subjectFromApiCode(code: number): SubjectId | null {
  if (code === 1) return 'rw';
  if (code === 2) return 'math';
  return null;
}

export function getDomainDefinition(subject: SubjectId, domainCode: string): DomainDefinition | undefined {
  return SUBJECTS[subject].domains.find((d) => d.code === domainCode);
}

/** Key that uniquely identifies a skill across both subjects. */
export function skillKey(subject: SubjectId, skillCode: string): string {
  return `${subject}:${skillCode}`;
}

export const DIFFICULTY_LABELS = { E: 'Easy', M: 'Medium', H: 'Hard' } as const;
