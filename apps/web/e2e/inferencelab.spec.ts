import { expect, test, type Page } from '@playwright/test';

async function openLab(page: Page): Promise<void> {
  await page.goto('/#/lab');
  const skip = page.getByRole('button', { name: '跳过' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.locator('.topology-meta')).toBeVisible();
}

async function selectPreset(page: Page, scenarioId: string, expectedAccelerators: number): Promise<void> {
  await page.selectOption('[data-testid="scenario-select"]', scenarioId);
  await expect(page.locator('.topology-meta')).toContainText(`${expectedAccelerators} 加速卡`);
}

async function runExperiment(page: Page): Promise<void> {
  const run = page.locator('.run-btn');
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.locator('.tl-meta')).toBeVisible();
  await expect(page.locator('.tl-meta')).toContainText('/');
  if ((await page.locator('.tl-play').getAttribute('aria-label')) === '暂停') {
    await page.locator('.tl-play').click();
  }
}

async function seekTimelineRatio(page: Page, ratio: number): Promise<void> {
  const scrub = page.locator('.tl-scrub');
  const box = await scrub.boundingBox();
  if (!box) throw new Error('Timeline scrub is not visible');
  await page.mouse.click(box.x + box.width * Math.min(0.999, Math.max(0.001, ratio)), box.y + box.height / 2);
}

test.describe('InferenceLab UI acceptance', () => {
  test('E2E-01 TP change rebuilds groups and persists the draft', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'toy-32gpu-tp16-dp2', 32);
    await expect(page.locator('.node-card')).toHaveCount(2);
    await expect(page.locator('.node-card').first()).toContainText('16 ranks');
    await expect(page.locator('.group-head').first()).toContainText('TP16');

    await page.locator('[data-testid="tp-8"]').click();
    await expect(page.locator('.topology-meta')).toContainText('2 节点 / 32 加速卡');
    await expect(page.locator('.group-frame')).toHaveCount(4);
    await expect(page.locator('.group-head').first()).toContainText('TP8');

    await page.waitForTimeout(600);
    await page.reload();
    const skip = page.getByRole('button', { name: '跳过' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(page.locator('.topology-meta')).toContainText('2 节点 / 32 加速卡');
    await expect(page.locator('.group-frame')).toHaveCount(4);
  });

  test('E2E-02 device selection survives a Lens change', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'toy-32gpu-tp16-dp2', 32);
    await page.locator('[data-testid="device-node-0-gpu-3"]').click();
    const inspector = page.locator('[data-testid="inspector"]');
    await expect(inspector).toContainText('node-0-gpu-3');
    await expect(inspector).toContainText('HBM 预算');

    await page.locator('[data-testid="lens-memory"]').click();
    await expect(page.locator('.memory-lens')).toBeVisible();
    await expect(inspector).toContainText('node-0-gpu-3');
    await expect(inspector).toContainText('HBM 预算');
    await expect(inspector).toContainText('KV Pool 预留');
    await expect(page.locator('.timeline')).toBeVisible();
  });

  test('E2E-03 invalid plan blocks Run and recovers after a fix', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'budget-8-demo', 4);
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
    await expect(page.locator('.plan-badge')).toContainText('无效');
    await expect(page.locator('.run-btn')).toBeDisabled();
    await expect(page.locator('[data-testid="plan-issues"]')).toContainText('TP_GROUP_SIZE');

    await page.locator('[data-testid="tp-4"]').click();
    await expect(page.locator('.plan-badge')).toContainText('可行');
    await expect(page.locator('.run-btn')).toBeEnabled();
  });

  test('E2E-04 playback, stepping and Lens changes keep virtual time', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'budget-8-demo', 4);
    await runExperiment(page);

    const meta = page.locator('.tl-meta');
    const before = await meta.innerText();
    await page.locator('.tl-icon[aria-label="单步事件"]').click();
    await expect(meta).not.toHaveText(before);
    const afterStep = await meta.innerText();

    await page.locator('[data-testid="lens-memory"]').click();
    await expect(meta).toHaveText(afterStep);

    await seekTimelineRatio(page, 0.5);
    await expect(meta).not.toContainText('事件 0 /');
    await page.locator('[data-testid="lens-scheduler"]').click();
    await expect(meta).not.toContainText('事件 0 /');
  });

  test('E2E-05 prefix cache hit is visible on the Request Inspector', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'prefix-cache-demo', 4);
    await runExperiment(page);
    await page.locator('[data-testid="lens-metrics"]').click();
    await expect(page.locator('.waterfall-row')).toHaveCount(3);

    await page.locator('.waterfall-row').nth(1).click();
    const inspector = page.locator('[data-testid="inspector"]');
    await expect(inspector).toContainText('缓存前缀');
    await expect(inspector).toContainText('32 个 Token');
    await expect(inspector).toContainText('Prefix Cache 命中 32 tokens');
  });

  test('E2E-06 1280×800 drawers remain operable and Run is keyboard reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);
    await expect(page.locator('.config-panel')).not.toBeInViewport();
    await expect(page.locator('.top-nav')).toBeVisible();
    await expect(page.locator('[data-testid="quality-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="draft-state"]')).toBeVisible();

    await page.getByRole('button', { name: '打开配置面板' }).click();
    await expect(page.locator('.config-panel')).toBeInViewport();
    await page.locator('.drawer-backdrop').click({ position: { x: 1200, y: 700 } });

    await page.getByRole('button', { name: '◧ 检查器' }).click();
    await expect(page.locator('[data-testid="inspector"]')).toBeInViewport();

    // Reach Run with real Tab presses rather than programmatic focus().
    let reached = false;
    for (let step = 0; step < 150; step += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('run-btn') ?? false);
      if (reached) break;
    }
    expect(reached).toBe(true);
    await expect(page.locator('.run-btn')).toBeFocused();
    await expect(page.locator('.run-btn')).toBeVisible();
    await page.screenshot({ path: 'e2e/screenshots/1280x800-drawer.png', fullPage: false });
  });

  test('E2E-07 reduced motion still renders the full event story', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: '切换减少动效' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    await selectPreset(page, 'budget-8-demo', 4);
    await runExperiment(page);
    await expect(page.locator('.tl-seg').first()).toBeVisible();
    await expect(page.locator('.tl-meta')).toContainText('事件');
  });

  test('E2E-08 PD transfer completes before Decode and Link Inspector shows contention', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'pd-demo', 8);
    await runExperiment(page);

    const transfer = page.locator('.tl-seg.tl-transfer').first();
    await expect(transfer).toBeVisible();
    const startUs = Number(await transfer.getAttribute('data-start-us'));
    const endUs = Number(await transfer.getAttribute('data-end-us'));
    expect(endUs).toBeGreaterThan(startUs);

    // Mid-transfer: clicking the transfer segment lands inside it, so request A
    // must be waiting for remote KV rather than generating.
    await transfer.click();
    await page.locator('[data-testid="lens-metrics"]').click();
    await page.locator('.waterfall-row').first().click();
    const inspector = page.locator('[data-testid="inspector"]');
    await expect(inspector).toContainText('等待远端 KV');
    await expect(inspector).toContainText('已生成');
    await expect(inspector).toContainText('0 /');

    // After completion: the same request has generated tokens.
    await seekTimelineRatio(page, 0.999);
    await page.locator('.waterfall-row').first().click();
    await expect(inspector).not.toContainText('等待远端 KV');
    await expect(inspector).toContainText('KV 传输');

    await page.locator('[data-testid="lens-transport"]').click();
    const card = page.locator('.transfer-card').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('PD_KV_TRANSFER');
    await card.getByRole('button', { name: /定位链路/ }).click();
    await expect(inspector).toContainText('竞争域容量');
    await expect(inspector).toContainText('传输次数（运行）');
  });

  test('E2E-18 locale switch updates chrome and persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#/lab');
    const skip = page.getByRole('button', { name: '跳过' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByTestId('lens-topology')).toContainText('拓扑');
    await expect(page.locator('.run-btn')).toContainText('运行实验');

    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('lens-topology')).toContainText('Topology');
    await expect(page.locator('.run-btn')).toContainText('Run experiment');
    await expect(page.locator('.panel-label').first()).toContainText('Control panel');

    const stored = await page.evaluate(
      () => JSON.parse(window.localStorage.getItem('inferencelab.prefs.v1') ?? '{}') as { locale?: string },
    );
    expect(stored.locale).toBe('en');

    await page.reload();
    const skipEn = page.getByRole('button', { name: 'Skip' });
    if (await skipEn.isVisible().catch(() => false)) await skipEn.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('lens-topology')).toContainText('Topology');

    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByTestId('lens-topology')).toContainText('拓扑');
  });
});
