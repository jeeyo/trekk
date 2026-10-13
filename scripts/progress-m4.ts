import { BASE, contactSheet, launch, mapIdle, phone, scrubTo } from './browser';

const SHOTS = [
  { id: 'chase', name: 'Chase Cam', t: 0.45 },
  { id: 'orbit', name: 'Drone Orbit', t: 0.55 },
  { id: 'topo', name: 'Topo Classic', t: 0.6 },
];

const browser = await launch();
try {
  const page = await phone(browser);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Zermatt/ }).click();
  await page.getByText('pick a style').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/progress/m4-1-style.png' });

  const frames = [];
  for (const s of SHOTS) {
    await page.getByRole('option', { name: s.name }).click();
    await page.getByText('Preview this style').click();
    await mapIdle(page);
    await scrubTo(page, s.t);
    await mapIdle(page);
    const path = `docs/progress/m4-frame-${s.id}.png`;
    await page.locator('.map-frame').screenshot({ path });
    frames.push({ path, label: s.name, sub: `t = ${Math.round(s.t * 100)}%` });
    await page.getByRole('button', { name: 'Back' }).click();
  }
  await contactSheet(browser, frames, 'docs/progress/m4-2-presets.png', {
    title: 'M4 — first three presets (Zermatt → Hörnlihütte sample)',
  });
  console.log('m4 screenshots saved');
} finally {
  await browser.close();
}
