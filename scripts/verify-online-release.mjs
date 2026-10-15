import assert from 'node:assert/strict';
import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Read-only verification of the existing Worker. No login, upload, vote or purchase.
const base = 'https://ftucharm-test.bancotaima1235.workers.dev';
const output = path.resolve('output/git-sync-20261015');
await mkdir(output, { recursive: true });
const result = { checkedAt: new Date().toISOString(), url: base };
const home = await fetch(base, { cache: 'no-store' });
assert.equal(home.status, 200);
const html = await home.text();
result.stylesheets = [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);
assert.ok(result.stylesheets.length);
const styles = await Promise.all(
  result.stylesheets.map(async (file) => {
    const response = await fetch(new URL(file, base));
    assert.equal(response.status, 200);
    return response.text();
  }),
);
assert.ok(
  styles.some((css) => css.includes('data-mobile-scrolling')),
  'Old CSS still deployed',
);
for (const endpoint of ['/api/health', '/api/program']) {
  const response = await fetch(base + endpoint, { cache: 'no-store' });
  assert.equal(response.status, 200, endpoint);
  const data = await response.json();
  if (endpoint === '/api/program') {
    assert.equal(data.data.edition.slug, 'ftucharm-2027');
    result.program = { slug: data.data.edition.slug, timelineEvents: data.data.timeline.length };
  }
}
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    reducedMotion: 'no-preference',
  });
  const blockedWrites = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      blockedWrites.push({ method: request.method(), url: new URL(request.url()).pathname });
      return route.abort();
    }
    if (new URL(request.url()).origin !== base) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.preview-bar')).toHaveCount(0);
  const hero = page.locator('.luminous-hero');
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  const original = await page.locator('.ribbon-field canvas').elementHandle();
  const cdp = await context.newCDPSession(page);
  const swipe = (async () => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 550 }],
    });
    for (let i = 1; i <= 20; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200, y: 550 - i * 16 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  })();
  await expect(page.locator('html')).toHaveAttribute('data-mobile-scrolling', 'true');
  await expect(hero).toHaveAttribute('data-scene-running', 'false');
  await expect(page.locator('.logo-wing-left')).toHaveCSS('animation-play-state', 'paused');
  await swipe;
  assert.ok(await page.evaluate(() => scrollY > 100));
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-scrolling', 'true');
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  assert.ok(
    await page.locator('.ribbon-field canvas').evaluate((node, first) => node === first, original),
  );
  await page.screenshot({ path: path.join(output, 'online-mobile-after.png') });
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Đăng ký thí sinh', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dang-ky$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.preview-bar')).toHaveCount(0);
  assert.deepEqual(blockedWrites, []);
  assert.deepEqual(errors, []);
  result.mobileSwipe = 'PASS: pause/resume, same canvas, native scrolling';
  result.navigation = 'PASS: registration reachable';
  result.writeRequests = blockedWrites.length;
  result.javascriptErrors = errors;
} finally {
  await browser.close();
}
await writeFile(path.join(output, 'online-after.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
