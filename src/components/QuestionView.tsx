import type { ReactNode, Ref } from 'react';
import type { Question } from '../data/types';
import { MetaTags } from './MetaTags';
import { RichContent } from './RichContent';

interface QuestionViewProps {
  question: Question;
  /** Heading shown above the question, e.g. "Question 4 of 20". */
  heading: string;
  headingRef?: Ref<HTMLHeadingElement>;
  /** Heading level, so the question fits the page outline (h2 on its own, h3 inside the review list). */
  headingLevel?: 2 | 3;
  /** Answer area (choices or free-response input) and anything after it. */
  children: ReactNode;
}

/**
 * Lays out a question: labels, then the stimulus (passage, table, figure) and
 * the question stem with its answer area. On wide screens a question with a
 * stimulus is shown side by side, like the digital SAT.
 */
export function QuestionView({ question, heading, headingRef, headingLevel = 2, children }: QuestionViewProps) {
  const hasStimulus = question.stimulusHtml !== null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className={`question ${hasStimulus ? 'question--split' : ''} question--${question.meta.subject}`} aria-labelledby={`${question.meta.questionId}-heading`}>
      <header className="question__header">
        <Heading id={`${question.meta.questionId}-heading`} className="question__heading" ref={headingRef} tabIndex={-1}>
          {heading}
        </Heading>
        <MetaTags meta={question.meta} />
      </header>
      <div className="question__body">
        {hasStimulus && (
          <section className="question__stimulus" aria-label="Passage and figures">
            <RichContent html={question.stimulusHtml!} className="rich--passage" />
          </section>
        )}
        <section className="question__prompt" aria-label="Question">
          <RichContent html={question.stemHtml} className="rich--stem" />
          {children}
        </section>
      </div>
    </article>
  );
}
