import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('output/qa', { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: 'no-preference',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.luminous-hero[data-scene-ready="true"]').waitFor({ timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `output/qa/3d-${width}.png` });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error(`Horizontal overflow at ${width}px`);
    if (errors.length) throw new Error(errors.join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
}
