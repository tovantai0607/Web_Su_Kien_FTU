import { test, expect } from '@playwright/test';

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
  const initial = await petal.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => petal.evaluate((el) => getComputedStyle(el).transform)).not.toBe(initial);
  expect(
    await stage
      .locator('.stage-petal')
      .evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== 'none').length),
  ).toBe(isMobile ? 5 : 12);
  const logo = page.locator('.crown-scroll');
  const start = await logo.evaluate((el) => getComputedStyle(el).transform);
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).not.toBe(start);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).toBe(start);
  await page.getByRole('button', { name: 'Dừng chuyển động', exact: true }).click();
  await expect(stage).toHaveAttribute('data-disabled', 'true');
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bật chuyển động', exact: true }).click();
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
    'rgb(24, 6, 9)',
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
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const strip = page.getByRole('region', { name: 'Đơn vị tổ chức và đồng hành' });
    await strip.scrollIntoViewIfNeeded();
    for (const img of await strip.locator('img').all()) {
      await expect(img).toHaveJSProperty('complete', true);
      expect(await img.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(240);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('link', { name: 'Đăng ký tỏa sáng' }).click();
  await expect(page).toHaveURL(/\/dang-ky$/);
  await expect(page.locator('.stage-atmosphere')).toHaveCount(0);
});
