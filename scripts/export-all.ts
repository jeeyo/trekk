/**
 * Export a short clip of every preset through the real UI and save the MP4s.
 *   BASE_URL=... npx tsx scripts/export-all.ts [seconds] [width] [ids,...]
 */
import { mkdirSync } from 'node:fs';
import { BASE, launch, phone } from './browser';
import { PRESETS } from '../src/presets';

const seconds = Number(process.argv[2] ?? 5);
const width = Number(process.argv[3] ?? 540);
const only = process.argv[4]?.split(',');
mkdirSync('out/videos', { recursive: true });

const browser = await launch();
try {
  for (const p of PRESETS) {
    if (only && !only.includes(p.id)) continue;
    const t0 = Date.now();
    const page = await phone(browser);
    await page.goto(`${BASE}/?clip=${seconds}&res=${width}&noaa`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Zermatt/ }).click();
    await page.getByText('pick a style').click();
    await page.getByRole('option', { name: p.name }).click();
    await page.getByText('Preview this style').click();
    await page.getByText('Export video').click();
    await page.getByText('Render video').click();
    await page.getByTestId('download').waitFor({ timeout: 2 * 3600_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download').click()]);
    await dl.saveAs(`out/videos/trekk-${p.id}.mp4`);
    console.log(`saved ${p.id} in ${Math.round((Date.now() - t0) / 1000)}s`);
    await page.context().close();
  }
} finally {
  await browser.close();
}
