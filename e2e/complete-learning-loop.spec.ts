import { expect, test } from '@playwright/test';

test('complete learning loop: real blocking, causal Compare and final reflection', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  async function activate(name: string) {
    const button = page.getByRole('button', { name, exact: true });
    await button.focus();
    await page.keyboard.press('Enter');
  }
  async function fits() {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole('radio', { name: 'No', exact: true }).focus();
  await page.keyboard.press('Space');
  await page
    .getByLabel('Optional: What makes you think so?')
    .fill('There is only one seat.');
  await activate('Start exploration');
  for (const name of [
    'Run Thread A next: CHECK',
    'Run Thread B next: CHECK',
    'Run Thread A next: COMMIT',
    'Run Thread B next: COMMIT',
  ])
    await activate(name);
  await activate('Analyze this result');
  await page.getByRole('radio', { name: "I'm not sure", exact: true }).focus();
  await page.keyboard.press('Space');
  await activate('Check my reasoning');
  await activate('Try the synchronized version');
  await expect(
    page.getByRole('heading', { name: 'Synchronized exploration' }),
  ).toBeFocused();
  await activate('Run Thread B next: LOCK');
  await activate('Run Thread A next: LOCK');
  const blocked = page.getByRole('button', {
    name: 'Thread A blocked',
    exact: true,
  });
  await expect(blocked).toBeFocused();
  await expect(blocked).toHaveAttribute('aria-disabled', 'true');
  await expect(blocked).toHaveAccessibleDescription(
    'Waiting for the mutex held by Thread B. Thread A has not performed CHECK.',
  );
  await expect(
    page.getByRole('region', { name: 'Thread A', exact: true }),
  ).toContainText('No check yet · no observation');
  await expect(
    page.getByRole('region', { name: 'Current shared state' }),
  ).toContainText('1seats remaining');
  await expect(page.getByRole('status')).toContainText(
    'Thread A tried LOCK and is blocked waiting for the mutex held by Thread B',
  );
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Run Thread B next: CHECK' }),
  ).toBeFocused();
  await fits();
  await page.screenshot({
    path: testInfo.outputPath('synchronized-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await fits();
  await page.screenshot({
    path: testInfo.outputPath('synchronized-narrow.png'),
    fullPage: true,
  });
  await activate('Run Thread B next: CHECK');
  await activate('Run Thread B next: COMMIT');
  await expect(
    page.getByRole('region', { name: 'Current shared state' }),
  ).toContainText('owned by Thread B');
  await activate('Run Thread B next: UNLOCK');
  await expect(
    page.getByRole('region', { name: 'Current shared state' }),
  ).toContainText('Mutex: free');
  await expect(page.getByRole('status')).toContainText(
    'Thread A is runnable again and must try LOCK again before CHECK. It has not acquired the mutex yet.',
  );
  await activate('Run Thread A next: LOCK');
  await activate('Run Thread A next: CHECK');
  await expect(
    page.getByRole('region', { name: 'Thread A', exact: true }),
  ).toContainText('Observed: 0 seats');
  await expect(
    page.getByRole('region', { name: 'Thread A', exact: true }),
  ).toContainText('Check result: failed');
  await expect(
    page.getByRole('button', { name: 'Run Thread A next: COMMIT' }),
  ).toHaveCount(0);
  await activate('Run Thread A next: UNLOCK');
  await expect(
    page.getByRole('region', { name: 'Current shared state' }),
  ).toContainText('Invariant holds');
  await activate('Compare executions');
  await expect(
    page.getByRole('heading', { name: 'Compare executions' }),
  ).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Unsafe execution' }),
  ).toContainText('First committer: Thread A. Violating committer: Thread B.');
  await expect(
    page.getByRole('region', { name: 'Key causal difference' }),
  ).toContainText(
    'Thread A tried LOCK while Thread B owned the mutex and was blocked before CHECK',
  );
  await expect(
    page.getByRole('button', { name: /Run Thread|Reset|Back/ }),
  ).toHaveCount(0);
  await fits();
  await page.screenshot({
    path: testInfo.outputPath('compare-narrow.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fits();
  await page.screenshot({
    path: testInfo.outputPath('compare-desktop.png'),
    fullPage: true,
  });
  await activate('Continue to final insight');
  await expect(
    page.getByRole('heading', { name: 'Final insight' }),
  ).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Your initial prediction' }),
  ).toContainText('No');
  await expect(
    page.getByRole('region', { name: 'Your initial prediction' }),
  ).toContainText('There is only one seat.');
  await expect(
    page.getByRole('region', { name: 'Protect CHECK → dependent COMMIT' }),
  ).toContainText(
    'The mutex did not change the meaning of CHECK or COMMIT. It changed the reachable interleavings.',
  );
  await expect(page.getByRole('status')).toHaveCount(1);
  await expect(page.locator('[aria-live]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await fits();
  await page.screenshot({
    path: testInfo.outputPath('insight-narrow.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
