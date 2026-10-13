import { expect, test, type Page } from '@playwright/test';

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function primaryVisible(page: Page, name: RegExp) {
  const btn = page.getByRole('button', { name });
  await expect(btn).toBeVisible();
  const box = (await btn.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test('upload → track → style → preview on a phone', async ({ page }) => {
  await page.goto('/');
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: /Zermatt/ }).click();

  await primaryVisible(page, /pick a style/);
  await expect(page.getByText(/Distance/i).first()).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: /pick a style/ }).click();

  await expect(page.getByRole('option')).toHaveCount(8);
  await page.getByRole('option', { name: 'Elevation Story' }).click();
  await primaryVisible(page, /Preview this style/);
  await page.getByRole('button', { name: /Preview this style/ }).click();

  await expect(page.locator('.map[data-ready]')).toBeVisible({ timeout: 120_000 });
  await primaryVisible(page, /Export video/);
  await noHorizontalScroll(page);
});

test('track-fix sheet: GCJ-02 sample is detected and can be overridden', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Huangshan/ }).click();
  await expect(page.getByText(/Detected GCJ-02/)).toBeVisible();
  await page.getByRole('button', { name: /Adjust track/ }).click();
  await page.getByRole('radio', { name: 'WGS-84' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Detected GCJ-02/)).toHaveCount(0);
});

test('export renders a valid MP4', async ({ page }) => {
  test.skip(!process.env.E2E_EXPORT, 'slow with software WebGL; set E2E_EXPORT=1');
  await page.goto('/?clip=2');
  await page.getByRole('button', { name: /Zermatt/ }).click();
  await page.getByRole('button', { name: /pick a style/ }).click();
  await page.getByRole('button', { name: /Preview this style/ }).click();
  await page.getByRole('button', { name: /Export video/ }).click();
  await page.getByRole('button', { name: /Render video/ }).click();
  const link = page.getByTestId('download');
  await expect(link).toBeVisible({ timeout: 14 * 60_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(dl.suggestedFilename()).toMatch(/\.mp4$/);
});
