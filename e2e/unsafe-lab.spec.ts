import { expect, test } from '@playwright/test';

test('keyboard prediction, unsafe schedule, retained future, alternate continuation and reset', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Last Seat Reservation', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start exploration' }),
  ).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('radio', { name: 'No', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Yes', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('Tab');
  await page.keyboard.type('Both might check before a reservation.');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Start exploration' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Unsafe exploration' }),
  ).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Your prediction' }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      'Each click advances one conceptual step in this teaching model.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'You are choosing a possible execution ordering, not simulating a complete OS scheduler.',
    ),
  ).toBeVisible();
  const state = page.getByRole('region', { name: 'Current shared state' });
  const history = page.getByRole('region', { name: 'Execution history' });
  await page.keyboard.press('Tab');
  const disclosure = page.getByText('More about this teaching model');
  await expect(disclosure).toBeFocused();
  expect(
    await disclosure.evaluate((summary) =>
      summary.parentElement?.hasAttribute('open'),
    ),
  ).toBe(false);
  await page.keyboard.press('Enter');
  expect(
    await disclosure.evaluate((summary) =>
      summary.parentElement?.hasAttribute('open'),
    ),
  ).toBe(true);
  await expect(
    page.getByText(/Conceptual steps are not CPU instructions/),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Run Thread A next: CHECK' }),
  ).toBeFocused();
  const outline = await page
    .locator(':focus')
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Run Thread A next: COMMIT' }),
  ).toBeFocused();
  await expect(history.getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Run Thread B next: CHECK' }),
  ).toBeFocused();
  await page.keyboard.press('Space');
  await expect(
    state.getByRole('heading', { name: 'Invariant holds' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Thread B', exact: true }),
  ).toContainText('Observed: 1 seat');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Go back one execution step' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history.getByText('Previous future')).toHaveCount(1);
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: 'Run Thread B next: CHECK' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history.getByText('Previous future')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(state.getByText('0', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Thread B', exact: true }),
  ).toContainText('Observed: 1 seat');
  await expect(
    page.getByRole('button', { name: 'Run Thread B next: COMMIT' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Thread A finished' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history.getByRole('listitem')).toHaveCount(3);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(
    state.getByRole('heading', { name: 'Invariant violated' }),
  ).toBeVisible();
  await expect(state).toContainText('2 successful reservations');
  await expect(state.getByText('-1', { exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Go back one execution step' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: 'Run Thread B next: COMMIT' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history.getByText('Thread A — COMMIT')).toHaveCount(0);
  await expect(history.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText(
    'The previous later steps were replaced.',
  );
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reset run' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history.getByRole('listitem')).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Your prediction' }),
  ).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(
    'Your prediction is unchanged.',
  );
  await expect(page.getByRole('status')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('narrow viewport keeps both threads and state accessible through safe completion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('radio', { name: "I'm not sure" }).check();
  await page.getByRole('button', { name: 'Start exploration' }).click();
  const state = page.getByRole('region', { name: 'Current shared state' });
  for (const id of ['A', 'B'])
    await expect(
      page.getByRole('region', { name: `Thread ${id}`, exact: true }),
    ).toBeVisible();
  await expect(
    state.getByRole('heading', { name: 'Invariant holds' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Run Thread A next: CHECK' }).click();
  await page.getByRole('button', { name: 'Run Thread A next: COMMIT' }).click();
  await page.getByRole('button', { name: 'Run Thread B next: CHECK' }).click();
  await expect(state).toContainText('1 successful reservation');
  await expect(
    state.getByRole('heading', { name: 'Invariant holds' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Thread B', exact: true }),
  ).toContainText('Observed: 0 seats');
  await expect(page.getByRole('button', { name: /Run Thread/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
