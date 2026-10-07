/** CI-03: start a game → play a week against Jones → the save survives a reload. */
import { defaultContent } from '@fastlane/content';
import { createEngine, hashValue } from '@fastlane/engine';
import { expect, type Page, test } from '@playwright/test';

/** Click through the end-of-week sequence, taking the first choice on any weekend card. */
async function finishWeek(page: Page, nextWeek: number) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const start = dialog.getByRole('button', { name: `Start week ${nextWeek}` });
    if (await start.isVisible()) {
      await start.click();
      return;
    }
    const choices = dialog.getByRole('list', { name: 'Choose' });
    if (await choices.isVisible()) await choices.getByRole('button').first().click();
    else await dialog.getByRole('button', { name: 'Next' }).click();
  }
  throw new Error('the week never ended');
}

test('play a week vs Jones, then reload and continue', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  const sheet = page.getByRole('region', { name: /You're at/ });
  await expect(sheet).toContainText("You're at Your Place");
  await expect(page.getByText('Week 1', { exact: false }).first()).toBeVisible();

  // Do something with a visible preview, then go to JobLink and get a job.
  await sheet.getByRole('button', { name: /Take a nap/ }).click();
  await page.getByRole('button', { name: /^Travel/ }).click();
  const travel = page.getByRole('dialog', { name: 'Go somewhere' });
  await travel
    .getByRole('listitem')
    .filter({ hasText: 'Travel to JobLink Hub' })
    .getByRole('button', { name: /Transit/ })
    .click();
  await expect(sheet).toContainText("You're at JobLink Hub");
  await sheet.getByRole('button', { name: /Picker/ }).click();
  await expect(sheet).toContainText('Hired as Picker');

  // The week guide points at the new job; its Go button travels in one click.
  await expect(page.getByTestId('next-step').first()).toContainText('Fulfillment Center');
  await page.getByRole('button', { name: 'Go to Fulfillment Center' }).first().click();
  await expect(sheet).toContainText("You're at Fulfillment Center");

  // Ending the week without a meal asks first.
  await page.getByRole('button', { name: /^End week/ }).click();
  const confirm = page.getByRole('dialog', { name: 'End the week now?' });
  await expect(confirm).toContainText("You haven't eaten this week");
  await confirm.getByRole('button', { name: 'End week anyway' }).click();
  await finishWeek(page, 2);
  await expect(page.getByText('Week 2', { exact: false }).first()).toBeVisible();

  // Autosave is async (IndexedDB); give it a moment, then reload and continue from the title screen.
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('region', { name: /You're at/ })).toContainText(
    "You're at Your Place",
  );
  await expect(page.getByText('Week 2', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Picker');

  // Cross-runtime determinism (NFR-12, engine-design §15): the log this browser saved replays in Node to the
  // exact state the browser reached, Jones's moves included.
  const json = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('fastlane');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result.transaction('slots').objectStore('slots').getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => resolve(read.result[0].save);
        };
      }),
  );
  const save = JSON.parse(json);
  const replayed = createEngine(defaultContent).replay(save.setup, save.log);
  expect(hashValue(replayed)).toBe(save.snapshotHash);
});
