import type { AnswerChoice, MultipleChoiceQuestion } from '../data/types';
import { displayLetter, isReordered, type SessionItem } from '../data/sampling';
import { CheckIcon, CrossIcon } from './Icons';
import { RichContent } from './RichContent';

function orderedChoices(item: SessionItem): AnswerChoice[] {
  const question = item.question as MultipleChoiceQuestion;
  const byId = new Map(question.choices.map((c) => [c.id, c]));
  return item.choiceOrder.map((id) => byId.get(id)).filter((c): c is AnswerChoice => c !== undefined);
}

type Mark = 'correct' | 'wrong' | 'dimmed' | null;

function ChoiceBody({ letter, choice, mark, showOriginal }: { letter: string; choice: AnswerChoice; mark: Mark; showOriginal: boolean }) {
  return (
    <>
      <span className="choice__letter" aria-hidden="true">
        {mark === 'correct' ? <CheckIcon size={18} /> : mark === 'wrong' ? <CrossIcon size={18} /> : letter}
      </span>
      <span className="visually-hidden">Choice {letter}: </span>
      <RichContent html={choice.html} className="choice__content" as="span" />
      {(mark === 'correct' || mark === 'wrong' || showOriginal) && (
        <span className="choice__status">
          {mark === 'correct' && <span className="choice__badge choice__badge--correct">Correct answer</span>}
          {mark === 'wrong' && <span className="choice__badge choice__badge--wrong">Your answer</span>}
          {showOriginal && <span className="choice__original">Choice {choice.originalLetter} in the explanation</span>}
        </span>
      )}
    </>
  );
}

function markFor(choiceId: string, correctId: string, selectedId: string | null, revealed: boolean): Mark {
  if (!revealed) return null;
  if (choiceId === correctId) return 'correct';
  if (choiceId === selectedId) return 'wrong';
  return 'dimmed';
}

interface PracticeChoicesProps {
  item: SessionItem;
  /** The submitted choice, or null while the question is unanswered. */
  selectedId: string | null;
  onAnswer(choiceId: string): void;
}

/** Endless practice: clicking a choice submits it; choices lock and reveal the key afterwards. */
export function PracticeChoices({ item, selectedId, onAnswer }: PracticeChoicesProps) {
  const question = item.question as MultipleChoiceQuestion;
  const revealed = selectedId !== null;
  const reordered = isReordered(item);
  return (
    <div className="choices choices--practice" role="group" aria-label="Answer choices">
      {orderedChoices(item).map((choice) => {
        const letter = displayLetter(item, choice.id);
        const mark = markFor(choice.id, question.correctChoiceId, selectedId, revealed);
        return (
          <button
            key={choice.id}
            type="button"
            className={`choice choice--button${mark ? ` choice--${mark}` : ''}`}
            onClick={() => onAnswer(choice.id)}
            disabled={revealed}
            aria-keyshortcuts={letter}
          >
            <ChoiceBody letter={letter} choice={choice} mark={mark} showOriginal={revealed && reordered} />
          </button>
        );
      })}
    </div>
  );
}

interface TestChoicesProps {
  item: SessionItem;
  selectedId: string | null;
  onSelect(choiceId: string): void;
}

/** Test mode: a radio group; the selection can be changed freely and nothing is revealed. */
export function TestChoices({ item, selectedId, onSelect }: TestChoicesProps) {
  const name = `answer-${item.question.meta.questionId}`;
  return (
    <fieldset className="choices choices--test">
      <legend className="visually-hidden">Answer choices</legend>
      {orderedChoices(item).map((choice) => {
        const letter = displayLetter(item, choice.id);
        const checked = selectedId === choice.id;
        return (
          <label key={choice.id} className={`choice choice--radio${checked ? ' choice--selected' : ''}`}>
            <input
              type="radio"
              name={name}
              value={choice.id}
              checked={checked}
              onChange={() => onSelect(choice.id)}
              className="choice__input"
            />
            <ChoiceBody letter={letter} choice={choice} mark={null} showOriginal={false} />
          </label>
        );
      })}
    </fieldset>
  );
}

/** Results review: static choices marked with the correct answer and the user's answer. */
export function ReviewChoices({ item, selectedId }: { item: SessionItem; selectedId: string | null }) {
  const question = item.question as MultipleChoiceQuestion;
  const reordered = isReordered(item);
  return (
    <ul className="choices choices--review" aria-label="Answer choices">
      {orderedChoices(item).map((choice) => {
        const letter = displayLetter(item, choice.id);
        const mark = markFor(choice.id, question.correctChoiceId, selectedId, true);
        const isUserCorrect = mark === 'correct' && selectedId === choice.id;
        return (
          <li key={choice.id} className={`choice choice--static choice--${mark}`}>
            <ChoiceBody letter={letter} choice={choice} mark={mark} showOriginal={reordered} />
            {isUserCorrect && <span className="choice__badge choice__badge--yours">Your answer</span>}
          </li>
        );
      })}
    </ul>
  );
}
