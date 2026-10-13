import { BASE, launch, mapIdle, phone, scrubTo } from './browser';

const browser = await launch();
try {
  const page = await phone(browser);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'docs/progress/m3-1-upload.png' });

  await page.getByRole('button', { name: /Zermatt/ }).click();
  await page.getByText('Looks good').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/progress/m3-2-track.png', fullPage: true });

  await page.getByText('Looks good').click();
  await mapIdle(page);
  await scrubTo(page, 0.62);
  await mapIdle(page);
  await page.screenshot({ path: 'docs/progress/m3-3-preview.png' });
  console.log('m3 screenshots saved');
} finally {
  await browser.close();
}
