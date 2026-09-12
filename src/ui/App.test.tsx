import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as learning from '../application/learning-session/session';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function start(reasoning?: string) {
  render(<App />);
  fireEvent.click(screen.getByRole('radio', { name: "I'm not sure" }));
  if (reasoning)
    fireEvent.change(
      screen.getByLabelText('Optional: What makes you think so?'),
      { target: { value: reasoning } },
    );
  fireEvent.click(screen.getByRole('button', { name: 'Start exploration' }));
}
function run(id: 'A' | 'B') {
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`Run Thread ${id} next:`) }),
  );
}
function back() {
  fireEvent.click(
    screen.getByRole('button', { name: 'Go back one execution step' }),
  );
}
function history() {
  return within(screen.getByRole('region', { name: 'Execution history' }));
}
function thread(id: 'A' | 'B') {
  return within(screen.getByRole('region', { name: `Thread ${id}` }));
}
function shared() {
  return within(screen.getByRole('region', { name: 'Current shared state' }));
}

describe('prediction', () => {
  it('shows the frozen prompt and three named native options, requiring a choice', () => {
    render(<App />);
    expect(
      screen.getByRole('group', {
        name: 'One seat is left. Thread A and Thread B both try to reserve it. Could both reservations succeed?',
      }),
    ).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    for (const name of ['No', 'Yes', "I'm not sure"])
      expect(screen.getByRole('radio', { name })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Start exploration' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start exploration' }));
    expect(
      screen.queryByRole('heading', { name: 'Unsafe exploration' }),
    ).not.toBeInTheDocument();
  });
  it('keeps the draft local and commits optional reasoning only on start', () => {
    const reduce = vi.spyOn(learning, 'reduceLearningSession');
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    fireEvent.change(
      screen.getByLabelText('Optional: What makes you think so?'),
      { target: { value: 'They may both see one.' } },
    );
    expect(reduce).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start exploration' }));
    expect(reduce).toHaveBeenCalledTimes(1);
    expect(reduce.mock.calls[0][1]).toEqual({
      type: 'SUBMIT_PREDICTION',
      prediction: { choice: 'YES', reasoning: 'They may both see one.' },
    });
    expect(
      screen.getByRole('region', { name: 'Your prediction' }),
    ).toHaveTextContent('YesThey may both see one.');
  });
  it('starts without reasoning and shows both derived CHECK controls at cursor zero', () => {
    start();
    for (const id of ['A', 'B'] as const) {
      expect(
        screen.getByRole('button', { name: `Run Thread ${id} next: CHECK` }),
      ).toHaveAttribute('aria-disabled', 'false');
      expect(thread(id).getByText('No check yet')).toBeVisible();
    }
    expect(
      screen.getByRole('button', { name: 'Go back one execution step' }),
    ).toBeDisabled();
    expect(history().getByText('Initial state · Current')).toBeVisible();
  });
  it('preserves prediction and reasoning across schedule, Back, alternate choice and Reset', () => {
    start('My initial thought.');
    run('A');
    run('B');
    back();
    run('A');
    expect(
      screen.getByRole('region', { name: 'Your prediction' }),
    ).toHaveTextContent("I'm not sureMy initial thought.");
    fireEvent.click(screen.getByRole('button', { name: 'Reset run' }));
    expect(
      screen.getByRole('region', { name: 'Your prediction' }),
    ).toHaveTextContent("I'm not sureMy initial thought.");
    expect(history().queryAllByRole('listitem')).toHaveLength(0);
    expect(history().getByText('Initial state · Current')).toBeVisible();
    expect(shared().getByText('1', { exact: true })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Start exploration' }),
    ).not.toBeInTheDocument();
  });
});

describe('unsafe exploration', () => {
  it('dispatches exactly one thread-only scheduling action per activation', () => {
    const reduce = vi.spyOn(learning, 'reduceLearningSession');
    start();
    reduce.mockClear();
    run('A');
    expect(reduce).toHaveBeenCalledTimes(1);
    expect(reduce.mock.calls[0][1]).toEqual({
      type: 'SCHEDULE_THREAD',
      threadId: 'A',
    });
    expect(history().getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Run Thread A next: COMMIT' }),
    ).toBeVisible();
    run('B');
    expect(reduce).toHaveBeenCalledTimes(2);
    expect(reduce.mock.calls[1][1]).toEqual({
      type: 'SCHEDULE_THREAD',
      threadId: 'B',
    });
    expect(history().getAllByRole('listitem')).toHaveLength(2);
  });
  it('preserves the stale observation after A CHECK, B CHECK, A COMMIT', () => {
    start();
    run('A');
    run('B');
    expect(
      shared().getByRole('heading', { name: 'Invariant holds' }),
    ).toBeVisible();
    expect(shared().getByText('0 successful reservations')).toBeVisible();
    run('A');
    expect(shared().getByText('0', { exact: true })).toBeVisible();
    expect(thread('B').getByText('Earlier check')).toBeVisible();
    expect(thread('B').getByText('1 seat', { exact: true })).toBeVisible();
    expect(thread('B').getByText('Check result: passed')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Run Thread B next: COMMIT' }),
    ).toBeVisible();
    expect(
      shared().getByRole('heading', { name: 'Invariant holds' }),
    ).toBeVisible();
  });
  it('renders real A-B-A-B violation with negative shared seats and stays in the lab', () => {
    start();
    run('A');
    run('B');
    run('A');
    run('B');
    expect(shared().getByText('-1', { exact: true })).toBeVisible();
    expect(
      shared().getByRole('heading', { name: 'Invariant violated' }),
    ).toBeVisible();
    expect(shared().getByText('2 successful reservations')).toBeVisible();
    expect(shared().getByText('1 original seat')).toBeVisible();
    for (const id of ['A', 'B'] as const) {
      expect(thread(id).getByText('Finished', { exact: true })).toBeVisible();
      expect(thread(id).getByText('successful', { exact: true })).toBeVisible();
      expect(thread(id).getByText('1 seat', { exact: true })).toBeVisible();
    }
    expect(
      screen.getByRole('heading', { name: 'Unsafe exploration' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Compare|Continue|Start Over/i }),
    ).not.toBeInTheDocument();
  });
  it('renders safe A-A-B completion with B failed observation of zero', () => {
    start();
    run('A');
    run('A');
    run('B');
    expect(
      shared().getByRole('heading', { name: 'Invariant holds' }),
    ).toBeVisible();
    expect(shared().getByText('1 successful reservation')).toBeVisible();
    expect(thread('B').getByText('0 seats', { exact: true })).toBeVisible();
    expect(thread('B').getByText('Check result: failed')).toBeVisible();
    expect(thread('B').getByText('none', { exact: true })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /Run Thread/ }),
    ).not.toBeInTheDocument();
  });
  it('renders CHECK and COMMIT facts in the Last step region', () => {
    start();
    run('A');
    const last = within(screen.getByRole('region', { name: 'Last step' }));
    expect(
      last.getByText(
        'Thread A performed CHECK. Observed 1 seat; check passed. Shared seats unchanged at 1.',
      ),
    ).toBeVisible();
    run('A');
    expect(
      last.getByText(
        'Thread A performed COMMIT. Seats remaining: 1 → 0. Thread A reserved a seat.',
      ),
    ).toBeVisible();
  });
});

describe('history and accessibility', () => {
  it('rewinds one operation, retains future, and reuses same-choice continuation', () => {
    start();
    run('A');
    run('B');
    run('A');
    run('B');
    back();
    back();
    expect(history().getAllByRole('listitem')).toHaveLength(4);
    expect(history().getAllByText('Previous future')).toHaveLength(2);
    expect(
      history().getByText('Applied · Current').closest('li'),
    ).toHaveTextContent('Thread B — CHECK');
    expect(shared().getByText('1', { exact: true })).toBeVisible();
    run('A');
    expect(history().getAllByRole('listitem')).toHaveLength(4);
    expect(history().getAllByText('Previous future')).toHaveLength(1);
    expect(screen.getByRole('status')).not.toHaveTextContent('replaced');
    expect(shared().getByText('0', { exact: true })).toBeVisible();
  });
  it('removes abandoned future after alternate choice and announces the branch point', () => {
    start();
    run('A');
    run('B');
    run('A');
    run('B');
    back();
    back();
    run('B');
    expect(history().getAllByRole('listitem')).toHaveLength(3);
    expect(history().queryByText('Thread A — COMMIT')).not.toBeInTheDocument();
    expect(history().queryByText('Previous future')).not.toBeInTheDocument();
    expect(
      history().getByText('Applied · Current').closest('li'),
    ).toHaveTextContent('Thread B — COMMIT');
    expect(screen.getByRole('status')).toHaveTextContent(
      'A new execution continues from step 2. The previous later steps were replaced.',
    );
    run('A');
    expect(screen.getByRole('status')).not.toHaveTextContent('replaced');
  });
  it('keeps focus on the selected thread and makes finished controls inert', () => {
    start();
    const control = screen.getByRole('button', {
      name: 'Run Thread A next: CHECK',
    });
    control.focus();
    run('A');
    expect(control).toHaveFocus();
    run('A');
    expect(control).toHaveFocus();
    expect(control).toHaveAccessibleName('Thread A finished');
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(control).toHaveAttribute('tabindex', '-1');
    fireEvent.click(control);
    expect(history().getAllByRole('listitem')).toHaveLength(2);
  });
  it('uses one polite announcement with actual transition, Back and Reset results', () => {
    start();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    run('A');
    expect(status).toHaveTextContent(
      'Thread A performed CHECK. Observed 1 seat; check passed. Shared seats unchanged at 1. Invariant holds.',
    );
    run('B');
    run('A');
    run('B');
    expect(status).toHaveTextContent(
      'Invariant violated. 2 reservations succeeded; 1 original seat.',
    );
    back();
    expect(status).toHaveTextContent('Returned to step 3. Invariant holds.');
    fireEvent.click(screen.getByRole('button', { name: 'Reset run' }));
    expect(status).toHaveTextContent(
      'Run reset. No execution steps have run. Your prediction is unchanged.',
    );
  });
  it('keeps primary state and both thread controls in one information model', () => {
    start();
    expect(
      screen.getAllByRole('region', { name: 'Current shared state' }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('heading', { name: 'Invariant holds' }),
    ).toHaveLength(1);
    for (const id of ['A', 'B'] as const) {
      expect(
        screen.getAllByRole('region', { name: `Thread ${id}` }),
      ).toHaveLength(1);
      expect(
        thread(id).getByRole('button', {
          name: `Run Thread ${id} next: CHECK`,
        }),
      ).toBeVisible();
    }
  });
});
