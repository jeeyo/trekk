/**
 * Progress screenshots.
 *   tsx scripts/screenshot.ts page <url> <out.png> [--w 390] [--h 844] [--dpr 3] [--wait <selector>] [--delay ms] [--full]
 *   tsx scripts/screenshot.ts text <in.txt> <out.png> [--title "..."]   # renders terminal output as an image
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const CHROMIUM =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

function flag(args: string[], name: string, def?: string) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

async function main() {
  const [mode, src, out, ...rest] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: GL_ARGS });
  try {
    if (mode === 'text') {
      const title = flag(rest, 'title', '');
      const body = escapeHtml(readFileSync(src, 'utf8'))
        .replace(/(MISS)/g, '<b class="y">$1</b>')
        .replace(/(HIT|passed|✓)/g, '<b class="g">$1</b>')
        .replace(/(429|404|failed|✗)/g, '<b class="r">$1</b>')
        .replace(/^(\$ .*)$/gm, '<span class="c">$1</span>');
      const page = await browser.newPage({
        viewport: { width: 900, height: 200 },
        deviceScaleFactor: 2,
      });
      await page.setContent(`<style>
        body{margin:0;background:#0d1117;color:#c9d1d9;font:14px/1.45 ui-monospace,Menlo,monospace}
        .t{padding:10px 16px;background:#161b22;color:#8b949e;border-bottom:1px solid #30363d}
        pre{margin:0;padding:16px;white-space:pre-wrap}.c{color:#79c0ff}.g{color:#3fb950}.y{color:#d29922}.r{color:#f85149}
      </style><div class="t">${escapeHtml(title)}</div><pre>${body}</pre>`);
      await page.screenshot({ path: out, fullPage: true });
    } else {
      const w = Number(flag(rest, 'w', '390'));
      const h = Number(flag(rest, 'h', '844'));
      const dpr = Number(flag(rest, 'dpr', '3'));
      const page = await browser.newPage({
        viewport: { width: w, height: h },
        deviceScaleFactor: dpr,
        isMobile: w < 600,
        hasTouch: w < 600,
      });
      await page.goto(src, { waitUntil: 'networkidle' });
      const wait = flag(rest, 'wait');
      if (wait) await page.waitForSelector(wait, { timeout: 120_000 });
      await page.waitForTimeout(Number(flag(rest, 'delay', '300')));
      await page.screenshot({ path: out, fullPage: rest.includes('--full') });
    }
    console.log('saved', out);
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('screenshot.ts')) main();
