// Local-only browser smoke measurement, not a load test or field CWV certification.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:5173';
const label = process.argv[2] ?? 'frontend';
if (!/^[a-z0-9-]+$/.test(label))
  throw new Error('Measurement label must use lowercase letters, numbers or hyphens.');
await mkdir('output/qa', { recursive: true });
const browser = await chromium.launch();
const report = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'no-preference',
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.addInitScript(() => {
      window.__measure = { lcp: 0, cls: 0, longestTask: 0 };
      let windowStart = 0,
        lastShift = 0,
        cluster = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__measure.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          if (entry.startTime - lastShift > 1000 || entry.startTime - windowStart > 5000) {
            cluster = 0;
            windowStart = entry.startTime;
          }
          cluster += entry.value;
          lastShift = entry.startTime;
          window.__measure.cls = Math.max(cluster, window.__measure.cls);
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          window.__measure.longestTask = Math.max(window.__measure.longestTask, entry.duration);
      }).observe({ type: 'longtask', buffered: true });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await page.locator('.stage-crown img').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3000);
    report.push({
      viewport,
      cpuSlowdown: 4,
      cache: 'disabled',
      network: 'local, unthrottled',
      errors,
      ...(await page.evaluate(() => ({
        ...window.__measure,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        resources: performance
          .getEntriesByType('resource')
          .map((entry) => ({ path: new URL(entry.name).pathname, bytes: entry.encodedBodySize })),
      }))),
    });
    await page.screenshot({ path: `output/qa/${label}-${viewport.width}.png` });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile('output/qa/frontend-performance.json', JSON.stringify(report, null, 2));
await writeFile(`output/qa/${label}-performance.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    report.map(({ resources, ...entry }) => ({
      ...entry,
      resourceBytes: resources.reduce((sum, r) => sum + r.bytes, 0),
    })),
    null,
    2,
  ),
);
