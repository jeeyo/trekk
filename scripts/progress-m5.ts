import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { BASE, contactSheet, launch, phone } from './browser';

const preset = process.argv[2] ?? 'Chase Cam';
const clip = Number(process.argv[3] ?? 5);
const res = process.argv[4] ? `&res=${process.argv[4]}` : '';
mkdirSync('out', { recursive: true });
const browser = await launch();
try {
  const page = await phone(browser);
  page.on(
    'console',
    (m) =>
      m.text().startsWith('[export]') &&
      console.log(new Date().toISOString().slice(11, 19), m.text()),
  );
  page.on('crash', () => console.log('PAGE CRASHED'));
  await page.goto(`${BASE}/?clip=${clip}${res}&debugExport`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Zermatt/ }).click();
  await page.getByText('pick a style').click();
  await page.getByRole('option', { name: preset }).click();
  await page.getByText('Preview this style').click();
  await page.getByText('Export video').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/progress/m5-1-export.png' });
  await page.getByText('Render video').click();
  await page.getByText('Rendering frames').waitFor({ timeout: 1_800_000 });
  await page.waitForFunction(
    () => {
      const s = document.querySelector('.progress-row strong')?.textContent ?? '0';
      return parseInt(s) >= 50;
    },
    null,
    { timeout: 3_600_000 },
  );
  await page.screenshot({ path: 'docs/progress/m5-2-rendering.png' });
  const t0 = Date.now();
  await page.getByTestId('download').waitFor({ timeout: 3_600_000 });
  console.log('render finished, waited', (Date.now() - t0) / 1000, 's after 50%');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/progress/m5-3-result.png' });
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download').click(),
  ]);
  const file = 'out/m5-export.mp4';
  await dl.saveAs(file);

  const probe = execFileSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-count_frames',
    '-show_entries',
    'stream=codec_name,profile,width,height,pix_fmt,avg_frame_rate,nb_read_frames:format=duration,size',
    '-of',
    'default=noprint_wrappers=1',
    file,
  ]).toString();
  console.log(probe);
  const frames = [0.1, 0.35, 0.6, 0.95].map((f, i) => {
    const path = `out/m5-frame-${i}.png`;
    execFileSync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-ss',
      String(f * clip),
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      'scale=540:-1',
      path,
    ]);
    return {
      path,
      label: `${(f * clip).toFixed(1)} s`,
      sub: f === 0.1 ? 'intro' : f === 0.95 ? 'outro' : 'following',
    };
  });
  await contactSheet(browser, frames, 'docs/progress/m5-4-mp4-frames.png', {
    title: `Frames decoded from the exported MP4 (${preset}, ${clip}s clip)`,
    width: 260,
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync('out/m5-ffprobe.txt', `$ ffprobe out/m5-export.mp4\n${probe}`);
} finally {
  await browser.close();
}
