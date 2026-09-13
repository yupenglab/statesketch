import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from './App';
afterEach(cleanup);
function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function run(id: 'A' | 'B') {
  const button = screen.getByRole('button', {
    name: new RegExp(`Run Thread ${id} next:`),
  });
  button.focus();
  fireEvent.click(button);
  return button;
}
function start() {
  render(<App />);
  fireEvent.click(screen.getByRole('radio', { name: 'No' }));
  fireEvent.change(
    screen.getByLabelText('Optional: What makes you think so?'),
    { target: { value: 'Only one seat exists.' } },
  );
  click('Start exploration');
  for (const id of ['A', 'B', 'A', 'B'] as const) run(id);
  click('Analyze this result');
  expect(
    screen.queryByRole('button', { name: 'Try the synchronized version' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'COMMIT only' }));
  click('Check my reasoning');
  click('Try the synchronized version');
}
function region(id: 'A' | 'B') {
  return screen.getByRole('region', { name: `Thread ${id}` });
}
it('renders actual blocking, owner progress, wake without ownership, explicit re-LOCK and failed CHECK for either identity', () => {
  for (const owner of ['A', 'B'] as const) {
    start();
    const other = owner === 'A' ? 'B' : 'A';
    expect(
      screen.getByRole('heading', { name: 'Synchronized exploration' }),
    ).toHaveFocus();
    expect(
      screen.getByText(
        'No execution steps yet. The mutex is free; both threads begin at LOCK.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Compare executions' }),
    ).not.toBeInTheDocument();
    run(owner);
    const blockedButton = run(other);
    expect(blockedButton).toHaveFocus();
    expect(blockedButton).toHaveAttribute('aria-disabled', 'true');
    expect(blockedButton).toHaveAttribute('tabindex', '-1');
    expect(blockedButton).toHaveAccessibleDescription(
      `Waiting for the mutex held by Thread ${owner}. Thread ${other} has not performed CHECK.`,
    );
    const blocked = region(other);
    expect(blocked).toHaveTextContent('BLOCKED');
    expect(blocked).toHaveTextContent('LOCK when runnable');
    expect(blocked).toHaveTextContent('No check yet · no observation');
    expect(blocked).not.toHaveTextContent('FINISHED');
    const state = screen.getByRole('region', { name: 'Current shared state' });
    expect(state).toHaveTextContent('1seats remaining');
    expect(state).toHaveTextContent(`owned by Thread ${owner}`);
    expect(screen.getByRole('status')).toHaveTextContent(
      `Thread ${other} tried LOCK and is blocked waiting for the mutex held by Thread ${owner}`,
    );
    const before = screen.getByRole('region', {
      name: 'Synchronized execution history',
    }).textContent;
    fireEvent.click(blockedButton);
    expect(
      screen.getByRole('region', { name: 'Synchronized execution history' })
        .textContent,
    ).toBe(before);
    run(owner); // CHECK
    expect(within(region(owner)).getByRole('button')).toHaveAccessibleName(
      `Run Thread ${owner} next: COMMIT`,
    );
    run(owner);
    expect(state).toHaveTextContent(`owned by Thread ${owner}`);
    expect(within(region(owner)).getByRole('button')).toHaveAccessibleName(
      `Run Thread ${owner} next: UNLOCK`,
    );
    run(owner);
    expect(state).toHaveTextContent('Mutex: free');
    expect(region(other)).toHaveTextContent('RUNNABLE');
    expect(within(region(other)).getByRole('button')).toHaveAccessibleName(
      `Run Thread ${other} next: LOCK`,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Thread ${other} is runnable again and must try LOCK again before CHECK. It has not acquired the mutex yet.`,
    );
    run(other);
    expect(state).toHaveTextContent(`owned by Thread ${other}`);
    run(other);
    expect(region(other)).toHaveTextContent('Observed: 0 seats');
    expect(region(other)).toHaveTextContent('Check result: failed');
    expect(within(region(other)).getByRole('button')).toHaveAccessibleName(
      `Run Thread ${other} next: UNLOCK`,
    );
    run(other);
    expect(state).toHaveTextContent('Invariant holds');
    expect(state).toHaveTextContent('1 successful reservations');
    expect(
      screen.getByRole('button', { name: 'Compare executions' }),
    ).toBeEnabled();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    cleanup();
  }
});
it('accepts a safe no-block run with guidance, Back and Reset; retained future does not enable Compare', () => {
  start();
  for (const id of ['A', 'A', 'A', 'A', 'B', 'B', 'B'] as const) run(id);
  expect(
    screen.getByText('Safe execution, no contention observed'),
  ).toBeVisible();
  expect(
    screen.getByText(/This run is valid and the invariant holds/),
  ).toHaveTextContent('try the other thread while the mutex is held');
  expect(
    screen.queryByRole('button', { name: 'Compare executions' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Back one synchronized step' }),
  ).toBeEnabled();
  click('Back one synchronized step');
  expect(screen.getByText('Previous future')).toBeVisible();
  run('B');
  expect(screen.queryByText('Previous future')).not.toBeInTheDocument();
  click('Reset synchronized run');
  run('A');
  run('B');
  click('Back one synchronized step');
  expect(screen.getByText('Previous future')).toBeVisible();
  run('A'); // alternate CHECK removes blocked future
  expect(screen.queryByText('Previous future')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'previous later steps were replaced',
  );
  expect(region('B')).toHaveTextContent('RUNNABLE');
  expect(
    screen.queryByRole('button', { name: 'Compare executions' }),
  ).not.toBeInTheDocument();
});
it('shows causal mixed-role Compare, readonly phases, prediction reflection, model limitations and fresh Start over', () => {
  start();
  for (const id of ['B', 'A', 'B', 'B', 'B', 'A', 'A', 'A'] as const) run(id);
  click('Compare executions');
  expect(
    screen.getByRole('heading', { name: 'Compare executions' }),
  ).toHaveFocus();
  const unsafe = screen.getByRole('region', { name: 'Unsafe execution' });
  const sync = screen.getByRole('region', { name: 'Synchronized execution' });
  expect(unsafe).toHaveTextContent(
    'First committer: Thread A. Violating committer: Thread B.',
  );
  expect(sync).toHaveTextContent(
    'Thread A tried LOCK and is blocked waiting for the mutex held by Thread B',
  );
  expect(sync).toHaveTextContent('Observed 0 seats; check failed');
  expect(
    screen.getByRole('region', { name: 'Key causal difference' }),
  ).toHaveTextContent(
    'Thread A tried LOCK while Thread B owned the mutex and was blocked before CHECK',
  );
  expect(
    screen.queryByRole('button', { name: /Run Thread|Back|Reset|Start over/ }),
  ).not.toBeInTheDocument();
  click('Continue to final insight');
  expect(screen.getByRole('heading', { name: 'Final insight' })).toHaveFocus();
  expect(
    screen.getByRole('region', { name: 'Your initial prediction' }),
  ).toHaveTextContent('No');
  expect(
    screen.getByRole('region', { name: 'Your initial prediction' }),
  ).toHaveTextContent('Only one seat exists.');
  expect(
    screen.getByText(
      'The mutex did not change the meaning of CHECK or COMMIT. It changed the reachable interleavings.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('region', { name: 'Protect CHECK → dependent COMMIT' }),
  ).toHaveTextContent('same mutex');
  const limits = screen.getByRole('region', {
    name: 'What this model does—and does not—show',
  });
  for (const text of [
    'not a CPU instruction',
    'not a full operating-system scheduler',
    'Sequential consistency is a teaching simplification',
    'does not magically own',
    'does not model C or C++',
  ])
    expect(limits).toHaveTextContent(text);
  expect(
    screen.queryByText(/score|mastered|correct prediction/i),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('status')).toHaveLength(1);
  click('Start over');
  const prompt = screen.getByText(
    /One seat is left. Thread A and Thread B both try to reserve it. Could both reservations succeed/,
  );
  expect(prompt).toHaveFocus();
  expect(
    screen.getByRole('button', { name: 'Start exploration' }),
  ).toBeDisabled();
  expect(
    screen.getByLabelText('Optional: What makes you think so?'),
  ).toHaveValue('');
  expect(
    screen.queryByRole('button', { name: 'Start over' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
  click('Start exploration');
  expect(
    screen.queryByRole('button', { name: 'Analyze this result' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Initial state · Current')).toBeVisible();
});
