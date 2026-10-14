import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('brand, retired news and complete contestant profiles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.site-header .brand-logo')).toBeVisible();
  await expect(page.locator('.hero-year')).toHaveText('(2027)');
  await expect(page.getByRole('link', { name: 'Tin tức', exact: true })).toHaveCount(0);
  expect(
    await page
      .locator('html')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--primary').trim()),
  ).toBe('#a7090e');
  await page.goto('/thi-sinh/thi-sinh-minh-hoa-2');
  for (const label of ['Tên', 'Khóa', 'Lớp', 'Chiều cao', 'SBD'])
    await expect(page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible();
  await expect(page.locator('dd').filter({ hasText: '178 cm' })).toBeVisible();
  await page.getByRole('link', { name: 'Khám phá bình chọn' }).click();
  await expect(page).toHaveURL(/hang-muc=male/);
  await expect(page.getByRole('button', { name: 'Nam được yêu thích nhất' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.vote-grid h2')).toHaveText([
    'Thí sinh 02',
    'Thí sinh 04',
    'Thí sinh 06',
  ]);
  await page.getByRole('button', { name: 'Nữ được yêu thích nhất' }).click();
  await expect(page.locator('.vote-grid h2')).toHaveText([
    'Thí sinh 01',
    'Thí sinh 03',
    'Thí sinh 05',
  ]);
  await expect(page.getByRole('button', { name: 'Chọn thí sinh' }).first()).toBeDisabled();
  await page.goto('/tin-tuc');
  await expect(page.getByRole('heading', { name: 'Trang này chưa được tìm thấy.' })).toBeVisible();
});

test('new profile and category controls pass accessibility checks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/thi-sinh/thi-sinh-minh-hoa-1', '/binh-chon?hang-muc=male']) {
    await page.goto(path);
    await page.locator('h1').waitFor();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
});

test('motion runs, stops, resumes and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const logo = page.locator('.stage-crown');
  await expect(logo).toBeVisible();
  const before = await logo.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.ribbon-field canvas')).toHaveCount(0);
  await expect.poll(() => logo.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
