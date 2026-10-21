import { describe, expect, it } from 'vitest';
import { meta, rawLegacyMcq, rawLegacySpr, rawListRecord, rawStandardMcq, rawStandardSpr } from '../test/fixtures';
import { normalizeQuestionDetail, normalizeQuestionList, normalizeQuestionMeta, QuestionFormatError } from './normalize';

function expectFormatError(fn: () => unknown, kind: 'unsupported' | 'malformed') {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(QuestionFormatError);
    expect((error as QuestionFormatError).kind).toBe(kind);
    return;
  }
  throw new Error('Expected a QuestionFormatError');
}

describe('normalizeQuestionMeta', () => {
  it('maps the documented list fields', () => {
    const result = normalizeQuestionMeta(
      rawListRecord({ questionId: '14189fbb', external_id: '4e06110f', difficulty: 'E', score_band_range_cd: 3 }),
      'rw',
    );
    expect(result).toMatchObject({
      questionId: '14189fbb',
      subject: 'rw',
      domainCode: 'INI',
      domainName: 'Information and Ideas',
      skillCode: 'CID',
      skillName: 'Central Ideas and Details',
      difficulty: 'E',
      scoreBand: 3,
      fetchId: '4e06110f',
      format: 'standard',
    });
  });

  it('uses the ibn for legacy items that have no external_id', () => {
    const result = normalizeQuestionMeta(rawListRecord({ external_id: null, ibn: '022222-DC' }), 'math');
    expect(result).toMatchObject({ fetchId: '022222-DC', format: 'legacy' });
  });

  it('rejects records that cannot be fetched or classified', () => {
    expect(normalizeQuestionMeta(rawListRecord({ external_id: null, ibn: '' }), 'rw')).toBeNull();
    expect(normalizeQuestionMeta(rawListRecord({ questionId: '' }), 'rw')).toBeNull();
    expect(normalizeQuestionMeta(rawListRecord({ skill_cd: null }), 'rw')).toBeNull();
    expect(normalizeQuestionMeta('not an object', 'rw')).toBeNull();
    expect(normalizeQuestionMeta(null, 'rw')).toBeNull();
  });

  it('keeps unknown difficulty as null instead of inventing one', () => {
    expect(normalizeQuestionMeta(rawListRecord({ difficulty: 'X' }), 'rw')?.difficulty).toBeNull();
    expect(normalizeQuestionMeta(rawListRecord({ difficulty: undefined }), 'rw')?.difficulty).toBeNull();
  });

  it('trims skill descriptions that carry trailing spaces', () => {
    expect(normalizeQuestionMeta(rawListRecord({ skill_desc: 'Inference from sample statistics ' }), 'math')?.skillName).toBe(
      'Inference from sample statistics',
    );
  });
});

describe('normalizeQuestionList', () => {
  it('drops malformed records, counts them, and removes duplicates', () => {
    const a = rawListRecord({ questionId: 'aaa' });
    const result = normalizeQuestionList([a, { ...a }, { junk: true }, rawListRecord({ questionId: 'bbb' })], 'rw');
    expect(result.questions.map((q) => q.questionId)).toEqual(['aaa', 'bbb']);
    expect(result.malformedCount).toBe(1);
  });
});

describe('normalizeQuestionDetail – standard format', () => {
  const m = meta({ fetchId: 'ext-1' });

  it('normalizes a multiple-choice question and maps the key to a choice id', () => {
    const q = normalizeQuestionDetail(rawStandardMcq(), m);
    expect(q.kind).toBe('mcq');
    if (q.kind !== 'mcq') return;
    expect(q.choices.map((c) => [c.id, c.originalLetter])).toEqual([
      ['opt-a', 'A'],
      ['opt-b', 'B'],
      ['opt-c', 'C'],
      ['opt-d', 'D'],
    ]);
    expect(q.correctChoiceId).toBe('opt-c');
    expect(q.stimulusHtml).toContain('fictional town');
    expect(q.rationaleHtml).toContain('Choice C');
    expect(q.answerKeyOrigin).toBe('structured');
  });

  it('falls back to the correct letter when keys are missing', () => {
    const q = normalizeQuestionDetail(rawStandardMcq({ keys: [] }), m);
    expect(q.kind === 'mcq' && q.correctChoiceId).toBe('opt-c');
  });

  it('rejects a key that disagrees with the correct letter', () => {
    expectFormatError(() => normalizeQuestionDetail(rawStandardMcq({ correct_answer: ['A'] }), m), 'malformed');
  });

  it('rejects a key that contradicts the explanation', () => {
    expectFormatError(
      () => normalizeQuestionDetail(rawStandardMcq({ rationale: '<p>Choice D is correct. Because.</p>' }), m),
      'malformed',
    );
  });

  it('treats a question with no answer key as unsupported', () => {
    expectFormatError(() => normalizeQuestionDetail(rawStandardMcq({ keys: [], correct_answer: [] }), m), 'unsupported');
  });

  it('rejects choices without ids or content', () => {
    expectFormatError(
      () => normalizeQuestionDetail(rawStandardMcq({ answerOptions: [{ id: 'x' }, { id: 'y', content: 'y' }] }), m),
      'malformed',
    );
  });

  it('supports any number of choices of at least two', () => {
    const q = normalizeQuestionDetail(
      rawStandardMcq({
        answerOptions: [
          { id: 'x', content: 'x' },
          { id: 'y', content: 'y' },
          { id: 'z', content: 'z' },
        ],
        keys: ['z'],
        correct_answer: ['C'],
      }),
      m,
    );
    expect(q.kind === 'mcq' && q.choices).toHaveLength(3);
    expectFormatError(
      () => normalizeQuestionDetail(rawStandardMcq({ answerOptions: [{ id: 'x', content: 'x' }], keys: ['x'], correct_answer: ['A'] }), m),
      'malformed',
    );
  });

  it('normalizes a free-response question with all accepted answers', () => {
    const q = normalizeQuestionDetail(rawStandardSpr({ externalid: 'ext-1' }), m);
    expect(q.kind).toBe('spr');
    expect(q.kind === 'spr' && q.acceptedAnswers).toEqual(['.1764', '.1765', '3/17']);
  });

  it('treats a free-response question without keys as unsupported', () => {
    expectFormatError(() => normalizeQuestionDetail(rawStandardSpr({ externalid: 'ext-1', keys: [], correct_answer: [] }), m), 'unsupported');
  });

  it('keeps questions without an explanation but records that it is missing', () => {
    const q = normalizeQuestionDetail(rawStandardMcq({ rationale: '' }), m);
    expect(q.rationaleHtml).toBeNull();
    const q2 = normalizeQuestionDetail(rawStandardMcq({ rationale: undefined }), m);
    expect(q2.rationaleHtml).toBeNull();
  });

  it('rejects unknown question types and empty questions', () => {
    expectFormatError(() => normalizeQuestionDetail(rawStandardMcq({ type: 'essay' }), m), 'unsupported');
    expectFormatError(() => normalizeQuestionDetail(rawStandardMcq({ stem: '', stimulus: '' }), m), 'malformed');
  });

  it('rejects a payload for a different question than requested', () => {
    expectFormatError(() => normalizeQuestionDetail(rawStandardMcq({ externalid: 'someone-else' }), m), 'malformed');
  });

  it('rejects payloads it does not recognize', () => {
    expectFormatError(() => normalizeQuestionDetail({ hello: 'world' }, m), 'malformed');
    expectFormatError(() => normalizeQuestionDetail(null, m), 'malformed');
  });
});

describe('normalizeQuestionDetail – legacy format', () => {
  const m = meta({ subject: 'math', fetchId: '012345-DC', format: 'legacy' });

  it('normalizes multiple choice with a structured key', () => {
    const q = normalizeQuestionDetail(rawLegacyMcq(), m);
    expect(q.kind).toBe('mcq');
    if (q.kind !== 'mcq') return;
    expect(q.choices.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(q.correctChoiceId).toBe('D');
    expect(q.answerKeyOrigin).toBe('structured');
    expect(q.stimulusHtml).toContain('basket');
  });

  it('reads the key from an explicit rationale statement when the structured key is missing', () => {
    const q = normalizeQuestionDetail(rawLegacyMcq({}, { correct_choice: undefined }), m);
    expect(q.kind === 'mcq' && q.correctChoiceId).toBe('D');
    expect(q.answerKeyOrigin).toBe('rationale');
  });

  it('does not guess when neither a key nor an explicit statement exists', () => {
    expectFormatError(
      () => normalizeQuestionDetail(rawLegacyMcq({}, { correct_choice: undefined, rationale: '<p>Think about it.</p>' }), m),
      'unsupported',
    );
  });

  it('rejects a structured key that refers to a missing choice', () => {
    expectFormatError(() => normalizeQuestionDetail(rawLegacyMcq({}, { correct_choice: 'e' }), m), 'malformed');
  });

  it('reads free-response answers from the rationale', () => {
    const q = normalizeQuestionDetail(
      rawLegacySpr('<p>The correct answer is 2.5. Note that 2.5 and 5/2 are examples of ways to enter a correct answer.</p>'),
      { ...m, fetchId: '054321-DC' },
    );
    expect(q.kind === 'spr' && q.acceptedAnswers).toEqual(['2.5', '5/2']);
    expect(q.answerKeyOrigin).toBe('rationale');
  });

  it('treats a free-response item whose answer is only shown as an image as unsupported', () => {
    expectFormatError(
      () =>
        normalizeQuestionDetail(rawLegacySpr('<p>The correct answer is <img alt="three halves" src="data:image/png;base64,AAAA">.</p>'), {
          ...m,
          fetchId: '054321-DC',
        }),
      'unsupported',
    );
  });
});
