import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Local, read-only fixture build; never exercises the deployed site or database.
const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid measurement label');
const output = new URL('../output/mobile-scroll/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    reducedMotion: 'no-preference',
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForLoadState('networkidle');
  await page.locator('.luminous-hero[data-scene-ready="true"]').waitFor();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  await page.evaluate(() => {
    const samples = { frames: [], longTasks: [], running: true, previous: 0, maxScrollY: 0 };
    window.scrollSamples = samples;
    new PerformanceObserver((list) => {
      samples.longTasks.push(...list.getEntries().map((entry) => entry.duration));
    }).observe({ type: 'longtask' });
    function frame(now) {
      samples.maxScrollY = Math.max(samples.maxScrollY, scrollY);
      if (samples.previous) samples.frames.push(now - samples.previous);
      samples.previous = now;
      if (samples.running) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  const before = await cdp.send('Performance.getMetrics');
  // Touch gestures use the browser's scrolling path, including momentum.
  for (let i = 0; i < 3; i++) {
    for (const down of [true, false]) {
      const startY = down ? 550 : 150;
      const point = (y) => [{ x: 200, y }];
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(startY),
      });
      for (let step = 1; step <= 20; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: point(startY + (down ? -1 : 1) * step * 20),
        });
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
  }
  const after = await cdp.send('Performance.getMetrics');
  const samples = await page.evaluate(() => {
    window.scrollSamples.running = false;
    return window.scrollSamples;
  });
  const frames = samples.frames.sort((a, b) => a - b);
  if (samples.maxScrollY < 100)
    throw new Error('No native scrolling observed; discard this measurement');
  const metrics = {};
  for (const name of [
    'TaskDuration',
    'ScriptDuration',
    'LayoutDuration',
    'RecalcStyleDuration',
    'LayoutCount',
  ]) {
    metrics[name] = Number(
      (
        after.metrics.find((m) => m.name === name).value -
        before.metrics.find((m) => m.name === name).value
      ).toFixed(4),
    );
  }
  const result = {
    label,
    viewport: '390x664 (iPhone 13 emulation)',
    cpuSlowdown: 4,
    gestures: 6,
    maxScrollY: samples.maxScrollY,
    samples: frames.length,
    frameIntervalP95Ms: frames[Math.floor(frames.length * 0.95)],
    framesOver50ms: frames.filter((ms) => ms > 50).length,
    longTasks: samples.longTasks.length,
    longTaskTotalMs: samples.longTasks.reduce((a, b) => a + b, 0),
    metrics,
    note: 'Headless Chromium on this Windows PC; diagnostic comparison, not physical-device FPS or a production load test.',
  };
  await page.screenshot({
    path: new URL(`${label}.png`, output).pathname.replace(/^\/([A-Z]:)/i, '$1'),
  });
  await writeFile(new URL(`${label}.json`, output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
