import { test, expect } from './isolated-test';

test('crimson stage responds to scroll in both directions and pauses every layer', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const stage = page.locator('.luminous-hero .stage-atmosphere');
  const petal = stage.locator('.stage-petal').first();
  await expect(stage).toHaveAttribute('data-running', 'true');
  await expect(petal).toBeAttached();
  // The fallback animates only when WebGL is unavailable; the GPU scene owns motion otherwise.
  await expect(page.locator('.luminous-hero')).toHaveAttribute('data-scene-ready', 'true');
  await expect(stage).toBeHidden();
  const canvas = page.locator('.ribbon-field canvas');
  const initial = await canvas.screenshot();
  await expect.poll(async () => (await canvas.screenshot()).equals(initial)).toBe(false);
  expect(
    await stage
      .locator('.stage-petal')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== 'none').length),
  ).toBe(isMobile ? 5 : 12);
  const logo = page.locator('.crown-scroll');
  const start = await logo.evaluate((el) => getComputedStyle(el).transform);
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  // Touch layouts keep the logo steady while the page moves; desktop retains parallax.
  if (isMobile)
    await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).toBe(start);
  else
    await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).not.toBe(start);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).toBe(start);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage).toHaveAttribute('data-disabled', 'true');
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(stage).toHaveAttribute('data-running', 'true');
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
  );
  await expect(stage).toHaveAttribute('data-running', 'false');
  await expect
    .poll(() => petal.evaluate((el) => getComputedStyle(el).animationPlayState))
    .toBe('paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(stage).toHaveAttribute('data-disabled', 'true');
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
});

test('blocked WebGL preserves content, dark background and working navigation', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Duyên dáng Ngoại thương/ })).toBeVisible();
  await expect(page.locator('.stage-crown img')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(48, 12, 18)',
  );
  if (isMobile) await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name: 'Vé', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ve$/);
  expect(errors).toEqual([]);
});

test('partner groups stay readable and decorative layers cannot intercept clicks', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const strip = page.getByRole('region', { name: 'Đơn vị tổ chức và đồng hành' });
    await strip.scrollIntoViewIfNeeded();
    await expect(strip.getByRole('img')).toHaveCount(4);
    const emblems = strip.locator('.partner-organizers > image');
    await expect(emblems).toHaveCount(4);
    const boxes = await emblems.evaluateAll((images) =>
      images.map((image) => {
        const box = image.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    for (const box of boxes) {
      expect(Math.abs(box.width - boxes[0].width)).toBeLessThan(1);
      expect(Math.abs(box.height - boxes[0].height)).toBeLessThan(1);
      expect(Math.abs(box.width - box.height)).toBeLessThan(1);
    }

    for (const mark of await strip.getByRole('img').all()) {
      await expect(mark).toBeVisible();
      const bounds = await mark.boundingBox();
      expect(bounds!.width).toBeGreaterThan(100);
    }
    if (width <= 900) {
      const organizers = await strip.locator('.partner-organizers').boundingBox();
      const identity = await strip.locator('.partner-identity').boundingBox();
      const cosmo = await strip.locator('.partner-cosmo').boundingBox();
      const uni = await strip.locator('.partner-uni').boundingBox();
      expect(identity!.y).toBeGreaterThanOrEqual(organizers!.y + organizers!.height);
      expect(Math.abs(cosmo!.y + cosmo!.height / 2 - (uni!.y + uni!.height / 2))).toBeLessThan(1);
      expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await strip.screenshot({ path: `output/logo-strip/original-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('link', { name: 'Đăng ký tỏa sáng' }).click();
  await expect(page).toHaveURL(/\/dang-ky$/);
  await expect(page.locator('.stage-atmosphere')).toHaveCount(0);
});
