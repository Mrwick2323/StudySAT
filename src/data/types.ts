/**
 * Normalized internal representation of SAT questions.
 *
 * The College Board question bank returns two different detail formats (see
 * `normalize.ts`). Everything outside the data layer works with these types
 * only, so UI code never needs to know which raw format a question came from.
 */

export type SubjectId = 'rw' | 'math';

/** Difficulty exactly as reported by the source: Easy, Medium, Hard. */
export type Difficulty = 'E' | 'M' | 'H';

export const DIFFICULTIES: readonly Difficulty[] = ['E', 'M', 'H'];

/** Which raw detail format the question bank serves for a question. */
export type SourceFormat =
  /** Fetched by `external_id`; MathML math, structured answer keys. */
  | 'standard'
  /** Fetched by `ibn` (item bank number); math as PNG images, keys sometimes only in rationale. */
  | 'legacy';

/** Metadata for one question, from the `get-questions` list endpoint. */
export interface QuestionMeta {
  /** Stable short id from the source, e.g. "14189fbb". */
  questionId: string;
  subject: SubjectId;
  domainCode: string;
  domainName: string;
  skillCode: string;
  skillName: string;
  difficulty: Difficulty | null;
  /** Source `score_band_range_cd` (1–7); preserved but not interpreted. */
  scoreBand: number | null;
  /** Identifier to send to `get-question` (the `external_id`, or the `ibn` for legacy items). */
  fetchId: string;
  format: SourceFormat;
  updatedAt: number | null;
}

export interface AnswerChoice {
  /** Stable choice id (source option id, or the original letter for legacy items). */
  id: string;
  /** Letter of the choice in the source's original order ("A"–"D"). Rationales refer to these letters. */
  originalLetter: string;
  html: string;
}

/** How the answer key for a question was obtained. */
export type AnswerKeyOrigin =
  /** Provided as structured data by the source (`keys`, `correct_answer`, `correct_choice`). */
  | 'structured'
  /** Read from an explicit statement in the source's own rationale, e.g. "Choice D is correct." */
  | 'rationale';

interface QuestionBase {
  meta: QuestionMeta;
  /** Passage, table, figure, or other material shown before the question. */
  stimulusHtml: string | null;
  stemHtml: string;
  /** Source-provided explanation; `null` if the source did not include one. */
  rationaleHtml: string | null;
  answerKeyOrigin: AnswerKeyOrigin;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  kind: 'mcq';
  /** Choices in the source's original order. */
  choices: AnswerChoice[];
  correctChoiceId: string;
}

/** Student-produced response ("grid-in") question. */
export interface FreeResponseQuestion extends QuestionBase {
  kind: 'spr';
  /** Answers accepted by the source, e.g. ["3/17", ".1764", ".1765"]. */
  acceptedAnswers: string[];
}

export type Question = MultipleChoiceQuestion | FreeResponseQuestion;

export type UserResponse =
  | { kind: 'mcq'; choiceId: string }
  | { kind: 'spr'; value: string };

export type OutcomeStatus = 'correct' | 'incorrect' | 'unanswered';

export interface DifficultyCounts {
  E: number;
  M: number;
  H: number;
  unknown: number;
}

export interface SkillInfo {
  subject: SubjectId;
  domainCode: string;
  code: string;
  name: string;
  count: number;
  byDifficulty: DifficultyCounts;
}

export interface DomainInfo {
  subject: SubjectId;
  code: string;
  name: string;
  skills: SkillInfo[];
  count: number;
}

/** All question metadata for one subject plus the taxonomy derived from it. */
export interface SubjectCatalog {
  subject: SubjectId;
  domains: DomainInfo[];
  questions: QuestionMeta[];
  /** Records in the list response that could not be normalized and were dropped. */
  malformedCount: number;
  fetchedAt: number;
}
