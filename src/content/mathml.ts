/**
 * Rewrites MathML features that browsers implementing MathML Core no longer
 * render (Chrome and Firefox dropped them), so source math displays correctly:
 *
 *  - `<mfenced>` → `<mrow>` with explicit `<mo>` fences and separators.
 *  - `mathvariant` values other than "normal" (e.g. "script" for line ℓ) →
 *    the equivalent Unicode Mathematical Alphanumeric characters.
 *  - Segment bars written as `<mover>…<mo>¯</mo></mover>` → a stretchy
 *    overline accent, so the bar spans the whole segment name (QS, not Q).
 *  - Function names (sin, cos, log…) directly followed by their argument get
 *    the customary thin space ("cos Q", not "cosQ").
 */

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

function createMo(doc: Document, text: string, kind: 'fence' | 'separator'): Element {
  const mo = doc.createElementNS(MATHML_NS, 'mo');
  mo.textContent = text;
  if (kind === 'fence') mo.setAttribute('fence', 'true');
  else mo.setAttribute('separator', 'true');
  return mo;
}

function replaceMfenced(mfenced: Element): void {
  const doc = mfenced.ownerDocument;
  const open = mfenced.getAttribute('open') ?? '(';
  const close = mfenced.getAttribute('close') ?? ')';
  const separators = (mfenced.getAttribute('separators') ?? ',').replace(/\s+/g, '');
  const children = [...mfenced.children];
  const mrow = doc.createElementNS(MATHML_NS, 'mrow');
  if (open) mrow.append(createMo(doc, open, 'fence'));
  children.forEach((child, i) => {
    if (i > 0 && separators) {
      mrow.append(createMo(doc, separators[Math.min(i - 1, separators.length - 1)]!, 'separator'));
    }
    mrow.append(child);
  });
  if (close) mrow.append(createMo(doc, close, 'fence'));
  mfenced.replaceWith(mrow);
}

/** Code points of "A", "a" and "0" in each Unicode mathematical alphabet. */
const ALPHABETS: Record<string, { upper: number; lower: number; digit?: number }> = {
  bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
  italic: { upper: 0x1d434, lower: 0x1d44e },
  'bold-italic': { upper: 0x1d468, lower: 0x1d482 },
  script: { upper: 0x1d49c, lower: 0x1d4b6 },
  'bold-script': { upper: 0x1d4d0, lower: 0x1d4ea },
  fraktur: { upper: 0x1d504, lower: 0x1d51e },
  'double-struck': { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 },
  'bold-fraktur': { upper: 0x1d56c, lower: 0x1d586 },
  'sans-serif': { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
  'bold-sans-serif': { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
  monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
};

/** Letters that live in the Letterlike Symbols block instead of the alphabet's slot. */
const EXCEPTIONS: Record<string, Record<string, string>> = {
  italic: { h: 'ℎ' },
  script: {
    B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ',
    e: 'ℯ', g: 'ℊ', o: 'ℴ',
  },
  fraktur: { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' },
  'double-struck': { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' },
};

export function toMathVariant(text: string, variant: string): string {
  const alphabet = ALPHABETS[variant];
  if (!alphabet) return text;
  const exceptions = EXCEPTIONS[variant] ?? {};
  return [...text]
    .map((ch) => {
      if (exceptions[ch]) return exceptions[ch];
      const code = ch.codePointAt(0)!;
      if (code >= 65 && code <= 90) return String.fromCodePoint(alphabet.upper + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(alphabet.lower + code - 97);
      if (code >= 48 && code <= 57 && alphabet.digit) return String.fromCodePoint(alphabet.digit + code - 48);
      return ch;
    })
    .join('');
}

function applyMathVariant(element: Element): void {
  const variant = element.getAttribute('mathvariant');
  if (!variant || variant === 'normal' || !ALPHABETS[variant]) return;
  // Only rewrite leaf token elements; nested markup is left untouched.
  if (element.children.length > 0) return;
  element.textContent = toMathVariant(element.textContent ?? '', variant);
  // The characters now carry the style, so stop single-letter <mi> auto-italics.
  element.setAttribute('mathvariant', 'normal');
}

/** Macron, overline and combining overline: the characters used for segment bars. */
const OVERBARS = new Set(['¯', '‾', '̅']);

function fixOverbar(mover: Element): void {
  const accent = mover.children[1];
  if (accent?.localName !== 'mo' || !OVERBARS.has((accent.textContent ?? '').trim())) return;
  accent.textContent = '‾';
  accent.setAttribute('stretchy', 'true');
  mover.setAttribute('accent', 'true');
}

const FUNCTION_NAMES = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'log', 'ln', 'exp',
]);
/** Elements whose children have fixed roles (base, script, numerator…), where nothing may be inserted. */
const POSITIONAL = new Set(['msup', 'msub', 'msubsup', 'mover', 'munder', 'munderover', 'mfrac', 'mroot', 'mmultiscripts']);

function spaceAfterFunctionName(mi: Element): void {
  if (!FUNCTION_NAMES.has((mi.textContent ?? '').trim())) return;
  // For "sin²x" the space belongs after the whole <msup>, so climb out of script bases.
  let node: Element = mi;
  while (node.parentElement && POSITIONAL.has(node.parentElement.localName)) {
    if (node.parentElement.firstElementChild !== node) return;
    node = node.parentElement;
  }
  const next = node.nextElementSibling;
  // Leave "sin(x)" and explicit operators alone.
  if (!next || next.localName === 'mo' || next.localName === 'mspace') return;
  const space = node.ownerDocument.createElementNS(MATHML_NS, 'mspace');
  space.setAttribute('width', '0.1667em');
  node.after(space);
}

/** Applies all MathML compatibility rewrites inside `root`, in place. */
export function polyfillMathML(root: ParentNode): void {
  // Innermost first, so nested <mfenced> are handled before their parents move.
  const fenced = [...root.querySelectorAll('mfenced')].reverse();
  for (const el of fenced) replaceMfenced(el);
  for (const el of root.querySelectorAll('mi[mathvariant], mn[mathvariant], mtext[mathvariant]')) applyMathVariant(el);
  for (const el of root.querySelectorAll('mover')) fixOverbar(el);
  for (const el of root.querySelectorAll('mi')) spaceAfterFunctionName(el);
}
