import { ApiError } from '../api/qbankClient';
import { QuestionFormatError } from '../data/normalize';
import { TestGenerationError } from '../data/testGenerator';

/** A user-facing explanation of an error, with a hint about what to do next. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'offline':
        return 'You’re offline. Reconnect to the internet, then try again.';
      case 'rate-limited':
        return 'The College Board question bank is limiting requests right now. Wait a moment, then try again.';
      case 'timeout':
        return 'The College Board question bank took too long to respond. Try again.';
      case 'network':
        return 'Couldn’t reach the College Board question bank. Check your connection, then try again.';
      case 'server':
        return `The College Board question bank is having trouble${error.status ? ` (HTTP ${error.status})` : ''}. Try again in a little while.`;
      case 'malformed':
        return 'The question bank sent data in an unexpected format. Try again later; if it keeps happening, the API may have changed.';
      case 'not-found':
        return 'The question bank couldn’t find this question.';
      case 'bad-request':
        return 'The question bank rejected the request. The API may have changed.';
      case 'aborted':
        return 'The request was cancelled.';
    }
  }
  if (error instanceof QuestionFormatError || error instanceof TestGenerationError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}
