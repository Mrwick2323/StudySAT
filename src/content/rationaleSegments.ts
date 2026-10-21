/**
 * Finds the part of a source rationale that discusses a particular choice.
 *
 * College Board rationales are written as a sequence of statements such as
 * "Choice C is the best answer. ..." followed by "Choice A is incorrect. ..."
 * or "Choices A, B, and D are incorrect ...". This module locates those
 * markers in the rendered text and copies the markup between one marker and
 * the next, so the excerpt keeps its math and formatting. Nothing is
 * generated: if no marker for a choice exists, the caller gets null and shows
 * the full rationale instead.
 */

export type ChoiceVerdict = 'correct' | 'incorrect';

interface Marker {
  index: number;
  letters: string[];
  verdict: ChoiceVerdict;
}

const MARKER =
  /\b[Cc]hoices?\s+([A-D](?:(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+)[A-D])*)\s+(?:is|are)\s+(?:the\s+)?(incorrect|correct|best)\b/g;

interface TextIndex {
  text: string;
  nodes: Array<{ node: Text; start: number }>;
}

function indexText(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: TextIndex['nodes'] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += node.nodeValue ?? '';
  }
  return { text, nodes };
}

function locate(index: TextIndex, position: number): { node: Text; offset: number } | null {
  for (let i = index.nodes.length - 1; i >= 0; i--) {
    const entry = index.nodes[i]!;
    if (entry.start <= position) {
      return { node: entry.node, offset: Math.min(position - entry.start, entry.node.length) };
    }
  }
  return null;
}

function findMarkers(text: string): Marker[] {
  const markers: Marker[] = [];
  for (const match of text.matchAll(MARKER)) {
    markers.push({
      index: match.index,
      letters: match[1]!.match(/[A-D]/g) ?? [],
      verdict: match[2] === 'incorrect' ? 'incorrect' : 'correct',
    });
  }
  return markers;
}

/**
 * Returns the HTML of the rationale passage about `letter` (the choice's
 * letter in the source's original order) with the given verdict, or null.
 */
export function extractChoiceRationale(rationaleHtml: string, letter: string, verdict: ChoiceVerdict): string | null {
  const template = document.createElement('template');
  template.innerHTML = rationaleHtml;
  const root = template.content;
  const index = indexText(root);
  const markers = findMarkers(index.text);
  const target = markers.findIndex((m) => m.verdict === verdict && m.letters.includes(letter));
  if (target === -1) return null;

  const start = locate(index, markers[target]!.index);
  const endPosition = markers[target + 1]?.index ?? index.text.length;
  const end = locate(index, endPosition);
  if (!start || !end) return null;

  const range = root.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const container = root.ownerDocument.createElement('div');
  container.append(range.cloneContents());
  const html = container.innerHTML.trim();
  return container.textContent?.trim() ? html : null;
}
