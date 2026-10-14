import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('output/qa', { recursive: true });
const browser = await chromium.launch();
const origin = 'http://127.0.0.1:5173';
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('.stage-crown img')?.complete);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/qa/crimson-${width}.png`, fullPage: true });
    await page.screenshot({ path: `output/qa/crimson-hero-${width}.png` });
    await page.locator('.partner-strip').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/qa/crimson-partners-${width}.png` });
    await page.goto(`${origin}/dang-ky`);
    await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    // Validation focuses an input and scrolls it into view; reset before a full-page capture.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `output/qa/crimson-registration-${width}.png`, fullPage: true });
    await page.goto(`${origin}/tai-khoan/dang-nhap`);
    await page.screenshot({ path: `output/qa/crimson-account-${width}.png`, fullPage: true });
    await page.close();
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'no-preference',
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('.stage-crown img')?.complete);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.blur-text > span[aria-hidden]')].every(
      (el) => getComputedStyle(el).opacity === '1',
    ),
  );
  await page.screenshot({ path: 'output/qa/crimson-stage-motion.png' });
} finally {
  await browser.close();
}
