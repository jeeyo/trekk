/** Render PWA icons from public/icon.svg. */
import { readFileSync } from 'node:fs';
import { launch } from './browser';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await launch();
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],
  ['apple-touch-icon.png', 180, 0],
] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<body style="margin:0;background:#0f1512;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`,
  );
  await page.screenshot({ path: `public/${name}`, omitBackground: false });
  await page.close();
}
await browser.close();
console.log('icons written');
