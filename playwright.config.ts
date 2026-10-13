import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 15 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173',
    launchOptions: { executablePath, args },
    trace: 'retain-on-failure',
  },
  projects: [
    // Chromium engine with each phone's viewport, DPR and touch (WebKit isn't bundled here).
    { name: 'iphone-14', use: { ...devices['iPhone 14'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
  ],
});
