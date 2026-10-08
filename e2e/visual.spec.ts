/**
 * Visual snapshots of the main screens in light and dark (tech-stack §6, CI-03). Baselines are made on CI's runner by
 * the `visual` workflow (ci-cd.md §4), because fonts and rasterising differ between machines. Until a project has
 * baselines its comparisons are skipped, with a note in the report, unless the run is updating snapshots.
 */
import { existsSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

async function snap(page: Page, name: string) {
  const info = test.info();
  const updating =
    info.config.updateSnapshots === 'all' || info.config.updateSnapshots === 'changed';
  if (!updating && !existsSync(info.snapshotPath(`${name}.png`))) {
    info.annotations.push({ type: 'no baseline', description: `${name}: run the visual workflow` });
    return;
  }
  // Let the board's art and fonts settle before comparing.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`main screens look right (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
    await snap(page, `title-${scheme}`);

    await page.getByRole('button', { name: 'New game' }).click();
    await page.getByLabel('Seed').fill('visual');
    await snap(page, `setup-${scheme}`);

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('coach').first()).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await snap(page, `game-${scheme}`);

    await page.keyboard.press('d');
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap(page, `details-${scheme}`);
    await page.keyboard.press('Escape');

    await page.keyboard.press('e');
    await page.getByRole('button', { name: 'End week anyway' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snap(page, `wrap-up-${scheme}`);
  });
}
