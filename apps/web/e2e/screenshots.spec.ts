import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), '../../docs/screenshots');

async function openLab(page: Page): Promise<void> {
  await page.goto('/#/lab');
  const skip = page.getByRole('button', { name: '跳过' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.locator('.topology-meta')).toBeVisible();
}

async function selectPreset(page: Page, scenarioId: string): Promise<void> {
  await page.selectOption('[data-testid="scenario-select"]', scenarioId);
  await page.waitForTimeout(300);
}

async function runAndPause(page: Page): Promise<void> {
  await page.locator('.run-btn').click();
  await expect(page.locator('.tl-meta')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.run-btn')).toBeEnabled({ timeout: 60_000 });
  if ((await page.locator('.tl-play').getAttribute('aria-label')) === '暂停') {
    await page.locator('.tl-play').click();
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('UI screenshot baseline', () => {
  test('1440x900 default, TP8, NPU inspector and invalid plan', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLab(page);
    await selectPreset(page, 'toy-32gpu-tp16-dp2');
    await page.screenshot({ path: path.join(OUT, '1440x900-default.png') });

    await page.locator('[data-testid="tp-8"]').click();
    await expect(page.locator('.group-frame')).toHaveCount(4);
    await page.screenshot({ path: path.join(OUT, '1440x900-tp8.png') });

    await page.locator('[data-testid="device-node-0-gpu-3"]').click();
    await expect(page.locator('[data-testid="inspector"]')).toContainText('node-0-gpu-3');
    await page.screenshot({ path: path.join(OUT, '1440x900-inspector-npu.png') });

    await page.waitForTimeout(600);
    const draft = await page.evaluate(() => {
      const raw = window.localStorage.getItem('inferencelab.draft.v1');
      return raw ? JSON.parse(raw) : null;
    });
    expect(draft).not.toBeNull();
    draft.deployment.logicalParallelism.tp = 3;
    await page.evaluate((next) => {
      window.localStorage.setItem('inferencelab.draft.v1', JSON.stringify(next));
    }, draft);
    await page.reload();
    const skip = page.getByRole('button', { name: '跳过' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.getByRole('button', { name: '06 校验与证据' }).click();
    await expect(page.locator('.plan-badge')).toContainText('INVALID');
    await page.screenshot({ path: path.join(OUT, '1440x900-invalid.png') });
  });

  test('1440x900 scheduler events and KV block detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLab(page);
    await selectPreset(page, 'budget-8-demo');
    await runAndPause(page);
    await page.locator('[data-testid="lens-scheduler"]').click();
    await expect(page.locator('.scheduler-lens')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, '1440x900-scheduler-events.png') });

    await page.locator('[data-testid="lens-memory"]').click();
    await expect(page.locator('.block-grid')).toBeVisible();
    await page.locator('.block-cell').first().click();
    await expect(page.locator('[data-testid="inspector"]')).toContainText('KV Block');
    await page.screenshot({ path: path.join(OUT, '1440x900-kv-block.png') });
  });

  test('1280x800 laptop and 1920x1080 wide', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);
    await selectPreset(page, 'toy-32gpu-tp16-dp2');
    await page.screenshot({ path: path.join(OUT, '1280x800-default.png') });
    await page.getByRole('button', { name: '打开配置面板' }).click();
    await page.screenshot({ path: path.join(OUT, '1280x800-drawer.png') });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    const skip = page.getByRole('button', { name: '跳过' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(page.locator('.topology-meta')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, '1920x1080-default.png') });
  });

  test('390x844 mobile degraded mode', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLab(page);
    await selectPreset(page, 'toy-32gpu-tp16-dp2');
    // The quality badge is the primary honesty signal and must survive the
    // compact header; the degraded-mode hint must also be visible.
    await expect(page.locator('.quality-pill')).toBeVisible();
    await expect(page.locator('.mobile-hint')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, '390x844-mobile.png') });
    await page.getByRole('button', { name: '打开配置面板' }).click();
    await page.screenshot({ path: path.join(OUT, '390x844-config.png') });
  });

  test('light theme and reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLab(page);
    await selectPreset(page, 'toy-32gpu-tp16-dp2');
    await page.getByRole('button', { name: '切换到浅色主题' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: path.join(OUT, '1440x900-light.png') });

    await page.getByRole('button', { name: '切换减少动效' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await selectPreset(page, 'budget-8-demo');
    await runAndPause(page);
    await page.screenshot({ path: path.join(OUT, '1440x900-reduced-motion.png') });
  });
});
