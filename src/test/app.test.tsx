import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { metaFor } from './fixtures';
import { createFakeRepository } from './fakeRepository';

beforeEach(() => {
  window.location.hash = '';
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

function renderAt(hash: string, repository = createFakeRepository()) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App repository={repository} />);
  return { user, repository };
}

/** The start button in the selection summary (a duplicate lives in the mobile start bar). */
function startButton(name: RegExp) {
  return within(screen.getByRole('complementary', { name: 'Your selection' })).getByRole('button', { name });
}

/** Waits for the eligible count, then turns off subjects the test doesn't use. */
async function waitForCount(count: number, user: ReturnType<typeof userEvent.setup>, turnOff: string[] = []) {
  await waitFor(() => expect(screen.getByText(String(count), { selector: '.summary-card__count strong' })).toBeInTheDocument());
  for (const subject of turnOff) await user.click(screen.getByRole('checkbox', { name: new RegExp(`SAT ${subject}`) }));
}

async function waitForSetup() {
  await waitFor(() => expect(screen.getByText('6', { selector: '.summary-card__count strong' })).toBeInTheDocument());
}

describe('setup', () => {
  it('shows domains and skills from the question data, grouped by subject', async () => {
    const { user } = renderAt('#/practice/setup');
    await waitForSetup();
    const rw = screen.getByRole('region', { name: 'Reading and Writing' });
    expect(within(rw).getByText('Information and Ideas')).toBeInTheDocument();
    expect(within(rw).getByText('Craft and Structure')).toBeInTheDocument();
    await user.click(within(rw).getByRole('button', { name: /show skills in information and ideas/i }));
    expect(within(rw).getByLabelText(/Central Ideas and Details/)).toBeChecked();
    expect(within(rw).getByLabelText(/Inferences/)).toBeChecked();
    const math = screen.getByRole('region', { name: 'Math' });
    expect(within(math).getByText('Algebra')).toBeInTheDocument();
  });

  it('updates the eligible count as skills and difficulties change', async () => {
    const { user } = renderAt('#/practice/setup');
    await waitForSetup();
    await user.click(screen.getByLabelText(/^Information and Ideas/));
    expect(screen.getByText('3', { selector: '.summary-card__count strong' })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/^Easy/));
    expect(screen.getByText('1', { selector: '.summary-card__count strong' })).toBeInTheDocument();
  });

  it('explains when a test would be larger than the pool and blocks starting it', async () => {
    const { user } = renderAt('#/test/setup');
    await waitForSetup();
    const length = screen.getByLabelText('Number of questions');
    await user.clear(length);
    await user.type(length, '9');
    expect(screen.getByRole('alert')).toHaveTextContent('Only 6 questions match your selection.');
    expect(startButton(/start 9-question test/i)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Use 6' }));
    expect(length).toHaveValue(6);
  });

  it('explains a subject with no questions instead of silently dropping it', async () => {
    renderAt('#/practice/setup', createFakeRepository({ questions: { math: [] } }));
    expect(await screen.findByText(/returned no Math questions/)).toBeInTheDocument();
    expect(startButton(/start practicing/i)).toBeDisabled();
  });

  it('blocks starting with nothing selected', async () => {
    const { user } = renderAt('#/practice/setup');
    await waitForSetup();
    await user.click(screen.getByRole('button', { name: 'Clear selections' }));
    expect(screen.getByText('Choose at least one subject.')).toBeInTheDocument();
    expect(startButton(/start practicing/i)).toBeDisabled();
  });
});

describe('endless practice', () => {
  it('runs a full session: answer, feedback, next, end, summary', async () => {
    const { user } = renderAt('#/practice/setup', createFakeRepository({ questions: { math: [] } }));
    await waitForCount(4, user, ['Math']);
    await user.click(startButton(/start practicing/i));

    // Question 1: answer correctly (fixtures make choice B correct).
    await screen.findByRole('heading', { name: 'Question 1' });
    await user.click(screen.getByRole('button', { name: /Choice B/ }));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Question 1' })).toBeInTheDocument();
    // Choices are locked after answering.
    for (const button of screen.getAllByRole('button', { name: /^Choice [A-D]/ })) expect(button).toBeDisabled();
    expect(screen.getByRole('heading', { name: /Why B is correct/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next question/i }));

    // Question 2: answer incorrectly with the keyboard shortcut.
    await screen.findByRole('heading', { name: 'Question 2' });
    await user.keyboard('a');
    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText('The correct answer is B.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Why your answer, A, is incorrect/ })).toBeInTheDocument();
    await user.keyboard('n');

    // Question 3 is on screen but unanswered when the session ends.
    await screen.findByRole('heading', { name: 'Question 3' });
    await user.click(screen.getByRole('button', { name: 'End session' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('won’t be counted');
    await user.click(within(dialog).getByRole('button', { name: /end and see summary/i }));

    await screen.findByRole('heading', { name: 'Session summary' });
    const hero = screen.getByRole('region', { name: 'Score' });
    expect(within(hero).getByText('50%')).toBeInTheDocument();
    expect(within(hero).getByText('Answered').nextSibling).toHaveTextContent('2');
  });

  it('grades free-response answers and rejects entries that cannot be graded', async () => {
    const repository = createFakeRepository({ questions: { rw: [], math: [metaFor('H.A.', 'E', 'only')] } });
    const { user } = renderAt('#/practice/setup', repository);
    await waitForCount(1, user, ['Reading and Writing']);
    await user.click(startButton(/start practicing/i));
    const input = await screen.findByLabelText('Your answer');
    await user.type(input, '3 1/2{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Mixed numbers');
    await user.clear(input);
    await user.type(input, '36/3{Enter}');
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next question/i }));
    expect(await screen.findByText('You’ve seen every matching question')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reshuffle/i })).toBeInTheDocument();
  });

  it('skips questions with unusable data and never loads forever when none are usable', async () => {
    const repository = createFakeRepository({
      questions: { rw: [metaFor('CID', 'E', 'bad-1'), metaFor('CID', 'E', 'bad-2')], math: [] },
      broken: ['bad-1', 'bad-2'],
    });
    const { user } = renderAt('#/practice/setup', repository);
    await waitForCount(2, user, ['Math']);
    await user.click(startButton(/start practicing/i));
    expect(await screen.findByText('No usable questions')).toBeInTheDocument();
    expect(screen.getByText(/2 questions were skipped/)).toBeInTheDocument();
  });
});

describe('custom test', () => {
  it('takes a test one question at a time, keeps answers, confirms, and grades', async () => {
    const { user } = renderAt('#/test/setup', createFakeRepository({ questions: { math: [] } }));
    await waitForCount(4, user, ['Math']);
    const length = screen.getByLabelText('Number of questions');
    await user.clear(length);
    await user.type(length, '3');
    await user.click(startButton(/start 3-question test/i));

    await screen.findByRole('heading', { name: 'Question 1 of 3' });
    // Select A, change to B (correct). No feedback is shown during the test.
    await user.click(screen.getByRole('radio', { name: /Choice A/ }));
    await user.click(screen.getByRole('radio', { name: /Choice B/ }));
    expect(screen.queryByText('Correct!')).not.toBeInTheDocument();
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Next/ }));

    await screen.findByRole('heading', { name: 'Question 2 of 3' });
    await user.click(screen.getByRole('radio', { name: /Choice C/ }));
    await user.click(screen.getByRole('button', { name: /Previous/ }));
    await screen.findByRole('heading', { name: 'Question 1 of 3' });
    expect(screen.getByRole('radio', { name: /Choice B/ })).toBeChecked();

    // Jump to the last question with the navigator and submit with one unanswered.
    await user.click(screen.getByRole('button', { name: /all questions/i }));
    await user.click(screen.getByRole('button', { name: 'Question 3, unanswered' }));
    await screen.findByRole('heading', { name: 'Question 3 of 3' });
    await user.click(screen.getByRole('button', { name: 'Submit test' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Unanswered: 3.');
    await user.click(within(dialog).getByRole('button', { name: 'Submit anyway' }));

    await screen.findByRole('heading', { name: 'Your results' });
    expect(screen.getByText(/of 3 correct/).parentElement).toHaveTextContent('1 of 3 correct');
    const filters = screen.getByRole('group', { name: 'Show questions' });
    await user.click(within(filters).getByRole('button', { name: /Unanswered/ }));
    const list = screen.getByRole('list', { name: 'Question review' });
    expect(within(list).getAllByText('Not answered')).toHaveLength(1);
    await user.click(within(filters).getByRole('button', { name: /Incorrect/ }));
    const incorrect = within(screen.getByRole('list', { name: 'Question review' })).getAllByRole('listitem', { name: '' });
    expect(incorrect.filter((li) => li.classList.contains('review-item'))).toHaveLength(1);
    expect(screen.getByText('Your answer', { selector: 'dt' }).nextSibling).toHaveTextContent('C');
    expect(screen.getByText('Correct answer', { selector: 'dt' }).nextSibling).toHaveTextContent('B');
    await user.click(screen.getByRole('button', { name: /show explanation/i }));
    expect(screen.getByRole('heading', { name: 'Why B is correct' })).toBeInTheDocument();
    // The fixture rationale says nothing about choice C, so no "why yours is wrong" excerpt is invented.
    expect(screen.queryByRole('heading', { name: /Why your answer/ })).not.toBeInTheDocument();
  });

  it('replaces unusable questions from the same pool when generating', async () => {
    const repository = createFakeRepository({
      questions: { rw: [metaFor('CID', 'E', 'ok-1'), metaFor('CID', 'E', 'bad'), metaFor('CID', 'E', 'ok-2')], math: [] },
      broken: ['bad'],
    });
    const { user } = renderAt('#/test/setup', repository);
    await waitForCount(3, user, ['Math']);
    const length = screen.getByLabelText('Number of questions');
    await user.clear(length);
    await user.type(length, '3');
    await user.click(startButton(/start 3-question test/i));
    // Only two usable questions exist: the app offers a shorter test instead of padding it.
    expect(await screen.findByText('Not enough questions for this test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start a 2-question test/i }));
    expect(await screen.findByRole('heading', { name: 'Question 1 of 2' })).toBeInTheDocument();
  });
});
