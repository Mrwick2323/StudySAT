import type { OutcomeStatus, Question, UserResponse } from './types';

/**
 * Answer validation.
 *
 * Multiple choice compares choice ids, so it is unaffected by how choices are
 * displayed. Free response ("student-produced response") follows the digital
 * SAT entry rules:
 *  - integers, decimals and fractions are accepted; equivalent forms of an
 *    accepted answer are correct (1/4 = 0.25 = .25 = 2/8);
 *  - a non-terminating value may be entered as a decimal that is truncated or
 *    rounded, as long as it fills the answer field (5 characters, or 6 for a
 *    negative answer), e.g. 3/17 → .1764, .1765 or 0.176;
 *  - mixed numbers, commas and symbols are not accepted.
 */

/** An exact rational number with a positive denominator, reduced to lowest terms. */
export interface Rational {
  num: bigint;
  den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function reduce(num: bigint, den: bigint): Rational {
  if (den < 0n) [num, den] = [-num, -den];
  const divisor = gcd(num, den) || 1n;
  return { num: num / divisor, den: den / divisor };
}

/** Removes whitespace and normalizes minus signs; leaves everything else for validation. */
function canonicalInput(input: string): string {
  return input.trim().replace(/[−–—]/g, '-').replace(/^\+/, '');
}

const DECIMAL = /^(-?)(\d*)\.?(\d*)$/;
const FRACTION = /^(-?)(\d+)\/(-?)(\d+)$/;

/** Parses an SAT-style numeric entry ("-3", "2.5", ".5", "7/2"); null if it is not one. */
export function parseSatNumber(input: string): Rational | null {
  const value = canonicalInput(input);
  if (value === '' || value === '-' || value === '.') return null;
  const fraction = FRACTION.exec(value);
  if (fraction) {
    const [, sign1, top, sign2, bottom] = fraction;
    const den = BigInt(bottom!);
    if (den === 0n) return null;
    const negative = (sign1 === '-') !== (sign2 === '-');
    return reduce(BigInt(top!) * (negative ? -1n : 1n), den);
  }
  const decimal = DECIMAL.exec(value);
  if (decimal && (decimal[2] || decimal[3])) {
    const [, sign, whole, frac] = decimal;
    const den = 10n ** BigInt(frac!.length);
    const num = BigInt((whole || '0') + frac);
    return reduce(sign === '-' ? -num : num, den);
  }
  return null;
}

function equal(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den;
}

export type InputCheck = { ok: true; value: string } | { ok: false; message: string };

/** Checks a free-response entry before it is submitted, with a helpful message if it can't be graded. */
export function checkFreeResponseInput(input: string): InputCheck {
  const value = canonicalInput(input);
  if (value === '') return { ok: false, message: 'Enter an answer first.' };
  if (/\d\s+\d+\s*\/\s*\d/.test(input.trim())) {
    return { ok: false, message: 'Mixed numbers aren’t accepted. Enter 3 1/2 as 7/2 or 3.5.' };
  }
  if (value.includes(',')) return { ok: false, message: 'Don’t use commas. Enter 1,250 as 1250.' };
  if (/[%$°]/.test(value)) return { ok: false, message: 'Enter just the number, without symbols like %, $ or °.' };
  if (value.includes('/') && value.includes('.')) {
    return { ok: false, message: 'Enter either a fraction or a decimal, not both.' };
  }
  if (!parseSatNumber(value)) {
    return { ok: false, message: 'Enter a number, decimal or fraction, such as 12, -2.5, .75 or 7/3.' };
  }
  return { ok: true, value };
}

/** Normalization for comparing non-numeric keys as text. */
function textKey(value: string): string {
  return canonicalInput(value).toLowerCase().replace(/\s+/g, '');
}

/** Characters available in the SAT answer field (one more for a minus sign). */
function fieldLength(negative: boolean): number {
  return negative ? 6 : 5;
}

/**
 * Whether the exact value can be typed as a decimal within the answer field.
 * Only values that cannot (like 3/17 = 0.17647...) may be approximated.
 */
function decimalFitsField(exact: Rational): boolean {
  let rest = exact.den;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos++;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives++;
  }
  if (rest !== 1n) return false; // Non-terminating decimal.
  const places = Math.max(twos, fives);
  const magnitude = exact.num < 0n ? -exact.num : exact.num;
  const whole = magnitude / exact.den;
  // Shortest typed form drops the leading zero, e.g. ".125". The minus sign
  // has its own extra character, so compare the unsigned length.
  const length = (whole === 0n && places > 0 ? 0 : whole.toString().length) + (places > 0 ? 1 + places : 0);
  return length <= fieldLength(false);
}

/**
 * Whether `entry` is an acceptable decimal approximation of `exact`: the exact
 * value must not fit in the answer field, and the entry must be its truncated
 * or rounded value at the entry's own precision while filling the field.
 */
function isAcceptedApproximation(entry: string, exact: Rational): boolean {
  if (decimalFitsField(exact)) return false;
  const match = DECIMAL.exec(entry);
  if (!match || !entry.includes('.')) return false;
  const [, sign, whole, frac] = match;
  const places = frac!.length;
  if (places === 0) return false;
  const negative = sign === '-';
  if (entry.length < fieldLength(negative)) return false;
  if ((exact.num < 0n) !== negative && exact.num !== 0n) return false;

  const scale = 10n ** BigInt(places);
  const magnitude = exact.num < 0n ? -exact.num : exact.num;
  const truncated = (magnitude * scale) / exact.den;
  const rounded = (magnitude * scale * 2n + exact.den) / (2n * exact.den);
  const entered = BigInt((whole || '0') + frac);
  return entered === truncated || entered === rounded;
}

export function isFreeResponseCorrect(input: string, acceptedAnswers: readonly string[]): boolean {
  const check = checkFreeResponseInput(input);
  if (!check.ok) return false;
  const entry = check.value;
  const entered = parseSatNumber(entry)!;
  for (const accepted of acceptedAnswers) {
    const exact = parseSatNumber(accepted);
    if (exact) {
      if (equal(entered, exact) || isAcceptedApproximation(entry, exact)) return true;
    } else if (textKey(accepted) === textKey(entry)) {
      return true;
    }
  }
  return false;
}

export function isResponseCorrect(question: Question, response: UserResponse): boolean {
  if (question.kind === 'mcq') return response.kind === 'mcq' && response.choiceId === question.correctChoiceId;
  return response.kind === 'spr' && isFreeResponseCorrect(response.value, question.acceptedAnswers);
}

/** True when a response actually contains an answer (blank free-response entries do not count). */
export function isAnswered(response: UserResponse | undefined): response is UserResponse {
  if (!response) return false;
  return response.kind === 'mcq' ? response.choiceId !== '' : response.value.trim() !== '';
}

export function gradeResponse(question: Question, response: UserResponse | undefined): OutcomeStatus {
  if (!isAnswered(response)) return 'unanswered';
  return isResponseCorrect(question, response) ? 'correct' : 'incorrect';
}
