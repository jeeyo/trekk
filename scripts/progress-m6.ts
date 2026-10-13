/**
 * Captures one preview frame per preset (with the video overlay) and writes:
 *  - docs/progress/m6-presets.png (contact sheet)
 *  - public/presets/<id>.jpg (thumbnails for the style picker)
 */
import { BASE, contactSheet, launch, mapIdle, phone, scrubTo } from './browser';

const SHOTS = [
  { id: 'chase', name: 'Chase Cam', t: 0.45 },
  { id: 'orbit', name: 'Drone Orbit', t: 0.55 },
  { id: 'flyin', name: 'Fly-in Reveal', t: 0.95 },
  { id: 'elevation', name: 'Elevation Story', t: 0.6 },
  { id: 'topo', name: 'Topo Classic', t: 0.97 },
  { id: 'night', name: 'Night Glow', t: 0.5 },
  { id: 'summit', name: 'Summit Push', t: 0.86 },
  { id: 'minimal', name: 'Minimal Line Art', t: 0.97 },
];
const only = process.argv[2]?.split(',');

const browser = await launch();
try {
  const page = await phone(browser);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '.badge{display:none!important}' });
  await page.getByRole('button', { name: /Zermatt/ }).click();
  await page.getByText('pick a style').click();
  const frames = [];
  for (const s of SHOTS) {
    if (only && !only.includes(s.id)) continue;
    await page.getByRole('option', { name: s.name }).click();
    await page.getByText('Preview this style').click();
    await mapIdle(page);
    await scrubTo(page, s.t);
    await mapIdle(page);
    const path = `docs/progress/m6-frame-${s.id}.png`;
    await page.locator('.map-frame').screenshot({ path });
    await page
      .locator('.map-frame')
      .screenshot({ path: `public/presets/${s.id}.jpg`, type: 'jpeg', quality: 78, scale: 'css' });
    frames.push({ path, label: s.name, sub: `t = ${Math.round(s.t * 100)}%` });
    console.log('captured', s.id);
    await page.getByRole('button', { name: 'Back' }).click();
  }
  await contactSheet(browser, frames, 'docs/progress/m6-presets.png', {
    columns: 4,
    width: 250,
    title:
      'All 8 presets with video overlays (satellite imagery is blocked in this sandbox → terrain relief)',
  });
  console.log('m6 screenshots saved');
} finally {
  await browser.close();
}
