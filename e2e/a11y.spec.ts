/** NFR-04: axe finds no WCAG 2.2 A/AA violations on the main screens, in light and dark themes. */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    // The Pixi canvas is decoration (aria-hidden); the DOM controls around it are what's audited.
    .exclude('canvas')
    .analyze();
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
  expect(summary, `${label}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`main screens pass axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await audit(page, 'title');

    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await audit(page, 'setup');

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('coach').first()).toBeVisible();
    await audit(page, 'game');

    await page.keyboard.press('d');
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'details');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await audit(page, 'settings');
    await page.keyboard.press('Escape');

    await page.keyboard.press('e');
    const anyway = page.getByRole('button', { name: 'End week anyway' });
    await expect(anyway).toBeVisible();
    await audit(page, 'end-week check');
    await anyway.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'week wrap-up');
  });
}
