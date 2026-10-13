import { BASE, launch, mapIdle, phone } from './browser';

const browser = await launch();
try {
  // 1. Track-fix sheet on the GCJ-02 sample
  const page = await phone(browser);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Huangshan/ }).click();
  await page.getByText('pick a style').waitFor();
  await page.screenshot({ path: 'docs/progress/m7-1-track-gcj.png', fullPage: true });
  await page.getByRole('button', { name: /Adjust track/ }).click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'docs/progress/m7-2-fix-sheet.png' });
  await page.getByRole('button', { name: 'Done' }).click();

  // 2. Style picker with rendered thumbnails
  await page.getByText('pick a style').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/progress/m7-3-style-thumbs.png' });

  // 3. Export result (short low-res clip so it finishes on software GL)
  const p2 = await phone(browser);
  await p2.goto(`${BASE}/?clip=1&res=540&nowarm`, { waitUntil: 'networkidle' });
  await p2.getByRole('button', { name: /Zermatt/ }).click();
  await p2.getByText('pick a style').click();
  await p2.getByRole('option', { name: 'Topo Classic' }).click();
  await p2.getByText('Preview this style').click();
  await p2.getByText('Export video').click();
  await p2.getByText('Render video').click();
  await p2.getByTestId('download').waitFor({ timeout: 900_000 });
  await p2.waitForTimeout(1500);
  await p2.screenshot({ path: 'docs/progress/m7-4-export-result.png' });

  // 4. Desktop layout
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    deviceScaleFactor: 1.5,
  });
  const d = await ctx.newPage();
  await d.goto(BASE, { waitUntil: 'networkidle' });
  await d.screenshot({ path: 'docs/progress/m7-5-desktop-upload.png' });
  await d.getByRole('button', { name: /Lobuche/ }).click();
  await d.getByText('pick a style').click();
  await d.getByRole('option', { name: 'Elevation Story' }).click();
  await d.getByText('Preview this style').click();
  await mapIdle(d);
  await d.locator('input[type=range]').fill('550');
  await mapIdle(d);
  await d.screenshot({ path: 'docs/progress/m7-6-desktop-preview.png' });
  console.log('m7 screenshots saved');
} finally {
  await browser.close();
}
