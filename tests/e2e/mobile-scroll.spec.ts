import { test, expect } from './isolated-test';

test('native mobile swipe pauses decoration, preserves content and resumes without rebuilding WebGL', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(!isMobile, 'Native touch scrolling contract');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const hero = page.locator('.luminous-hero');
  const canvas = page.locator('.ribbon-field canvas');
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  const originalCanvas = await canvas.elementHandle();
  const cdp = await context.newCDPSession(page);
  const swipe = (async () => {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 200, y: 550 }],
    });
    for (let step = 1; step <= 20; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 200, y: 550 - step * 16 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  })();
  await expect(page.locator('html')).toHaveAttribute('data-mobile-scrolling', 'true');
  await expect(hero).toHaveAttribute('data-scene-running', 'false');
  await expect(page.locator('.logo-wing-left')).toHaveCSS('animation-play-state', 'paused');
  await expect(page.locator('.crown-scroll')).toHaveCSS('transform', 'none');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
  await swipe;
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-scrolling', 'true');
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  expect(await canvas.evaluate((node, original) => node === original, originalCanvas)).toBe(true);
  await expect(page.locator('.logo-wing-left')).toHaveCSS('animation-play-state', 'running');
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  );
  await expect(hero).toHaveAttribute('data-scene-running', 'false');
  await page.getByRole('button', { name: 'Về đầu trang', exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(hero).toHaveAttribute('data-scene-running', 'true');
  expect(errors).toEqual([]);
});

test('small screens retain native scrolling, visible content and usable navigation', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Small touch viewport checks');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('heading', { name: 'Hành trình', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Hành trình', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Đăng ký thí sinh', exact: true })
      .click();
    await expect(page).toHaveURL(/\/dang-ky$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});

test('desktop keeps parallax and does not pause decoration for wheel scrolling', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop parallax contract');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-running', 'true');
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-scrolling', 'true');
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-running', 'true');
});
