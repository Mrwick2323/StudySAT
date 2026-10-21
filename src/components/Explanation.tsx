import { useMemo } from 'react';
import { extractChoiceRationale } from '../content/rationaleSegments';
import { displayLetter, isReordered, type SessionItem } from '../data/sampling';
import type { MultipleChoiceQuestion, OutcomeStatus, UserResponse } from '../data/types';
import { InfoIcon } from './Icons';
import { RichContent } from './RichContent';

interface ExplanationProps {
  item: SessionItem;
  response: UserResponse | null | undefined;
  status: OutcomeStatus;
}

function SourceNote() {
  return <p className="explanation__source">Explanation from the College Board SAT Suite Question Bank.</p>;
}

function MissingExplanation() {
  return (
    <p className="notice notice--muted">
      <InfoIcon size={18} /> The question bank doesn’t include an explanation for this question, so none is shown.
    </p>
  );
}

function KeyOriginNote({ item }: { item: SessionItem }) {
  if (item.question.answerKeyOrigin !== 'rationale') return null;
  return (
    <p className="explanation__note">
      This older question bank item has no separate answer key; the answer above is the one its explanation states.
    </p>
  );
}

/** The rationale passages about the correct choice and the user's wrong choice (source letters). */
function useChoiceSegments(rationale: string | null, correctLetter: string, chosenLetter: string | null) {
  return useMemo(
    () => ({
      correct: rationale ? extractChoiceRationale(rationale, correctLetter, 'correct') : null,
      chosen: rationale && chosenLetter ? extractChoiceRationale(rationale, chosenLetter, 'incorrect') : null,
    }),
    [rationale, correctLetter, chosenLetter],
  );
}

function MultipleChoiceExplanation({ item, response, status }: ExplanationProps) {
  const question = item.question as MultipleChoiceQuestion;
  const rationale = question.rationaleHtml;
  const correct = question.choices.find((c) => c.id === question.correctChoiceId)!;
  const chosenId = response?.kind === 'mcq' ? response.choiceId : null;
  const chosen = status === 'incorrect' ? question.choices.find((c) => c.id === chosenId) : undefined;
  const reordered = isReordered(item);
  const shownCorrect = displayLetter(item, correct.id);

  const segments = useChoiceSegments(rationale, correct.originalLetter, chosen?.originalLetter ?? null);

  const sourceLetter = (shown: string, original: string) =>
    reordered && shown !== original ? ` (choice ${original} in the explanation)` : '';

  return (
    <div className="explanation">
      {reordered && rationale && (
        <p className="explanation__note">
          Answer choices were shuffled. The explanation refers to the original letters, which are shown on each choice.
        </p>
      )}
      {!rationale && <MissingExplanation />}
      {rationale && segments.correct && (
        <section className="explanation__part explanation__part--correct">
          <h4>
            Why {shownCorrect} is correct{sourceLetter(shownCorrect, correct.originalLetter)}
          </h4>
          <RichContent html={segments.correct} />
        </section>
      )}
      {rationale && chosen && segments.chosen && (
        <section className="explanation__part explanation__part--wrong">
          <h4>
            Why your answer, {displayLetter(item, chosen.id)}, is incorrect
            {sourceLetter(displayLetter(item, chosen.id), chosen.originalLetter)}
          </h4>
          <RichContent html={segments.chosen} />
        </section>
      )}
      {rationale && !segments.correct && (
        <section className="explanation__part">
          <h4>Why {shownCorrect} is correct</h4>
          <RichContent html={rationale} />
        </section>
      )}
      {rationale && segments.correct && (
        <details className="explanation__full">
          <summary>Full explanation, including every choice</summary>
          <RichContent html={rationale} />
        </details>
      )}
      <KeyOriginNote item={item} />
      {rationale && <SourceNote />}
    </div>
  );
}

function FreeResponseExplanation({ item, response, status }: ExplanationProps) {
  const question = item.question;
  if (question.kind !== 'spr') return null;
  const entered = response?.kind === 'spr' ? response.value.trim() : '';
  return (
    <div className="explanation">
      <dl className="explanation__answers">
        <div>
          <dt>Accepted answers</dt>
          <dd>
            {question.acceptedAnswers.map((a, i) => (
              <span key={a}>
                {i > 0 && ', '}
                <code>{a}</code>
              </span>
            ))}
          </dd>
        </div>
        {status === 'incorrect' && (
          <div>
            <dt>You entered</dt>
            <dd>
              <code>{entered}</code>
            </dd>
          </div>
        )}
      </dl>
      <p className="explanation__note">Equivalent forms of an accepted answer (for example 2/4 for 1/2) also count as correct.</p>
      <KeyOriginNote item={item} />
      {question.rationaleHtml ? (
        <section className="explanation__part">
          <h4>Worked solution</h4>
          <RichContent html={question.rationaleHtml} />
          <SourceNote />
        </section>
      ) : (
        <MissingExplanation />
      )}
    </div>
  );
}

/** Source-provided explanation for an answered (or reviewed) question. */
export function Explanation(props: ExplanationProps) {
  return props.item.question.kind === 'mcq' ? <MultipleChoiceExplanation {...props} /> : <FreeResponseExplanation {...props} />;
}

