import { describe, expect, it } from 'vitest';
import { mcqQuestion, sprQuestion } from '../test/fixtures';
import { checkFreeResponseInput, gradeResponse, isAnswered, isFreeResponseCorrect, isResponseCorrect, parseSatNumber } from './validation';

describe('parseSatNumber', () => {
  it('parses integers, decimals and fractions exactly', () => {
    expect(parseSatNumber('12')).toEqual({ num: 12n, den: 1n });
    expect(parseSatNumber('-2.50')).toEqual({ num: -5n, den: 2n });
    expect(parseSatNumber('.25')).toEqual({ num: 1n, den: 4n });
    expect(parseSatNumber('6/8')).toEqual({ num: 3n, den: 4n });
    expect(parseSatNumber('-7/2')).toEqual({ num: -7n, den: 2n });
    expect(parseSatNumber('−3')).toEqual({ num: -3n, den: 1n });
  });

  it('rejects things that are not numbers', () => {
    for (const bad of ['', '-', '.', 'abc', '1/0', '1.2.3', '3 1/2', '1,000', '2x']) {
      expect(parseSatNumber(bad)).toBeNull();
    }
  });
});

describe('checkFreeResponseInput', () => {
  it('explains why an entry cannot be graded', () => {
    expect(checkFreeResponseInput('  ')).toMatchObject({ ok: false });
    expect(checkFreeResponseInput('3 1/2')).toMatchObject({ ok: false, message: expect.stringContaining('Mixed numbers') });
    expect(checkFreeResponseInput('1,250')).toMatchObject({ ok: false, message: expect.stringContaining('commas') });
    expect(checkFreeResponseInput('25%')).toMatchObject({ ok: false, message: expect.stringContaining('symbols') });
    expect(checkFreeResponseInput('1.5/2')).toMatchObject({ ok: false });
    expect(checkFreeResponseInput('seven')).toMatchObject({ ok: false });
  });

  it('accepts valid entries', () => {
    expect(checkFreeResponseInput(' 7/3 ')).toEqual({ ok: true, value: '7/3' });
    expect(checkFreeResponseInput('+4')).toEqual({ ok: true, value: '4' });
  });
});

describe('isFreeResponseCorrect', () => {
  it('accepts exact matches and equivalent forms', () => {
    expect(isFreeResponseCorrect('0.25', ['0.25', '1/4'])).toBe(true);
    expect(isFreeResponseCorrect('.25', ['0.25', '1/4'])).toBe(true);
    expect(isFreeResponseCorrect('2/8', ['0.25', '1/4'])).toBe(true);
    expect(isFreeResponseCorrect('110.0', ['110'])).toBe(true);
    expect(isFreeResponseCorrect('-4', ['-4'])).toBe(true);
  });

  it('rejects wrong answers', () => {
    expect(isFreeResponseCorrect('0.26', ['0.25', '1/4'])).toBe(false);
    expect(isFreeResponseCorrect('4', ['-4'])).toBe(false);
    expect(isFreeResponseCorrect('', ['0'])).toBe(false);
  });

  it('accepts truncated or rounded decimals that fill the answer field', () => {
    const keys = ['.1764', '.1765', '3/17'];
    expect(isFreeResponseCorrect('.1764', keys)).toBe(true);
    expect(isFreeResponseCorrect('.1765', keys)).toBe(true);
    expect(isFreeResponseCorrect('0.176', keys)).toBe(true); // listed by the source as acceptable
    expect(isFreeResponseCorrect('0.1765', keys)).toBe(true);
    expect(isFreeResponseCorrect('3/17', keys)).toBe(true);
    expect(isFreeResponseCorrect('6/34', keys)).toBe(true);
  });

  it('rejects decimals that are too short or wrongly rounded', () => {
    const keys = ['3/17'];
    expect(isFreeResponseCorrect('.176', keys)).toBe(false); // does not fill the field
    expect(isFreeResponseCorrect('.18', keys)).toBe(false);
    expect(isFreeResponseCorrect('0.177', keys)).toBe(false);
    expect(isFreeResponseCorrect('.1766', keys)).toBe(false);
  });

  it('handles negative non-terminating answers (6-character field)', () => {
    expect(isFreeResponseCorrect('-.6666', ['-2/3'])).toBe(true);
    expect(isFreeResponseCorrect('-.6667', ['-2/3'])).toBe(true);
    expect(isFreeResponseCorrect('-0.667', ['-2/3'])).toBe(true);
    expect(isFreeResponseCorrect('-.667', ['-2/3'])).toBe(false);
    expect(isFreeResponseCorrect('.6667', ['-2/3'])).toBe(false);
  });

  it('does not allow approximating an answer that fits in the field exactly', () => {
    expect(isFreeResponseCorrect('0.667', ['.6667'])).toBe(false);
    expect(isFreeResponseCorrect('0.13', ['.125'])).toBe(false);
  });

  it('approximates mixed values above 1', () => {
    expect(isFreeResponseCorrect('2.333', ['7/3'])).toBe(true);
    expect(isFreeResponseCorrect('2.33', ['7/3'])).toBe(false);
  });

  it('accepts any of several distinct correct answers', () => {
    expect(isFreeResponseCorrect('9', ['8', '9'])).toBe(true);
  });

  it('compares non-numeric keys as text', () => {
    expect(isFreeResponseCorrect('12', ['12 '])).toBe(true);
  });
});

describe('isResponseCorrect / gradeResponse', () => {
  const mcq = mcqQuestion();
  const spr = sprQuestion(undefined, ['12']);

  it('grades multiple choice by choice id', () => {
    expect(isResponseCorrect(mcq, { kind: 'mcq', choiceId: mcq.correctChoiceId })).toBe(true);
    expect(isResponseCorrect(mcq, { kind: 'mcq', choiceId: mcq.choices[0]!.id })).toBe(false);
    expect(gradeResponse(mcq, { kind: 'mcq', choiceId: mcq.correctChoiceId })).toBe('correct');
    expect(gradeResponse(mcq, { kind: 'mcq', choiceId: mcq.choices[0]!.id })).toBe('incorrect');
  });

  it('never accepts a response of the wrong kind', () => {
    expect(isResponseCorrect(mcq, { kind: 'spr', value: mcq.correctChoiceId })).toBe(false);
    expect(isResponseCorrect(spr, { kind: 'mcq', choiceId: '12' })).toBe(false);
  });

  it('treats missing and blank responses as unanswered', () => {
    expect(gradeResponse(mcq, undefined)).toBe('unanswered');
    expect(gradeResponse(spr, { kind: 'spr', value: '   ' })).toBe('unanswered');
    expect(isAnswered({ kind: 'mcq', choiceId: '' })).toBe(false);
  });

  it('grades free response', () => {
    expect(gradeResponse(spr, { kind: 'spr', value: '12' })).toBe('correct');
    expect(gradeResponse(spr, { kind: 'spr', value: '13' })).toBe('incorrect');
    expect(gradeResponse(spr, { kind: 'spr', value: 'twelve' })).toBe('incorrect');
  });
});
