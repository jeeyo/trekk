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

/** Lay several images side by side with captions and save as one PNG. */
export async function contactSheet(
  browser: Browser,
  items: { path: string; label: string; sub?: string }[],
  out: string,
  opts: { columns?: number; width?: number; title?: string } = {},
) {
  const { readFileSync } = await import('node:fs');
  const cols = opts.columns ?? items.length;
  const w = opts.width ?? 300;
  const cells = items
    .map((it) => {
      const b64 = readFileSync(it.path).toString('base64');
      return `<figure><img src="data:image/png;base64,${b64}"/><figcaption><b>${it.label}</b>${it.sub ? `<span>${it.sub}</span>` : ''}</figcaption></figure>`;
    })
    .join('');
  const page = await browser.newPage({
    viewport: { width: cols * (w + 16) + 32, height: 400 },
    deviceScaleFactor: 2,
  });
  await page.setContent(`<style>
    body{margin:0;padding:16px;background:#0f1512;color:#eef3ee;font:14px system-ui}
    h1{font-size:18px;margin:0 0 12px;color:#ff7a3d}
    .g{display:grid;grid-template-columns:repeat(${cols},${w}px);gap:16px}
    figure{margin:0} img{width:100%;border-radius:12px;display:block}
    figcaption{margin-top:6px;display:flex;flex-direction:column;gap:2px} figcaption span{color:#9aaba1;font-size:12px}
  </style>${opts.title ? `<h1>${opts.title}</h1>` : ''}<div class="g">${cells}</div>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
}
