import { QuestionFormatError } from '../data/normalize';
import { buildSubjectCatalog } from '../data/catalog';
import type { QuestionRepository } from '../data/repository';
import type { Question, QuestionMeta, SubjectId } from '../data/types';
import { mcqQuestion, metaFor, sprQuestion } from './fixtures';

export interface FakeRepositoryOptions {
  /** Question ids whose details should fail as unusable. */
  broken?: string[];
  /** Override metadata per subject. */
  questions?: Partial<Record<SubjectId, QuestionMeta[]>>;
}

/** In-memory repository with synthetic questions, for UI tests. */
export function createFakeRepository(options: FakeRepositoryOptions = {}): QuestionRepository & { loads: string[] } {
  const questions: Record<SubjectId, QuestionMeta[]> = {
    rw: options.questions?.rw ?? [
      metaFor('CID', 'E', 'rw-1'),
      metaFor('CID', 'M', 'rw-2'),
      metaFor('INF', 'H', 'rw-3'),
      metaFor('WIC', 'E', 'rw-4'),
    ],
    math: options.questions?.math ?? [metaFor('H.A.', 'E', 'm-1'), metaFor('H.B.', 'M', 'm-2')],
  };
  const broken = new Set(options.broken ?? []);
  const loads: string[] = [];
  return {
    loads,
    async loadCatalog(subject) {
      return buildSubjectCatalog(subject, questions[subject], 0, Date.now());
    },
    async loadQuestion(meta): Promise<Question> {
      loads.push(meta.questionId);
      if (broken.has(meta.questionId)) throw new QuestionFormatError('unsupported', meta.questionId, 'No answer key.');
      return meta.subject === 'math' && meta.skillCode === 'H.A.' ? sprQuestion(meta, ['12', '24/2']) : mcqQuestion(meta);
    },
  };
}
