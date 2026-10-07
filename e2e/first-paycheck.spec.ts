/**
 * ENG-20: following only the week-1 coach gets a new player hired and paid in a handful of taps. The real bar is
 * testers' time (implementation-plan Phase 5 exit criteria); this guards the path they take.
 */
import { expect, test } from '@playwright/test';

test('the coach leads from a new game to the first paycheck', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  const coach = page.getByTestId('coach');
  await expect(coach).toContainText('1 of 5');
  await page.locator('[data-coach="go"]').first().click();

  await expect(coach).toContainText('2 of 5');
  await page
    .locator('[data-coach="actions"]')
    .getByRole('button', { name: /Picker/ })
    .click();

  await expect(coach).toContainText('3 of 5');
  await page.locator('[data-coach="go"]').first().click();

  await expect(coach).toContainText('4 of 5');
  await page.getByTestId('quick-work').click();

  await expect(coach).toContainText('5 of 5');
  await expect(coach).toContainText('first paycheck');
  await coach.getByRole('button', { name: 'Got it' }).click();
  await expect(coach).toHaveCount(0);
});
