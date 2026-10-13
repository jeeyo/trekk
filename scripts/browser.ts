import { chromium, type Browser, type Page } from '@playwright/test';
import { CHROMIUM, GL_ARGS } from './screenshot';

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

export async function launch(): Promise<Browser> {
  return chromium.launch({ executablePath: CHROMIUM, args: GL_ARGS });
}

export async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  return page;
}

/** Wait for the preview map to finish loading tiles. */
export async function mapIdle(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __trekk?: { scene?: unknown } }).__trekk?.scene,
    null,
    {
      timeout: 120_000,
    },
  );
  await page.evaluate(() =>
    (
      window as unknown as { __trekk: { scene: { idle(ms?: number): Promise<void> } } }
    ).__trekk.scene.idle(60_000),
  );
  await page.waitForTimeout(400);
}

export async function scrubTo(page: Page, fraction: number) {
  await page.locator('input[type=range]').fill(String(Math.round(fraction * 1000)));
}
