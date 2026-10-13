import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('output/qa', { recursive: true });
const browser = await chromium.launch();
for (const [name, width, height] of [
  ['desktop', 1440, 1050],
  ['mobile', 390, 844],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `output/qa/${name}.png`, fullPage: name === 'mobile' });
  await page.close();
}
await browser.close();
