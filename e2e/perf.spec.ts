/**
 * Board frame budget (NFR-10: 60 fps on a mid-range 2022 phone). Chromium only: it slows the CPU 4× through the
 * DevTools protocol, which is how Lighthouse models a mid-range phone, then measures the board idling and a token
 * travelling. Headless Chromium has no GPU and rasterises WebGL in software (SwiftShader), so its frame rate says
 * little about a phone; the test asserts the game's own main-thread JS per frame and reports the frame rate.
 */
import { type CDPSession, expect, type Page, test } from '@playwright/test';

/** Frame intervals in ms over `ms`, from requestAnimationFrame. */
async function frames(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const start = performance.now();
        const tick = (t: number) => {
          times.push(t);
          if (t - start < ms) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((v, i) => v - (times[i] ?? v)));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

function stats(intervals: number[]) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const total = intervals.reduce((a, b) => a + b, 0);
  return { fps: (intervals.length * 1000) / total, p50: at(0.5), p95: at(0.95) };
}

async function scriptSeconds(cdp: CDPSession): Promise<number> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'ScriptDuration')?.value ?? 0;
}

/** Frames and main-thread JS per frame over a window, while `during` runs. */
async function measure(page: Page, cdp: CDPSession, ms: number, during?: () => Promise<void>) {
  const before = await scriptSeconds(cdp);
  const run = frames(page, ms);
  await during?.();
  const intervals = await run;
  const script = (await scriptSeconds(cdp)) - before;
  return { ...stats(intervals), scriptPerFrame: (script * 1000) / Math.max(1, intervals.length) };
}

const fmt = (m: Awaited<ReturnType<typeof measure>>) =>
  `${m.fps.toFixed(1)} fps, p95 ${m.p95.toFixed(1)} ms, JS ${m.scriptPerFrame.toFixed(2)} ms/frame`;

test('the board leaves a 60 fps frame budget on a throttled phone', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs the Chromium DevTools protocol');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1000);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const idle = await measure(page, cdp, 3000);
  // The travel click: the engine reduces the action and React updates the HUD, sheet and board, until the next
  // frame is painted. Then the token glides round the loop.
  // Playwright's locators run their own script in the page, so the button is found before measuring and clicked
  // from inside the page.
  const go = await page
    .getByRole('button', { name: /Go to JobLink Hub/ })
    .first()
    .elementHandle();
  if (!go) throw new Error('no Go button');
  const before = await scriptSeconds(cdp);
  const ms = await go.evaluate(
    (el) =>
      new Promise<number>((resolve) => {
        const t0 = performance.now();
        (el as HTMLElement).click();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
      }),
  );
  const click = { ms: Math.round(ms), script: ((await scriptSeconds(cdp)) - before) * 1000 };
  const glide = await measure(page, cdp, 1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const line = `idle: ${fmt(idle)}; travel click: ${click.ms} ms to paint, JS ${click.script.toFixed(0)} ms; glide: ${fmt(glide)}`;
  info.annotations.push({ type: 'frame budget', description: line });
  console.log(line);
  // The frame rate here is the software rasteriser's, not the game's, so it is reported, not asserted. What the game
  // controls is its own main-thread work, on a CPU slowed 4×: at most 10 ms of each 16.7 ms frame (2–6 ms measured
  // locally), and a click's JS under 300 ms (120–195 ms measured). The headroom is for busy CI runners. Under 200 ms
  // is a "good" Interaction to Next Paint, so the click is the place to look if this ever tightens.
  expect(idle.scriptPerFrame).toBeLessThanOrEqual(10);
  expect(glide.scriptPerFrame).toBeLessThanOrEqual(10);
  expect(click.script).toBeLessThanOrEqual(300);
});
