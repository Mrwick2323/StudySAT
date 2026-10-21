import { displayLetter, type SessionItem } from '../data/sampling';
import type { UserResponse } from '../data/types';

/** The correct answer as shown to the user, e.g. "C" or "3/17 or .1764". */
export function correctAnswerLabel(item: SessionItem): string {
  const q = item.question;
  return q.kind === 'mcq' ? displayLetter(item, q.correctChoiceId) : q.acceptedAnswers.join(' or ');
}

/** The user's response as shown to them, or null when unanswered. */
export function responseLabel(item: SessionItem, response: UserResponse | null | undefined): string | null {
  if (!response) return null;
  if (response.kind === 'mcq') return response.choiceId ? displayLetter(item, response.choiceId) : null;
  return response.value.trim() || null;
}
