import { findStatedCorrectLetters, findStatedFreeResponseAnswers } from './rationaleKeys';
import { getDomainDefinition } from './taxonomy';
import { hasVisibleContent } from './text';
import type {
  AnswerChoice,
  Difficulty,
  FreeResponseQuestion,
  MultipleChoiceQuestion,
  Question,
  QuestionMeta,
  SubjectId,
} from './types';

/**
 * Raised when a question detail payload cannot be turned into a gradable
 * question. `unsupported` means the format is understood but cannot be graded
 * reliably (e.g. no answer key); `malformed` means required fields are missing
 * or contradictory.
 */
export class QuestionFormatError extends Error {
  readonly kind: 'unsupported' | 'malformed';
  readonly questionId: string;

  constructor(kind: 'unsupported' | 'malformed', questionId: string, message: string) {
    super(message);
    this.name = 'QuestionFormatError';
    this.kind = kind;
    this.questionId = questionId;
  }
}

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function optionalHtml(value: unknown): string | null {
  return typeof value === 'string' && hasVisibleContent(value) ? value : null;
}

function letterForIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

const DIFFICULTY_VALUES = new Set<string>(['E', 'M', 'H']);

// ---------------------------------------------------------------------------
// List metadata (get-questions)
// ---------------------------------------------------------------------------

/**
 * Normalizes one record from the `get-questions` response. Returns null for
 * records that cannot be used (no id, no skill, or nothing to fetch details by).
 */
export function normalizeQuestionMeta(raw: unknown, subject: SubjectId): QuestionMeta | null {
  if (!isRecord(raw)) return null;
  const questionId = nonEmptyString(raw.questionId);
  const domainCode = nonEmptyString(raw.primary_class_cd);
  const skillCode = nonEmptyString(raw.skill_cd);
  if (!questionId || !domainCode || !skillCode) return null;

  // Most items are fetched by `external_id`. Some older Math items have
  // `external_id: null` and an `ibn` (item bank number) instead; the documented
  // get-question endpoint serves those when given the ibn, in a legacy format.
  const externalId = nonEmptyString(raw.external_id);
  const ibn = nonEmptyString(raw.ibn);
  const fetchId = externalId ?? ibn;
  if (!fetchId) return null;

  const difficultyRaw = nonEmptyString(raw.difficulty)?.toUpperCase();
  const difficulty = difficultyRaw && DIFFICULTY_VALUES.has(difficultyRaw) ? (difficultyRaw as Difficulty) : null;
  const scoreBand = typeof raw.score_band_range_cd === 'number' ? raw.score_band_range_cd : null;
  const updatedAt = typeof raw.updateDate === 'number' ? raw.updateDate : null;

  return {
    questionId,
    subject,
    domainCode,
    domainName:
      nonEmptyString(raw.primary_class_cd_desc) ?? getDomainDefinition(subject, domainCode)?.name ?? domainCode,
    skillCode,
    skillName: nonEmptyString(raw.skill_desc) ?? skillCode,
    difficulty,
    scoreBand,
    fetchId,
    format: externalId ? 'standard' : 'legacy',
    updatedAt,
  };
}

export interface NormalizedList {
  questions: QuestionMeta[];
  malformedCount: number;
}

export function normalizeQuestionList(raw: readonly unknown[], subject: SubjectId): NormalizedList {
  const seen = new Set<string>();
  const questions: QuestionMeta[] = [];
  let malformedCount = 0;
  for (const record of raw) {
    const meta = normalizeQuestionMeta(record, subject);
    if (!meta) {
      malformedCount++;
      continue;
    }
    if (seen.has(meta.questionId)) continue;
    seen.add(meta.questionId);
    questions.push(meta);
  }
  return { questions, malformedCount };
}

// ---------------------------------------------------------------------------
// Question details (get-question)
// ---------------------------------------------------------------------------

/**
 * Cross-checks a structured key against an explicit statement in the rationale.
 * A contradiction means we cannot be sure which answer is right.
 */
function assertRationaleAgrees(meta: QuestionMeta, rationale: string | null, correctLetter: string): void {
  const stated = findStatedCorrectLetters(rationale);
  if (stated.length === 1 && stated[0] !== correctLetter) {
    throw new QuestionFormatError(
      'malformed',
      meta.questionId,
      `The answer key (${correctLetter}) contradicts the explanation (${stated[0]}).`,
    );
  }
}

function normalizeStandard(raw: RawRecord, meta: QuestionMeta): Question {
  const id = meta.questionId;
  const returnedId = nonEmptyString(raw.externalid);
  if (returnedId && returnedId.toLowerCase() !== meta.fetchId.toLowerCase()) {
    throw new QuestionFormatError('malformed', id, 'The question bank returned a different question than requested.');
  }
  const stemHtml = typeof raw.stem === 'string' ? raw.stem : '';
  const stimulusHtml = optionalHtml(raw.stimulus);
  if (!hasVisibleContent(stemHtml) && !stimulusHtml) {
    throw new QuestionFormatError('malformed', id, 'The question has no text.');
  }
  const rationaleHtml = optionalHtml(raw.rationale);
  const type = nonEmptyString(raw.type)?.toLowerCase();
  const keys = Array.isArray(raw.keys) ? raw.keys.filter((k): k is string => typeof k === 'string') : [];
  const correctAnswer = Array.isArray(raw.correct_answer)
    ? raw.correct_answer.filter((k): k is string => typeof k === 'string')
    : [];

  if (type === 'mcq') {
    const options = Array.isArray(raw.answerOptions) ? raw.answerOptions : [];
    const choices: AnswerChoice[] = [];
    for (const [index, option] of options.entries()) {
      const optionId = isRecord(option) ? nonEmptyString(option.id) : null;
      const content = isRecord(option) && typeof option.content === 'string' ? option.content : null;
      if (!optionId || content === null) {
        throw new QuestionFormatError('malformed', id, 'An answer choice is missing its id or content.');
      }
      choices.push({ id: optionId, originalLetter: letterForIndex(index), html: content });
    }
    if (choices.length < 2) {
      throw new QuestionFormatError('malformed', id, 'The multiple-choice question has fewer than two answer choices.');
    }
    if (new Set(choices.map((c) => c.id)).size !== choices.length) {
      throw new QuestionFormatError('malformed', id, 'Answer choice ids are not unique.');
    }

    const keyedChoices = choices.filter((c) => keys.includes(c.id));
    const letteredChoices = choices.filter((c) =>
      correctAnswer.some((letter) => letter.trim().toUpperCase() === c.originalLetter),
    );
    if (keyedChoices.length > 1 || letteredChoices.length > 1) {
      throw new QuestionFormatError('unsupported', id, 'Questions with more than one correct choice are not supported.');
    }
    const keyed = keyedChoices[0];
    const lettered = letteredChoices[0];
    if (keyed && lettered && keyed.id !== lettered.id) {
      throw new QuestionFormatError('malformed', id, 'The answer key and the correct letter disagree.');
    }
    const correct = keyed ?? lettered;
    if (!correct) throw new QuestionFormatError('unsupported', id, 'The question has no answer key.');
    assertRationaleAgrees(meta, rationaleHtml, correct.originalLetter);

    const question: MultipleChoiceQuestion = {
      kind: 'mcq',
      meta,
      stimulusHtml,
      stemHtml,
      rationaleHtml,
      answerKeyOrigin: 'structured',
      choices,
      correctChoiceId: correct.id,
    };
    return question;
  }

  if (type === 'spr') {
    const accepted = [...new Set([...keys, ...correctAnswer].map((k) => k.trim()).filter(Boolean))];
    if (accepted.length === 0) throw new QuestionFormatError('unsupported', id, 'The question has no answer key.');
    const question: FreeResponseQuestion = {
      kind: 'spr',
      meta,
      stimulusHtml,
      stemHtml,
      rationaleHtml,
      answerKeyOrigin: 'structured',
      acceptedAnswers: accepted,
    };
    return question;
  }

  throw new QuestionFormatError('unsupported', id, `Question type "${String(raw.type)}" is not supported.`);
}

function normalizeLegacy(raw: RawRecord, meta: QuestionMeta): Question {
  const id = meta.questionId;
  const returnedId = nonEmptyString(raw.item_id);
  if (returnedId && returnedId.toLowerCase() !== meta.fetchId.toLowerCase()) {
    throw new QuestionFormatError('malformed', id, 'The question bank returned a different question than requested.');
  }
  const answer = isRecord(raw.answer) ? raw.answer : null;
  if (!answer) throw new QuestionFormatError('malformed', id, 'The question has no answer section.');

  const stemHtml = typeof raw.prompt === 'string' ? raw.prompt : '';
  const stimulusHtml = optionalHtml(raw.body);
  if (!hasVisibleContent(stemHtml) && !stimulusHtml) {
    throw new QuestionFormatError('malformed', id, 'The question has no text.');
  }
  const rationaleHtml = optionalHtml(answer.rationale);
  const style = (nonEmptyString(answer.style) ?? '').toLowerCase();

  if (style.includes('multiple choice')) {
    const rawChoices = isRecord(answer.choices) ? answer.choices : {};
    const letters = Object.keys(rawChoices)
      .filter((k) => /^[a-z]$/i.test(k))
      .sort();
    const choices: AnswerChoice[] = letters.map((key, index) => {
      const entry = rawChoices[key];
      const body = isRecord(entry) && typeof entry.body === 'string' ? entry.body : null;
      if (body === null) throw new QuestionFormatError('malformed', id, 'An answer choice is missing its content.');
      // Source letters are a, b, c, d in order; keep them as the stable ids.
      return { id: key.toUpperCase(), originalLetter: letterForIndex(index), html: body };
    });
    if (choices.length < 2) {
      throw new QuestionFormatError('malformed', id, 'The multiple-choice question has fewer than two answer choices.');
    }

    const structured = nonEmptyString(answer.correct_choice)?.toUpperCase() ?? null;
    const stated = findStatedCorrectLetters(rationaleHtml);
    let correctId: string | null = null;
    let origin: 'structured' | 'rationale' = 'structured';
    if (structured) {
      if (!choices.some((c) => c.id === structured)) {
        throw new QuestionFormatError('malformed', id, 'The answer key refers to a choice that does not exist.');
      }
      correctId = structured;
    } else if (stated.length === 1 && choices.some((c) => c.id === stated[0])) {
      correctId = stated[0]!;
      origin = 'rationale';
    }
    if (!correctId) throw new QuestionFormatError('unsupported', id, 'The question has no reliable answer key.');
    const correct = choices.find((c) => c.id === correctId)!;
    assertRationaleAgrees(meta, rationaleHtml, correct.originalLetter);

    const question: MultipleChoiceQuestion = {
      kind: 'mcq',
      meta,
      stimulusHtml,
      stemHtml,
      rationaleHtml,
      answerKeyOrigin: origin,
      choices,
      correctChoiceId: correctId,
    };
    return question;
  }

  if (style === 'spr' || style.includes('student')) {
    const accepted = findStatedFreeResponseAnswers(rationaleHtml);
    if (accepted.length === 0) {
      throw new QuestionFormatError('unsupported', id, 'The free-response answer could not be read reliably.');
    }
    const question: FreeResponseQuestion = {
      kind: 'spr',
      meta,
      stimulusHtml,
      stemHtml,
      rationaleHtml,
      answerKeyOrigin: 'rationale',
      acceptedAnswers: accepted,
    };
    return question;
  }

  throw new QuestionFormatError('unsupported', id, `Answer style "${String(answer.style)}" is not supported.`);
}

/** Converts a raw `get-question` payload into a gradable question, or throws `QuestionFormatError`. */
export function normalizeQuestionDetail(raw: unknown, meta: QuestionMeta): Question {
  if (!isRecord(raw)) throw new QuestionFormatError('malformed', meta.questionId, 'The question data is empty.');
  // Detect the payload's shape rather than trusting the list metadata alone.
  if ('answer' in raw && ('prompt' in raw || 'item_id' in raw)) return normalizeLegacy(raw, meta);
  if ('stem' in raw || 'answerOptions' in raw || 'type' in raw) return normalizeStandard(raw, meta);
  throw new QuestionFormatError('malformed', meta.questionId, 'The question data is in an unrecognized format.');
}
