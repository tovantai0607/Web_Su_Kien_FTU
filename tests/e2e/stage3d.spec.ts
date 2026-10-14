import { test, expect } from '@playwright/test';

test('reload paints the 3D scene immediately without a fallback frame or removed ornaments', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const models: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.glb')) models.push(request.url());
  });
  await page.addInitScript(() => {
    const frames: { ready: boolean; fallbackVisible: boolean }[] = [];
    Object.assign(window, { stageStartupFrames: frames });
    const sample = () => {
      const hero = document.querySelector<HTMLElement>('.luminous-hero');
      const fallback = hero?.querySelector<HTMLElement>(':scope > .stage-atmosphere');
      if (hero && fallback) {
        frames.push({
          ready: hero.dataset.sceneReady === 'true',
          fallbackVisible: getComputedStyle(fallback).visibility !== 'hidden',
        });
      }
      if (frames.length < 30) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (let i = 0; i < 2; i++) {
    if (i) await page.reload();
    else await page.goto('/');
    await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true');
    await expect(page.locator('.brand')).toHaveText('FTUCHARM');
    await expect(page.getByRole('button', { name: 'Dừng chuyển động', exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'on');
    await expect(page.locator('.luminous-hero .stage-pearl, .crown-orbit')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(window, 'stageStartupFrames').length))
      .toBe(30);
    const frames = await page.evaluate(() => Reflect.get(window, 'stageStartupFrames'));
    expect(frames).toHaveLength(30);
    expect(
      frames.every(
        (frame: { ready: boolean; fallbackVisible: boolean }) =>
          frame.ready && !frame.fallbackVisible,
      ),
    ).toBe(true);
    const canvas = page.locator('.ribbon-field canvas');
    const first = await canvas.screenshot();
    await expect.poll(async () => (await canvas.screenshot()).equals(first)).toBe(false);
  }
  expect(models).toEqual([]);
});

test('system reduced motion is respected until the visitor explicitly enables motion', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Dừng chuyển động', exact: true })).toHaveCount(0);
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bật hiệu ứng cho trang này', exact: true }).click();
  await page.getByRole('button', { name: 'Về đầu trang', exact: true }).click();
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 20000,
  });
  const part = page.locator('.logo-wing-left');
  const initial = await part.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => part.evaluate((el) => getComputedStyle(el).transform)).not.toBe(initial);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dừng chuyển động', exact: true })).toHaveCount(0);
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(1);
  const otherTab = await context.newPage();
  await otherTab.emulateMedia({ reducedMotion: 'reduce' });
  await otherTab.goto('/');
  await expect(otherTab.locator('.ribbon-field canvas')).toHaveCount(1);
  await otherTab.close();
  await page.evaluate(() => localStorage.removeItem('ftucharm-motion-override'));
  await page.reload();
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dừng chuyển động', exact: true })).toHaveCount(0);
});

test('3D scene renders moving pixels, stops offscreen and falls back after context loss', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const hero = page.locator('.luminous-hero');
  const canvas = page.locator('.ribbon-field canvas');
  await expect(hero).toHaveAttribute('data-scene-ready', 'true', { timeout: 20000 });
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  const first = await canvas.screenshot();
  await expect.poll(async () => (await canvas.screenshot()).equals(first)).toBe(false);
  const left = page.locator('.logo-wing-left');
  const start = await left.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => left.evaluate((el) => getComputedStyle(el).transform)).not.toBe(start);
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  );
  await expect(hero).toHaveAttribute('data-scene-running', 'false');
  await expect
    .poll(() => left.evaluate((el) => getComputedStyle(el).animationPlayState))
    .toBe('paused');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  await canvas.evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(hero).not.toHaveAttribute('data-scene-ready', 'true');
  await expect(page.locator('.luminous-hero > .stage-atmosphere')).toBeVisible();
  await page.getByRole('link', { name: 'Đăng ký tỏa sáng' }).click();
  await expect(page).toHaveURL(/\/dang-ky$/);
  expect(errors).toEqual([]);
});

test('system reduced motion removes the GPU scene and preserves the original logo', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 20000,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect(page.locator('.stage-crown > img')).toHaveCSS('opacity', '1');
  await expect(page.locator('.logo-pieces')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 20000,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect(page.locator('.stage-crown > img')).toHaveCSS('opacity', '1');
});
