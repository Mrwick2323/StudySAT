import { describe, expect, it } from 'vitest';
import { polyfillMathML, toMathVariant } from './mathml';
import { extractChoiceRationale } from './rationaleSegments';
import { prepareQuestionHtml, scopeCss } from './sanitize';

function render(html: string, scope = 'scope1'): HTMLElement {
  const div = document.createElement('div');
  div.id = scope;
  div.innerHTML = prepareQuestionHtml(html, scope);
  return div;
}

describe('prepareQuestionHtml', () => {
  it('removes scripts, event handlers and javascript: urls', () => {
    const el = render(
      '<p onclick="alert(1)">Hi<script>alert(2)</script><img src="x" onerror="alert(3)"><a href="javascript:alert(4)">x</a></p>',
    );
    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).not.toMatch(/onclick|onerror|javascript:/);
  });

  it('keeps MathML, SVG, tables and data-URI images', () => {
    const el = render(
      '<p><math alttext="x"><mi>x</mi></math></p><svg viewBox="0 0 1 1" role="img" aria-label="graph"><line x1="0" y1="0" x2="1" y2="1"/></svg>' +
        '<table><tbody><tr><th scope="col">a</th></tr></tbody></table><img alt="math" src="data:image/png;base64,AAAA">',
    );
    expect(el.querySelector('math mi')?.textContent).toBe('x');
    expect(el.querySelector('svg line')).not.toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png/);
    expect(el.querySelector('.table-scroll > table')).not.toBeNull();
  });

  it('only allows <use> to reference fragments inside the figure', () => {
    const el = render('<svg><defs><path id="m1" d="M0 0"/></defs><use xlink:href="#m1"/><use href="https://evil.example/x.svg#a"/></svg>');
    const uses = el.querySelectorAll('use');
    expect(uses[0]?.getAttribute('xlink:href')).toBe('#scope1-m1');
    expect(uses[1]?.getAttribute('href')).toBeNull();
  });

  it('scopes ids and every reference to them', () => {
    const el = render(
      '<svg><clipPath id="clip"><rect/></clipPath><g clip-path="url(#clip)"></g><path style="clip-path:url(#clip)"/></svg>',
      'q7',
    );
    expect(el.querySelector('clipPath')?.id).toBe('q7-clip');
    expect(el.querySelector('g')?.getAttribute('clip-path')).toBe('url(#q7-clip)');
    expect(el.querySelector('path')?.getAttribute('style')).toContain('url(#q7-clip)');
  });

  it('confines figure stylesheets to their own figure', () => {
    const el = render('<svg><defs><style type="text/css">*{stroke-linecap:butt;}</style></defs></svg>', 'q9');
    const svg = el.querySelector('svg')!;
    expect(svg.id).toMatch(/^q9-figure-/);
    expect(el.querySelector('style')?.textContent).toBe(`#${svg.id} * {stroke-linecap:butt;}`);
  });

  it('rewrites deprecated <mfenced> into explicit fences', () => {
    const el = render('<math><mfenced><mi>a</mi><mi>b</mi></mfenced></math>');
    expect(el.querySelector('mfenced')).toBeNull();
    const mos = [...el.querySelectorAll('mo')].map((mo) => mo.textContent);
    expect(mos).toEqual(['(', ',', ')']);
  });
});

describe('scopeCss', () => {
  it('prefixes every selector and drops at-rules and external urls', () => {
    expect(scopeCss('.a, .b{fill:red}', 's')).toBe('#s .a, #s .b {fill:red}');
    expect(scopeCss('@import url(http://x);.a{fill:red}', 's')).toBe('');
    expect(scopeCss('.a{background:url(https://x/y.png)} .b{fill:blue}', 's')).toBe('#s .b {fill:blue}');
  });
});

describe('MathML polyfill', () => {
  it('handles custom fences and separators', () => {
    const div = document.createElement('div');
    div.innerHTML = '<math><mfenced open="[" close="]" separators=";"><mn>1</mn><mn>2</mn><mn>3</mn></mfenced></math>';
    polyfillMathML(div);
    expect([...div.querySelectorAll('mo')].map((m) => m.textContent)).toEqual(['[', ';', ';', ']']);
  });

  it('maps mathvariant letters to Unicode math alphabets', () => {
    expect(toMathVariant('l', 'script')).toBe('\u{1d4c1}');
    expect(toMathVariant('R', 'double-struck')).toBe('ℝ');
    expect(toMathVariant('x', 'bold')).toBe('\u{1d431}');
    expect(toMathVariant('x', 'unknown')).toBe('x');
    const div = document.createElement('div');
    div.innerHTML = '<math><mi mathvariant="script">l</mi></math>';
    polyfillMathML(div);
    expect(div.querySelector('mi')?.textContent).toBe('\u{1d4c1}');
    expect(div.querySelector('mi')?.getAttribute('mathvariant')).toBe('normal');
  });
});

describe('MathML typography fixes', () => {
  function polyfilled(html: string): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = html;
    polyfillMathML(div);
    return div;
  }

  it('turns a macron over a segment name into a stretchy overline accent', () => {
    const div = polyfilled('<math><mover><mrow><mi>Q</mi><mi>S</mi></mrow><mo>&macr;</mo></mover></math>');
    const mo = div.querySelector('mover > mo')!;
    expect(mo.getAttribute('stretchy')).toBe('true');
    expect(mo.textContent).toBe(String.fromCharCode(0x203e));
    expect(div.querySelector('mover')!.getAttribute('accent')).toBe('true');
  });

  it('leaves other over-scripts alone', () => {
    const div = polyfilled('<math><mover><mi>x</mi><mo>^</mo></mover></math>');
    expect(div.querySelector('mover > mo')!.textContent).toBe('^');
  });

  it('adds a thin space between a function name and its argument', () => {
    const div = polyfilled('<math><mn>25</mn><mi>cos</mi><mi>Q</mi></math>');
    expect([...div.querySelector('math')!.children].map((c) => c.localName)).toEqual(['mn', 'mi', 'mspace', 'mi']);
  });

  it('puts the space after a power of a function, and not before parentheses', () => {
    const squared = polyfilled('<math><msup><mi>sin</mi><mn>2</mn></msup><mi>x</mi></math>');
    expect([...squared.querySelector('math')!.children].map((c) => c.localName)).toEqual(['msup', 'mspace', 'mi']);
    expect(squared.querySelector('msup')!.children).toHaveLength(2);
    const paren = polyfilled('<math><mi>sin</mi><mo>(</mo><mi>x</mi><mo>)</mo></math>');
    expect(paren.querySelector('mspace')).toBeNull();
  });
});

describe('extractChoiceRationale', () => {
  const rationale =
    '<p>Choice C is the best answer. The text says <em>so</em>.</p>' +
    '<p>Choice A is incorrect. It is unrelated. Choice B is incorrect. It has <math><mi>x</mi></math> wrong. Choice D is incorrect. Too broad.</p>';

  it('extracts the passage about the correct choice', () => {
    const html = extractChoiceRationale(rationale, 'C', 'correct')!;
    expect(html).toContain('Choice C is the best answer');
    expect(html).toContain('<em>so</em>');
    expect(html).not.toContain('Choice A');
  });

  it('extracts the passage about a specific wrong choice, keeping its markup', () => {
    const html = extractChoiceRationale(rationale, 'B', 'incorrect')!;
    expect(html).toContain('Choice B is incorrect');
    expect(html).toContain('<mi>x</mi>');
    expect(html).not.toContain('Choice D');
    expect(html).not.toContain('Choice A');
  });

  it('handles statements that cover several choices', () => {
    const html = extractChoiceRationale('<p>Choice D is correct. Five.</p><p>Choices A, B, and C are incorrect and may result from errors.</p>', 'B', 'incorrect');
    expect(html).toContain('Choices A, B, and C are incorrect');
  });

  it('returns null when the rationale does not discuss the choice', () => {
    expect(extractChoiceRationale('<p>The correct answer is 12.</p>', 'A', 'incorrect')).toBeNull();
    expect(extractChoiceRationale(rationale, 'C', 'incorrect')).toBeNull();
  });
});
