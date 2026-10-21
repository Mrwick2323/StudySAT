/**
 * Synthetic fixtures shaped like the College Board question bank responses
 * documented in documentation.txt. The content is invented placeholder text:
 * real question content is copyrighted and is never stored in this repository.
 */
import type { MultipleChoiceQuestion, FreeResponseQuestion, QuestionMeta, SubjectId, Difficulty } from '../data/types';

let counter = 0;

export function rawListRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  counter++;
  return {
    createDate: 1691007959360,
    updateDate: 1691007959360,
    external_id: `ext-${counter}`,
    ibn: null,
    pPcc: 'SAT#INI',
    primary_class_cd: 'INI',
    primary_class_cd_desc: 'Information and Ideas',
    program: 'SAT',
    questionId: `q${counter.toString(16).padStart(7, '0')}`,
    score_band_range_cd: 3,
    skill_cd: 'CID',
    skill_desc: 'Central Ideas and Details',
    uId: `uid-${counter}`,
    difficulty: 'E',
    ...overrides,
  };
}

export function rawStandardMcq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalid: 'ext-1',
    type: 'mcq',
    stimulus: '<p>A sample passage about a fictional town.</p>',
    stem: '<p>Which choice best states the main idea of the text?</p>',
    answerOptions: [
      { id: 'opt-a', content: '<p>First option</p>' },
      { id: 'opt-b', content: '<p>Second option</p>' },
      { id: 'opt-c', content: '<p>Third option</p>' },
      { id: 'opt-d', content: '<p>Fourth option</p>' },
    ],
    keys: ['opt-c'],
    correct_answer: ['C'],
    rationale:
      '<p>Choice C is the best answer. The passage says so.</p><p>Choice A is incorrect. It is unrelated. Choice B is incorrect. It contradicts the text. Choice D is incorrect. It is too broad.</p>',
    ...overrides,
  };
}

export function rawStandardSpr(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalid: 'ext-2',
    type: 'spr',
    stem: '<p>What is the value of <math alttext="x"><mi>x</mi></math>?</p>',
    answerOptions: [],
    keys: ['.1764', '.1765', '3/17'],
    correct_answer: ['.1764', '.1765', '3/17'],
    rationale: '<p>The correct answer is 3/17. Note that 3/17, .1764, .1765, and 0.176 are examples of ways to enter a correct answer.</p>',
    ...overrides,
  };
}

export function rawLegacyMcq(overrides: Record<string, unknown> = {}, answer: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    item_id: '012345-DC',
    section: 'Math',
    prompt: '<p class="stem_paragraph ">How many apples are in the basket?</p>',
    body: '<div class="stimulus_reference "><p>A basket holds apples.</p></div>',
    answer: {
      style: 'Multiple Choice',
      choices: {
        a: { body: '<p class="choice_paragraph ">10</p>' },
        b: { body: '<p class="choice_paragraph ">9</p>' },
        c: { body: '<p class="choice_paragraph ">6</p>' },
        d: { body: '<p class="choice_paragraph ">5</p>' },
      },
      correct_choice: 'd',
      rationale: '<p>Choice D is correct. Five apples remain.<p>Choices A, B, and C are incorrect and may result from calculation errors.</p></p>',
      ...answer,
    },
    ...overrides,
  };
}

export function rawLegacySpr(rationale: string): Record<string, unknown> {
  return {
    item_id: '054321-DC',
    section: 'Math',
    prompt: '<p class="stem_paragraph ">What is the value of <span class="italic">y</span>?</p>',
    answer: { style: 'SPR', rationale },
  };
}

export function meta(overrides: Partial<QuestionMeta> = {}): QuestionMeta {
  counter++;
  return {
    questionId: `m${counter}`,
    subject: 'rw',
    domainCode: 'INI',
    domainName: 'Information and Ideas',
    skillCode: 'CID',
    skillName: 'Central Ideas and Details',
    difficulty: 'E',
    scoreBand: 3,
    fetchId: `ext-${counter}`,
    format: 'standard',
    updatedAt: null,
    ...overrides,
  };
}

const SKILLS: Record<string, { subject: SubjectId; domainCode: string; domainName: string; skillName: string }> = {
  CID: { subject: 'rw', domainCode: 'INI', domainName: 'Information and Ideas', skillName: 'Central Ideas and Details' },
  INF: { subject: 'rw', domainCode: 'INI', domainName: 'Information and Ideas', skillName: 'Inferences' },
  WIC: { subject: 'rw', domainCode: 'CAS', domainName: 'Craft and Structure', skillName: 'Words in Context' },
  BOU: { subject: 'rw', domainCode: 'SEC', domainName: 'Standard English Conventions', skillName: 'Boundaries' },
  'H.A.': { subject: 'math', domainCode: 'H', domainName: 'Algebra', skillName: 'Linear equations in one variable' },
  'H.B.': { subject: 'math', domainCode: 'H', domainName: 'Algebra', skillName: 'Linear functions' },
  'P.A.': { subject: 'math', domainCode: 'P', domainName: 'Advanced Math', skillName: 'Equivalent expressions' },
  'S.D.': { subject: 'math', domainCode: 'S', domainName: 'Geometry and Trigonometry', skillName: 'Circles' },
};

/** Metadata for a question in one of the fixture skills above. */
export function metaFor(skillCode: keyof typeof SKILLS | string, difficulty: Difficulty | null = 'M', id?: string): QuestionMeta {
  const skill = SKILLS[skillCode];
  if (!skill) throw new Error(`Unknown fixture skill ${skillCode}`);
  return meta({ ...skill, skillCode, difficulty, ...(id ? { questionId: id } : {}) });
}

export function mcqQuestion(m: QuestionMeta = meta(), overrides: Partial<MultipleChoiceQuestion> = {}): MultipleChoiceQuestion {
  return {
    kind: 'mcq',
    meta: m,
    stimulusHtml: '<p>Placeholder passage.</p>',
    stemHtml: `<p>Placeholder question ${m.questionId}?</p>`,
    rationaleHtml: '<p>Choice B is the best answer. Because.</p><p>Choice A is incorrect. Nope.</p>',
    answerKeyOrigin: 'structured',
    choices: [
      { id: `${m.questionId}-a`, originalLetter: 'A', html: '<p>Alpha</p>' },
      { id: `${m.questionId}-b`, originalLetter: 'B', html: '<p>Bravo</p>' },
      { id: `${m.questionId}-c`, originalLetter: 'C', html: '<p>Charlie</p>' },
      { id: `${m.questionId}-d`, originalLetter: 'D', html: '<p>Delta</p>' },
    ],
    correctChoiceId: `${m.questionId}-b`,
    ...overrides,
  };
}

export function sprQuestion(m: QuestionMeta = meta({ subject: 'math', domainCode: 'H', skillCode: 'H.A.' }), acceptedAnswers = ['12']): FreeResponseQuestion {
  return {
    kind: 'spr',
    meta: m,
    stimulusHtml: null,
    stemHtml: `<p>Placeholder free-response question ${m.questionId}?</p>`,
    rationaleHtml: `<p>The correct answer is ${acceptedAnswers[0]}.</p>`,
    answerKeyOrigin: 'structured',
    acceptedAnswers,
  };
}
