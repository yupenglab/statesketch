import { expect, test } from '@playwright/test';

test('narrow Chromium explains the saved violation and preserves it through checkpoint and reset', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await page.getByRole('radio', { name: 'Yes', exact: true }).check();
  await page
    .getByLabel('Optional: What makes you think so?')
    .fill('Both checks may pass before either commit.');
  await page.getByRole('button', { name: 'Start exploration' }).click();

  for (const name of [
    'Run Thread A next: CHECK',
    'Run Thread B next: CHECK',
    'Run Thread A next: COMMIT',
    'Run Thread B next: COMMIT',
  ]) {
    await page.getByRole('button', { name }).click();
  }

  await expect(
    page.getByRole('heading', { name: 'Invariant violated' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Unsafe exploration' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Analyze this result' }).click();

  await expect(
    page.getByRole('heading', { name: 'Violation analysis' }),
  ).toBeFocused();
  const trace = page.getByRole('list', { name: 'Saved violating execution' });
  await expect(trace.getByRole('listitem')).toHaveCount(4);
  await expect(trace.getByRole('listitem').nth(0)).toContainText(
    'Thread A — CHECK',
  );
  await expect(trace.getByRole('listitem').nth(1)).toContainText(
    'Thread B — CHECK',
  );
  await expect(trace.getByRole('listitem').nth(2)).toContainText(
    'Thread A — COMMIT',
  );
  await expect(trace.getByRole('listitem').nth(3)).toContainText(
    'Thread B — COMMIT',
  );
  await expect(trace.getByRole('listitem').nth(3)).toContainText(
    'Invariant violated here',
  );
  const stale = page
    .getByRole('heading', {
      name: 'Earlier observation versus shared state',
    })
    .locator('..');
  await expect(stale).toContainText(
    "Thread B's earlier CHECK saw 1 seat and passed",
  );
  await expect(stale).toContainText(
    'After Thread A committed, the shared value became 0',
  );
  const savedEvidence = await trace.textContent();

  const checkpoint = page.getByRole('group', {
    name: 'Which part must another reservation attempt not interrupt?',
  });
  await checkpoint.getByRole('radio', { name: 'CHECK only' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(
    checkpoint.getByRole('radio', { name: 'CHECK → COMMIT' }),
  ).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Check my reasoning' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  const feedback = page.getByRole('heading', {
    name: 'Feedback on your latest answer',
  });
  await expect(feedback.locator('..')).toContainText(
    'must remain one uninterrupted logical region',
  );
  await expect(page.getByRole('status')).toContainText(
    'must remain one uninterrupted logical region',
  );

  await page.getByRole('button', { name: 'Reset current run' }).click();
  expect(await trace.textContent()).toBe(savedEvidence);
  await expect(
    checkpoint.getByRole('radio', { name: 'CHECK → COMMIT' }),
  ).toBeChecked();
  await expect(feedback.locator('..')).toContainText(
    'must remain one uninterrupted logical region',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
