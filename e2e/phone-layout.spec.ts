/**
 * NFR-02 mobile layout on a phone: the status bar, board and location panel fill the screen with no page scroll, the
 * action sheet scrolls inside the panel with Travel / End week pinned under it, nothing is wider than the screen, and
 * text is no smaller than 14px (NFR-04).
 */
import { expect, test } from '@playwright/test';

test('the phone layout fits the screen and keeps the dock in reach', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout only');
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const sheet = page.getByRole('region', { name: /You're at/ });
  await expect(page.locator('#sheet-heading')).toHaveText('Your Place');

  const m = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    overflowY: document.documentElement.scrollHeight - window.innerHeight,
    sheetScrolls: (() => {
      const el = document.getElementById('sheet');
      return !!el && el.scrollHeight > el.clientHeight;
    })(),
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
  expect(m.overflowX).toBeLessThanOrEqual(0);
  expect(m.overflowY).toBeLessThanOrEqual(0);
  expect(m.sheetScrolls).toBe(true);
  expect(m.smallestText).toBeGreaterThanOrEqual(14);

  // Scrolled to the end of the sheet: the dock is still on screen, and the last action isn't hidden under it.
  await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const end = page.getByRole('button', { name: /^End week/ });
  await expect(end).toBeInViewport();
  // The last row you can take: rows in the closed "Locked" list keep a layout box in WebKit but aren't shown.
  const lastRow = sheet.locator('[data-coach="actions"] > ul .action-row').last();
  const [rowBox, dockBox] = await Promise.all([
    lastRow.boundingBox(),
    page.locator('.dock').boundingBox(),
  ]);
  expect((rowBox?.y ?? 0) + (rowBox?.height ?? 0)).toBeLessThanOrEqual(dockBox?.y ?? 0);

  // Tapping a building travels there; the panel shows the new place with the status bar still in view.
  await page.getByRole('button', { name: 'Go to JobLink Hub' }).first().click();
  await expect(page.locator('#sheet-heading')).toHaveText('JobLink Hub');
  await expect(page.locator('#sheet-heading')).toBeInViewport();
  await expect(page.getByText('Week 1', { exact: false }).first()).toBeInViewport();
});
