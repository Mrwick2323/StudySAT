import { htmlToPlainText } from './text';

/**
 * Reads answer keys from explicit statements in a source rationale.
 *
 * Legacy question bank items sometimes omit the structured answer key, but
 * their College Board-written rationale always opens with an explicit
 * statement such as "Choice D is correct." or "The correct answer is 24."
 * These helpers only recognize those exact, unambiguous phrasings. Anything
 * else returns no key, and the question is treated as unsupported rather than
 * guessed at.
 */

const NUMBER_SOURCE = String.raw`[-−]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:\/\d+)?`;
const FULL_NUMBER = new RegExp(`^${NUMBER_SOURCE}$`);

/** Letters the rationale explicitly calls correct, e.g. "Choice C is the best answer." */
export function findStatedCorrectLetters(rationaleHtml: string | null | undefined): string[] {
  if (!rationaleHtml) return [];
  const text = htmlToPlainText(rationaleHtml);
  const letters = new Set<string>();
  const pattern = /\b[Cc]hoice\s+([A-D])\s+is\s+(?:the\s+)?(?:correct|best)\b/g;
  for (const match of text.matchAll(pattern)) letters.add(match[1]!);
  return [...letters].sort();
}

/** Normalizes a stated number to the form a student would enter; null if it is not a clean number. */
function cleanStatedNumber(raw: string): string | null {
  let value = raw.trim().replace(/−/g, '-');
  if (value.includes(',')) {
    // Only accept commas used as thousands separators, e.g. "1,250".
    if (!/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value)) return null;
    value = value.replace(/,/g, '');
  }
  return FULL_NUMBER.test(value) ? value : null;
}

/**
 * Free-response answers explicitly stated in a rationale, from
 * "The correct answer is 24." and
 * "Note that 3/2 and 1.5 are examples of ways to enter a correct answer."
 */
export function findStatedFreeResponseAnswers(rationaleHtml: string | null | undefined): string[] {
  if (!rationaleHtml) return [];
  const text = htmlToPlainText(rationaleHtml).replace(/\s+/g, ' ');
  const answers = new Set<string>();

  const stated = new RegExp(String.raw`\bThe correct answer is (${NUMBER_SOURCE})(?=\.(?:\s|$)|$)`, 'g');
  for (const match of text.matchAll(stated)) {
    const value = cleanStatedNumber(match[1]!);
    if (value) answers.add(value);
  }

  const examples = /\bNote that (.+?) (?:is an example|are examples) of (?:ways|a way) to enter (?:a|the) correct answer/gi;
  for (const match of text.matchAll(examples)) {
    const tokens = match[1]!
      .split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const cleaned = tokens.map(cleanStatedNumber);
    // Be conservative: if any listed entry is not a clean number, ignore the whole list.
    if (cleaned.length > 0 && cleaned.every((v): v is string => v !== null)) {
      for (const v of cleaned) answers.add(v);
    }
  }
  return [...answers];
}
