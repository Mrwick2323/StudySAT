import { describe, expect, it } from 'vitest';
import { findStatedCorrectLetters, findStatedFreeResponseAnswers } from './rationaleKeys';

describe('findStatedCorrectLetters', () => {
  it('recognizes the phrasings used by the source', () => {
    expect(findStatedCorrectLetters('<p>Choice C is the best answer. The text says so.</p>')).toEqual(['C']);
    expect(findStatedCorrectLetters('<p>Choice A is correct. It&rsquo;s given that...</p>')).toEqual(['A']);
  });

  it('does not confuse "incorrect" with "correct"', () => {
    expect(findStatedCorrectLetters('<p>Choice B is incorrect. Choice D is incorrect.</p>')).toEqual([]);
  });

  it('returns every distinct letter so callers can detect ambiguity', () => {
    expect(findStatedCorrectLetters('<p>Choice A is correct.</p><p>Choice B is correct.</p>')).toEqual(['A', 'B']);
  });

  it('handles empty input', () => {
    expect(findStatedCorrectLetters(null)).toEqual([]);
    expect(findStatedCorrectLetters('')).toEqual([]);
  });
});

describe('findStatedFreeResponseAnswers', () => {
  it('reads "The correct answer is N."', () => {
    expect(findStatedFreeResponseAnswers('<p>The correct answer is 24. The sine of...</p>')).toEqual(['24']);
    expect(findStatedFreeResponseAnswers('<p>The correct answer is 4.44. The selling price...</p>')).toEqual(['4.44']);
    expect(findStatedFreeResponseAnswers('<p>The correct answer is &minus;3.</p>')).toEqual(['-3']);
  });

  it('removes thousands separators', () => {
    expect(findStatedFreeResponseAnswers('<p>The correct answer is 3,540. According to the table...</p>')).toEqual(['3540']);
  });

  it('reads the list of example entries', () => {
    expect(
      findStatedFreeResponseAnswers(
        '<p>The correct answer is <img alt="seven sixths">. Note that 7/6, 1.166, and 1.167 are examples of ways to enter a correct answer.</p>',
      ),
    ).toEqual(['7/6', '1.166', '1.167']);
  });

  it('collects every answer when more than one is correct', () => {
    expect(
      findStatedFreeResponseAnswers(
        '<p>The correct answer is either 8 or 9. Note that 8 and 9 are examples of ways to enter a correct answer.</p>',
      ),
    ).toEqual(['8', '9']);
  });

  it('never reads numbers out of image alt text', () => {
    expect(findStatedFreeResponseAnswers('<p>The correct answer is <img alt="12">.</p>')).toEqual([]);
  });

  it('does not take a partial answer from "either 3 or 5" without the example list', () => {
    expect(findStatedFreeResponseAnswers('<p>The correct answer is 3 or 5.</p>')).toEqual([]);
  });

  it('ignores an example list containing something that is not a number', () => {
    expect(
      findStatedFreeResponseAnswers('<p>Note that 3/2 and one and a half are examples of ways to enter a correct answer.</p>'),
    ).toEqual([]);
  });
});
