import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

interface LongTaskSample {
  duration: number;
  start: number;
}

async function openLab(page: Page): Promise<void> {
  await page.goto('/#/lab');
  const skip = page.getByRole('button', { name: '跳过' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.locator('.topology-meta')).toBeVisible();
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

test('high-density 48 x 1K keeps the main thread responsive', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLab(page);
  await page.selectOption('[data-testid="scenario-select"]', 'high-density-demo');
  await expect(page.locator('.topology-meta')).toContainText('32 ACCELERATORS');

  await page.evaluate(() => {
    const samples: LongTaskSample[] = [];
    (window as unknown as { __longTasks: LongTaskSample[] }).__longTasks = samples;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) samples.push({ duration: entry.duration, start: entry.startTime });
    });
    observer.observe({ type: 'longtask', buffered: true });
  });

  const startedAt = Date.now();
  await page.locator('.run-btn').click();
  await expect(page.locator('.tl-meta')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.run-btn')).toBeEnabled({ timeout: 120_000 });
  const runReadyMs = Date.now() - startedAt;

  const marks = await page.evaluate(() => {
    const names = ['il-run-response-received', 'il-run-state-set', 'il-timeline-built'];
    return Object.fromEntries(
      names.map((name) => [name, performance.getEntriesByName(name).map((entry) => Math.round(entry.startTime))]),
    );
  });

  const longTasks = await page.evaluate(
    () => (window as unknown as { __longTasks: LongTaskSample[] }).__longTasks,
  );
  const durations = longTasks.map((sample) => sample.duration);

  // Playback frame cadence must be sampled while the event log is actually
  // replaying, otherwise an idle page trivially passes the gate.
  await page.locator('.tl-icon[aria-label="回到起点"]').click();
  if ((await page.locator('.tl-play').getAttribute('aria-label')) !== '暂停') {
    await page.locator('.tl-play').click();
  }
  const frameStats = await page.evaluate(async () => {
    const deltas: number[] = [];
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        deltas.push(now - last);
        last = now;
        if (now - start >= 1500) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return deltas;
  });
  const advancedWhilePlaying = await page
    .locator('.tl-meta')
    .evaluate((node) => !node.textContent?.includes('event 0 /'));
  if ((await page.locator('.tl-play').getAttribute('aria-label')) === '暂停') {
    await page.locator('.tl-play').click();
  }

  // Seek latency: time from scrub click until the rendered virtual-time label
  // actually changes, not merely until one frame is painted.
  await page.locator('.tl-icon[aria-label="回到起点"]').click();
  const seek = await page.evaluate(async () => {
    const scrub = document.querySelector('.tl-scrub') as HTMLElement;
    const rect = scrub.getBoundingClientRect();
    const before = document.querySelector('.tl-scrub-label')?.textContent ?? '';
    const start = performance.now();
    scrub.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + rect.width * 0.6,
        clientY: rect.top + rect.height / 2,
      }),
    );
    let after = before;
    while (performance.now() - start < 1_000) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      after = document.querySelector('.tl-scrub-label')?.textContent ?? '';
      if (after !== before) break;
    }
    return { latencyMs: performance.now() - start, changed: after !== before, before, after };
  });

  const report = {
    scenario: 'high-density-demo (48 requests x 8192 prompt / 1000 output)',
    generatedAt: new Date().toISOString(),
    runReadyMs,
    marks,
    longTaskCount: durations.length,
    longTaskP95Ms: percentile(durations, 95),
    longTaskMaxMs: Math.max(0, ...durations),
    frameCount: frameStats.length,
    frameP95Ms: percentile(frameStats, 95),
    frameMaxMs: Math.max(0, ...frameStats),
    advancedWhilePlaying,
    seekLatencyMs: seek.latencyMs,
    seekChanged: seek.changed,
    seekBefore: seek.before,
    seekAfter: seek.after,
    note: 'Playwright Chromium, local dev server, single worker; values are machine-specific.',
  };
  const outDir = path.resolve(process.cwd(), '../../docs');
  fs.writeFileSync(path.join(outDir, 'performance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('PERF_REPORT', JSON.stringify(report));

  expect(report.longTaskP95Ms).toBeLessThan(150);
  expect(report.frameCount).toBeGreaterThan(30);
  expect(report.frameP95Ms).toBeLessThan(34);
  expect(report.advancedWhilePlaying).toBe(true);
  expect(report.seekChanged).toBe(true);
  expect(report.seekLatencyMs).toBeLessThan(300);
});
