import { DIFFICULTY_LABELS, SUBJECTS } from '../data/taxonomy';
import type { QuestionMeta } from '../data/types';

/** Subject, domain, skill and difficulty labels for a question. */
export function MetaTags({ meta, compact = false }: { meta: QuestionMeta; compact?: boolean }) {
  return (
    <ul className={compact ? 'meta-tags meta-tags--compact' : 'meta-tags'} aria-label="Question details">
      <li className={`tag tag--subject tag--${meta.subject}`}>
        <span className="visually-hidden">Subject: </span>
        {SUBJECTS[meta.subject].name}
      </li>
      <li className="tag">
        <span className="visually-hidden">Domain: </span>
        {meta.domainName}
      </li>
      <li className="tag tag--skill">
        <span className="visually-hidden">Skill: </span>
        {meta.skillName}
      </li>
      {meta.difficulty && (
        <li className={`tag tag--difficulty tag--difficulty-${meta.difficulty}`}>
          <span className="difficulty-pips" aria-hidden="true">
            {(['E', 'M', 'H'] as const).map((level, i) => (
              <span key={level} className={i <= ['E', 'M', 'H'].indexOf(meta.difficulty!) ? 'pip pip--on' : 'pip'} />
            ))}
          </span>
          <span className="visually-hidden">Difficulty: </span>
          {DIFFICULTY_LABELS[meta.difficulty]}
        </li>
      )}
    </ul>
  );
}
