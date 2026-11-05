import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const CALIBRATION_FILE = fileURLToPath(
  new URL('../../../docs/examples/calibration-curves.sample.json', import.meta.url),
);
const TRACE_FILE = fileURLToPath(new URL('../../../docs/examples/standard-trace.sample.json', import.meta.url));

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
  if ((await page.locator('.tl-play').getAttribute('aria-label')) === '暂停') {
    await page.locator('.tl-play').click();
  }
}

async function openReference(page: Page): Promise<void> {
  await page.getByRole('button', { name: '参考', exact: true }).click();
  await expect(page.getByRole('heading', { name: '机制参考' })).toBeVisible();
}

async function backToLab(page: Page): Promise<void> {
  await page.getByRole('button', { name: '工作台', exact: true }).click();
  await expect(page.locator('.topology-meta')).toBeVisible();
}

test.describe('M4/M5 acceptance', () => {
  test('E2E-09 MoE redundancy raises expert residency and exposes hotspot load', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'moe-redundant-demo', 4);
    await expect(page.locator('.topology-meta')).toContainText('EP 组 2');
    await expect(page.locator('.device-tags')).toHaveCount(4);

    await page.locator('[data-testid="lens-memory"]').click();
    const card = page.locator('.moe-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('EP2 · 64 个专家 · top-4');
    await expect(card).toContainText('冗余 4');
    await expect(card).toContainText('冗余副本增加 HBM');
    await expect(card).toContainText('运行后更新');

    await runExperiment(page);
    await expect(card.locator('.expert-load-row')).toHaveCount(8);
    await expect(card).not.toContainText('运行后更新');
    await expect(card).toContainText('不是实测');
  });

  test('E2E-10 PCP adds ranks while DCP reuses TP ranks', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'cp-demo', 4);
    await expect(page.locator('.topology-meta')).toContainText('PCP 组 1');
    await expect(page.locator('.topology-meta')).toContainText('DCP 组 2');
    await expect(page.locator('.device-tags').first()).toContainText('PCP');
    await expect(page.locator('.device-tags').first()).toContainText('DCP');
  });

  test('E2E-11 calibration import upgrades only matched timing metrics', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'toy-4gpu-tp4-basic', 4);
    await openReference(page);

    await page.locator('[data-testid="calibration-file"]').setInputFiles(CALIBRATION_FILE);
    await expect(page.locator('.calibration-list')).toContainText('toy4gpu-prefill-bf16-1024');
    await expect(page.getByText('2 条曲线')).toBeVisible();

    await backToLab(page);
    await expect(page.locator('.calibration-banner')).toContainText('2 条已导入');
    // Calibration changes timing quality, not the work mode.
    await expect(page.locator('.mode-switch button.active')).toHaveText('原理探索');
    await runExperiment(page);

    await page.locator('[data-testid="lens-metrics"]').click();
    const ttft = page.locator('.metric-card').filter({ hasText: 'TTFT' }).first();
    await expect(ttft.locator('.quality-tag')).toHaveText('CALIBRATED');
    await ttft.click();
    const inspector = page.locator('[data-testid="inspector"]');
    await expect(inspector).toContainText('校准曲线');
    await expect(inspector).toContainText('±12%');
    await expect(inspector).toContainText('影响路径');
    const preemptions = page.locator('.metric-card').filter({ hasText: '抢占次数' }).first();
    await expect(preemptions.locator('.quality-tag')).toHaveText('EXACT');
  });

  test('E2E-12 trace import drives replay mode and keeps observed metrics separate', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'toy-4gpu-tp4-basic', 4);
    await openReference(page);

    await page.locator('[data-testid="trace-file"]').setInputFiles(TRACE_FILE);
    await expect(page.locator('.ref-card').filter({ hasText: '标准 Trace' })).toContainText('3 个请求 · 2 条观测');
    await expect(page.locator('.ref-card').filter({ hasText: '标准 Trace' })).toContainText('仅请求级观测');

    await backToLab(page);
    await expect(page.locator('.trace-banner').first()).toContainText('3 请求');
    await expect(page.locator('.trace-banner').first()).toContainText('仅请求级观测');
    await expect(page.locator('.mode-switch button.active')).toHaveText('实测复盘');
    await runExperiment(page);
    // Observed request metrics do not upgrade the simulated stage timings: the
    // run-level badge must stay SYNTHETIC while the observed strip says OBSERVED.
    await expect(page.locator('[data-testid="quality-badge"]')).toContainText('SYNTHETIC');

    await page.locator('[data-testid="lens-metrics"]').click();
    await expect(page.locator('.waterfall-row')).toHaveCount(3);
    const observed = page.locator('.observed-strip');
    await expect(observed).toBeVisible();
    await expect(observed).toContainText('实测 TTFT P50');
    await expect(observed).toContainText('实测 TPOT P50');
    // Median of the two explicit observed TPOT values (41 and 39 µs).
    await expect(observed).toContainText('40.0 µs');
    await expect(observed.locator('.quality-tag').first()).toHaveText('OBSERVED');
    await observed.locator('.metric-card').first().click();
    await expect(page.locator('[data-testid="inspector"]')).toContainText('OBSERVED');
    await expect(page.locator('[data-testid="inspector"]')).toContainText('不参与仿真成本模型拟合');
    await page.locator('.waterfall-row').first().click();
    const inspector = page.locator('[data-testid="inspector"]');
    await expect(inspector).toContainText('实测 TTFT');
    await expect(inspector).toContainText('5.20 ms · 实测');
    await expect(inspector).toContainText('不混用观测值');
  });

  test('E2E-13 PP adds stages and SP reuses TP ranks', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'pp-sp-demo', 4);
    await expect(page.locator('.topology-meta')).toContainText('PP Stage 2');
    await expect(page.locator('.topology-meta')).toContainText('SP 组 2');
    await expect(page.locator('.device-tags').first()).toContainText('PP0');
    await expect(page.locator('.device-tags').first()).toContainText('SP');

    await page.locator('[data-testid="lens-memory"]').click();
    const pipeline = page.locator('.pipeline-card');
    await expect(pipeline).toBeVisible();
    await expect(pipeline).toContainText('PP2 · 2 个 Stage');
    await expect(pipeline).toContainText('气泡');
    await expect(pipeline).toHaveAttribute('data-pp-size', '2');
    const bubble = Number(await pipeline.getAttribute('data-bubble'));
    expect(bubble).toBeGreaterThan(0);
    expect(bubble).toBeLessThan(1);

    const sp = page.locator('.sp-card');
    await expect(sp).toBeVisible();
    await expect(sp).toContainText('SP2 · 2 个组');
    await expect(sp).toContainText('设备增量');
    await expect(sp).toContainText('Workspace 不随之切分');
    await expect(sp).toHaveAttribute('data-sp-size', '2');
    expect(Number(await sp.getAttribute('data-sp-collective'))).toBeGreaterThan(0);
  });

  test('E2E-14 MLA and SFA/DSA expose explicit KV layouts', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'mla-dcp-demo', 2);
    await page.locator('[data-testid="lens-memory"]').click();
    const kvCard = page.locator('.memory-card').filter({ hasText: 'KV Cache' }).first();
    await expect(kvCard.locator('.quality-tag')).toHaveText('SYNTHETIC');
    await expect(kvCard.locator('[data-testid="kv-bytes-per-token"]')).toHaveText('13.8 KB');
    await expect(kvCard).not.toContainText('KV 布局 Unknown');

    await page.locator('[data-testid="lens-topology"]').click();
    await selectPreset(page, 'sfa-dsa-demo', 4);
    await page.locator('[data-testid="lens-memory"]').click();
    await expect(kvCard.locator('.quality-tag')).toHaveText('SYNTHETIC');
    await expect(kvCard.locator('[data-testid="kv-bytes-per-token"]')).not.toHaveText('N/A');
  });

  test('E2E-15 MTP charges draft tokens and shows acceptance-based speedup', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'speculative-mtp-demo', 4);
    await page.locator('[data-testid="lens-memory"]').click();
    const card = page.locator('.speculative-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('MTP');
    await expect(card).toContainText('4 个 Draft · 接受率 60%');
    await expect(card).toContainText('3.40');
    await expect(card).toContainText('2.13×');
    await expect(card).toContainText('Token 预算');
    await expect(card).toContainText('+4');
    await expect(card.locator('[data-testid="spec-support"]')).toHaveText('SYNTHETIC');

    await runExperiment(page);
    await page.locator('[data-testid="lens-scheduler"]').click();
    const budget = page.locator('.kpi').filter({ hasText: 'Token 预算' });
    await expect(budget.locator('.kpi-value')).toContainText('/4096');
    await page.locator('[data-testid="lens-metrics"]').click();
    const finished = page.locator('.kpi').filter({ hasText: '完成 / 总数' });
    await expect(finished.locator('.kpi-value')).toHaveText('4/4');
  });

  test('E2E-16 DSpark stays unknown in the teaching adapter', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'speculative-dspark-demo', 4);
    await page.locator('[data-testid="lens-memory"]').click();
    const card = page.locator('.speculative-card');
    await expect(card).toContainText('DSPARK');
    await expect(card.locator('[data-testid="spec-support"]')).toHaveText('UNKNOWN');
    await expect(card.locator('[data-testid="spec-speedup"]')).toHaveText('N/A');
    await expect(card).toContainText('适配器未声明支持');
    const kpi = page.locator('.kpi').filter({ hasText: 'DSPARK 期望加速' });
    await expect(kpi.locator('.kpi-value')).toContainText('N/A');

    await runExperiment(page);
    await page.getByRole('button', { name: /06 校验与证据/ }).click();
    await expect(page.locator('[data-testid="plan-issues"]')).toContainText('DSPARK');
    await expect(page.locator('[data-testid="plan-issues"]')).toContainText('unknown');
  });

  test('E2E-17 unknown template requires an explicit consent choice', async ({ page }) => {
    await openLab(page);
    await selectPreset(page, 'ascend-a3-glm53-template', 16);
    await expect(page.locator('[data-testid="quality-badge"]')).toContainText('UNKNOWN');
    await expect(page.locator('.run-btn')).toBeEnabled();
    await page.locator('.run-btn').click();

    const dialog = page.getByRole('dialog', { name: '当前 Plan 含未知数据' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '仅结构查看' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: '使用已标注合成参数模拟' })).toBeDisabled();
    await expect(dialog).toContainText('无法建立 KV Block 池');

    await dialog.getByRole('button', { name: '仅结构查看' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.run-btn')).toBeEnabled();
  });
});
