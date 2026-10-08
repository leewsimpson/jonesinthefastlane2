/**
 * NFR-02 portrait layout on a phone: one page that scrolls, with the HUD's top bar and the Travel / End week dock
 * pinned, nothing wider than the screen, and text no smaller than 14px (NFR-04).
 */
import { expect, test } from '@playwright/test';

test('the phone layout scrolls as one page and keeps the dock in reach', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'portrait phone layout only');
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const sheet = page.getByRole('region', { name: /You're at/ });
  await expect(sheet).toContainText("You're at Your Place");

  const metrics = () =>
    page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      scrollable: document.documentElement.scrollHeight > window.innerHeight,
      smallestText: Math.min(
        ...[...document.querySelectorAll<HTMLElement>('.game-layout *')]
          .filter(
            (e) =>
              e.offsetParent &&
              [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()),
          )
          .map((e) => Number.parseFloat(getComputedStyle(e).fontSize)),
      ),
    }));
  const m = await metrics();
  expect(m.overflowX).toBeLessThanOrEqual(0);
  expect(m.scrollable).toBe(true);
  expect(m.smallestText).toBeGreaterThanOrEqual(14);

  // Scrolled to the bottom: the dock is still on screen, and the last action isn't hidden under it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const end = page.getByRole('button', { name: /^End week/ });
  await expect(end).toBeInViewport();
  const lastRow = sheet.locator('.action-row').last();
  const [rowBox, dockBox] = await Promise.all([
    lastRow.boundingBox(),
    page.locator('.dock').boundingBox(),
  ]);
  expect((rowBox?.y ?? 0) + (rowBox?.height ?? 0)).toBeLessThanOrEqual(dockBox?.y ?? 0);

  // Back at the top, the top bar stays pinned; travelling brings the new place's actions into view.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Go to JobLink Hub' }).first().click();
  await expect(sheet).toContainText("You're at JobLink Hub");
  await expect(page.locator('#sheet-heading')).toBeInViewport();
  await expect(page.getByText('Week 1', { exact: false }).first()).toBeInViewport();
});
