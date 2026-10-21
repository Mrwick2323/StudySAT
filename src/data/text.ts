/**
 * DOM-free text helpers used by the data layer, so normalization works the same
 * in the browser, in unit tests, and in the Node-based live API check.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: '\u00a0',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  minus: '−',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  times: '×',
  divide: '÷',
  deg: '°',
  le: '≤',
  ge: '≥',
  ne: '≠',
  pi: 'π',
  thinsp: '\u2009',
  ensp: '\u2002',
  emsp: '\u2003',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Converts an HTML fragment to plain text. Images (and their alt text) are
 * dropped so that numbers are never read out of image descriptions.
 */
export function htmlToPlainText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style|svg|math)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withoutBlocks)
    .replace(/[\u00a0\u2009\u2002\u2003]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/** True when an HTML fragment contains something visible (text, image, math, svg, table). */
export function hasVisibleContent(html: string | null | undefined): boolean {
  if (!html) return false;
  if (/<(img|svg|math|table)\b/i.test(html)) return true;
  return htmlToPlainText(html).replace(/\s+/g, '').length > 0;
}
