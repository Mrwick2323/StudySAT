import { useId, useMemo, type ElementType } from 'react';
import { prepareQuestionHtml } from '../content/sanitize';

interface RichContentProps {
  html: string;
  className?: string;
  as?: ElementType;
}

/**
 * Renders question-bank HTML (text, MathML, SVG figures, tables) after
 * sanitizing it and scoping its ids and styles to this block.
 */
export function RichContent({ html, className, as: Tag = 'div' }: RichContentProps) {
  const reactId = useId();
  const scope = `rc-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const prepared = useMemo(() => prepareQuestionHtml(html, scope), [html, scope]);
  return <Tag id={scope} className={className ? `rich ${className}` : 'rich'} dangerouslySetInnerHTML={{ __html: prepared }} />;
}
