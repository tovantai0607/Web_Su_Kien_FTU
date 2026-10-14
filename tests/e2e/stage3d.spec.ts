import { test, expect } from '@playwright/test';

test('system reduced motion is respected until the visitor explicitly enables motion', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bật chuyển động', exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Dừng chuyển động', exact: true })).toBeVisible();
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(1);
  const otherTab = await context.newPage();
  await otherTab.emulateMedia({ reducedMotion: 'reduce' });
  await otherTab.goto('/');
  await expect(otherTab.locator('.ribbon-field canvas')).toHaveCount(1);
  await otherTab.close();
  await page.getByRole('button', { name: 'Dừng chuyển động', exact: true }).click();
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bật chuyển động', exact: true })).toBeVisible();
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

test('pause and reduced motion remove the GPU scene and preserve the original logo', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 20000,
  });
  await page.getByRole('button', { name: 'Dừng chuyển động', exact: true }).click();
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect(page.locator('.stage-crown > img')).toHaveCSS('opacity', '1');
  await expect(page.locator('.logo-pieces')).toBeHidden();
  await page.getByRole('button', { name: 'Bật chuyển động', exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true', {
    timeout: 20000,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect(page.locator('.stage-crown > img')).toHaveCSS('opacity', '1');
});
