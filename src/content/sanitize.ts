import DOMPurify from 'dompurify';
import { polyfillMathML } from './mathml';

/**
 * Prepares third-party question HTML for display.
 *
 * Question bank content mixes HTML, inline SVG (graphs, figures) and MathML.
 * It is sanitized with DOMPurify, then adjusted so that several questions can
 * be shown on one page (results review) without interfering with each other:
 *  - element ids and every reference to them (url(#id), href="#id", aria-*)
 *    are prefixed with a per-render scope;
 *  - `<style>` blocks inside figures are rewritten to apply only to their own
 *    figure (matplotlib graphs ship `*{stroke-linecap:butt}`-style rules);
 *  - tables are wrapped so they scroll horizontally on small screens;
 *  - MathML is polyfilled for browsers that implement MathML Core.
 */

const ID_REFERENCE_ATTRIBUTES = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'for'];
const URL_REFERENCE_ATTRIBUTES = [
  'clip-path', 'mask', 'filter', 'fill', 'stroke', 'marker-start', 'marker-mid', 'marker-end', 'style',
];

let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const instance = DOMPurify(window);
  instance.addHook('uponSanitizeAttribute', (node, data) => {
    const name = data.attrName;
    if (name === 'href' || name === 'xlink:href') {
      const value = data.attrValue.trim();
      const isFragment = value.startsWith('#');
      const isExternalLink = node.nodeName.toLowerCase() === 'a' && /^https:\/\//i.test(value);
      if (!isFragment && !isExternalLink) data.keepAttr = false;
    }
  });
  instance.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName.toLowerCase() === 'a' && node.getAttribute('href')?.startsWith('https://')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  purifier = instance;
  return instance;
}

function sanitizeToFragment(html: string): DocumentFragment {
  return getPurifier().sanitize(html, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    // <use> draws matplotlib markers; its href is restricted to "#fragment" by the hook above.
    ADD_TAGS: ['use'],
    ADD_ATTR: ['xlink:href', 'alttext', 'mathvariant', 'displaystyle', 'open', 'close', 'separators', 'scope', 'aria-level'],
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
    RETURN_DOM_FRAGMENT: true,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** At-rules (imports, media queries), legacy expressions and non-fragment urls. */
const UNSAFE_CSS = /@|expression\s*\(|url\s*\(\s*['"]?(?!#)/i;

/** Prefixes CSS selectors so rules apply only inside `#scope`; drops anything in UNSAFE_CSS. */
export function scopeCss(css: string, scope: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .filter((block) => block.includes('{') && !UNSAFE_CSS.test(block))
    .map((block) => scopeRule(`${block}}`, scope))
    .filter(Boolean)
    .join('\n');
}

function scopeRule(rule: string, scope: string): string {
  const open = rule.indexOf('{');
  const selectors = rule
    .slice(0, open)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `#${scope} ${s}`)
    .join(', ');
  return selectors ? `${selectors} ${rule.slice(open)}` : '';
}

function scopeIds(root: DocumentFragment, scope: string): void {
  const ids = new Map<string, string>();
  for (const el of root.querySelectorAll('[id]')) {
    const id = el.getAttribute('id')!;
    const scoped = `${scope}-${id}`;
    ids.set(id, scoped);
    el.setAttribute('id', scoped);
  }
  if (ids.size === 0) return;

  const replaceUrlRefs = (value: string) =>
    value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (match, quote: string, id: string) =>
      ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : match,
    );

  for (const el of root.querySelectorAll('*')) {
    for (const attr of ['href', 'xlink:href']) {
      const value = el.getAttribute(attr);
      if (value?.startsWith('#') && ids.has(value.slice(1))) el.setAttribute(attr, `#${ids.get(value.slice(1))}`);
    }
    for (const attr of ID_REFERENCE_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, value.split(/\s+/).map((id) => ids.get(id) ?? id).join(' '));
    }
    for (const attr of URL_REFERENCE_ATTRIBUTES) {
      const value = el.getAttribute(attr);
      if (value?.includes('url(')) el.setAttribute(attr, replaceUrlRefs(value));
    }
  }
  for (const style of root.querySelectorAll('style')) {
    let css = replaceUrlRefs(style.textContent ?? '');
    for (const [id, scoped] of ids) css = css.replace(new RegExp(`#${escapeRegExp(id)}(?![\\w-])`, 'g'), `#${scoped}`);
    style.textContent = css;
  }
}

function scopeStyles(root: DocumentFragment, scope: string): void {
  let counter = 0;
  for (const style of root.querySelectorAll('style')) {
    // Scope to the nearest figure; otherwise to the content block itself.
    const host = style.closest('svg') ?? null;
    let hostId = scope;
    if (host) {
      if (!host.id) host.id = `${scope}-figure-${counter++}`;
      hostId = host.id;
    }
    style.textContent = scopeCss(style.textContent ?? '', hostId);
  }
}

function wrapTables(root: DocumentFragment): void {
  for (const table of root.querySelectorAll('table')) {
    if (table.parentElement?.classList.contains('table-scroll')) continue;
    const wrapper = table.ownerDocument.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Table (scrollable)');
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}

function fixImages(root: DocumentFragment): void {
  for (const img of root.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
    img.setAttribute('decoding', 'async');
    // Legacy math images are aligned with the deprecated align attribute.
    img.removeAttribute('align');
  }
}

/**
 * Sanitizes and prepares question HTML. `scope` must be unique among the
 * content blocks on the page and contain only letters, digits and dashes;
 * the content's root element should be rendered with `id={scope}`.
 */
export function prepareQuestionHtml(html: string, scope: string): string {
  const fragment = sanitizeToFragment(html);
  polyfillMathML(fragment);
  scopeIds(fragment, scope);
  scopeStyles(fragment, scope);
  wrapTables(fragment);
  fixImages(fragment);
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}
