import { expect, test, type Page } from '@playwright/test';

async function openLab(page: Page): Promise<void> {
  await page.goto('/#/lab');
  const skip = page.getByRole('button', { name: '跳过' });
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await expect(page.locator('.topology-meta')).toBeVisible();
}

test.describe('optimization acceptance', () => {
  test('number fields allow clearing and keep invalid values out of the draft', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: /04 调度参数/ }).click();
    const tokenBudget = page.getByLabel('max_num_batched_tokens', { exact: true });

    await tokenBudget.fill('');
    await expect(tokenBudget).toHaveValue('');
    await tokenBudget.fill('8');
    await expect(tokenBudget).toHaveValue('8');
    await tokenBudget.press('Tab');
    await expect.poll(() => page.evaluate(() => {
      const draft = JSON.parse(window.localStorage.getItem('inferencelab.draft.v1') ?? '{}');
      return draft.runtime?.maxNumBatchedTokens;
    })).toBe(8);

    const kvBudget = page.getByLabel('显式 KV 预算', { exact: true });
    await kvBudget.fill('');
    await kvBudget.press('Tab');
    await expect(kvBudget).toHaveValue('');
    await expect.poll(() => page.evaluate(() => {
      const draft = JSON.parse(window.localStorage.getItem('inferencelab.draft.v1') ?? '{}');
      return draft.runtime?.kvCacheMemoryBytes;
    })).toBeUndefined();
  });

  test('onboarding stays dismissed after reload and can be reopened explicitly', async ({ page }) => {
    await page.goto('/#/lab');
    const dialog = page.getByRole('dialog', { name: '3 分钟引导' });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: '跳过' }).click();
    await expect(dialog).toHaveCount(0);

    await page.reload();
    await expect(page.locator('.topology-meta')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    const preferences = await page.evaluate(() => JSON.parse(
      window.localStorage.getItem('inferencelab.prefs.v1') ?? '{}',
    ));
    expect(preferences.onboardingSeen).toBe(true);

    await page.locator('.help-btn').click();
    await expect(dialog).toBeVisible();
  });

  test('compact header exposes modes at laptop width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLab(page);
    await page.getByTestId('header-more-trigger').click();
    const replay = page.getByRole('button', { name: '实测复盘', exact: true });
    await expect(replay).toBeVisible();
    await replay.click();
    await expect(page.getByTestId('header-more')).toHaveCount(0);

    await page.getByTestId('header-more-trigger').click();
    await expect(page.getByRole('button', { name: '实测复盘', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('mobile more menu preserves navigation and display preferences', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLab(page);
    await page.getByTestId('header-more-trigger').click();
    await page.getByRole('button', { name: '切换到浅色主题', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByTestId('header-more')).toBeVisible();

    await page.getByRole('button', { name: '参考', exact: true }).click();
    await expect(page).toHaveURL(/#\/reference$/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('consent dialog cycles focus and restores it after global Escape', async ({ page }) => {
    await openLab(page);
    await page.getByTestId('scenario-select').selectOption('ascend-a3-glm53-template');
    await expect(page.getByTestId('quality-badge')).toContainText('UNKNOWN');
    await expect(page.locator('.run-btn')).toBeEnabled();
    await page.locator('.run-btn').click();

    const dialog = page.getByRole('dialog', { name: '当前 Plan 含未知数据' });
    const first = dialog.getByRole('button', { name: '仅结构查看' });
    const cancel = dialog.getByRole('button', { name: '取消' });
    await expect(first).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();

    await page.locator('.brand').focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.run-btn')).toBeFocused();
  });
});
