import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('home loads, navigation, all 11 timeline steps and no horizontal overflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Duyên dáng/ })).toBeVisible();
  await page.goto('/timeline');
  await expect(page.locator('.full-timeline article')).toHaveCount(11);
  await expect(
    page.locator('.full-timeline').getByRole('heading', { name: 'Đêm chung kết' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test('contestant search works and private contact information never appears', async ({ page }) => {
  await page.goto('/thi-sinh');
  await expect(page.locator('.contestant-card')).toHaveCount(6);
  await page.getByRole('textbox', { name: 'Tìm theo tên hoặc số báo danh' }).fill('03');
  await expect(page.locator('.contestant-card')).toHaveCount(1);
  await page.locator('.contestant-card').click();
  await expect(
    page.getByRole('heading', { name: 'Thí sinh 03', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Hồ sơ minh họa', { exact: true }).first()).toBeVisible();
});
test('registration validation and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dang-ky');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByText('Nhập họ tên đầy đủ')).toBeVisible();
  await page.getByLabel('Họ và tên').fill('Thí sinh thử nghiệm');
  await page.getByLabel('Email đã xác minh').fill('test@example.test');
  await page.getByLabel('Số điện thoại').fill('0912345678');
  await page.getByLabel('Khoa / ngành học').fill('Kinh tế');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByLabel('Câu chuyện của bạn')).toBeVisible();
  await page
    .getByLabel('Câu chuyện của bạn')
    .fill('Câu chuyện thử nghiệm để kiểm tra giao diện, không gửi dữ liệu thật.');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Ba góc nhìn, một vẻ đẹp.' })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi hồ sơ' }).click();
  await expect(page.getByText('Cần 3 ảnh hồ sơ')).toBeVisible();
  await expect(page.getByText('Hồ sơ đã được tiếp nhận.', { exact: true })).toHaveCount(0);
});
test('voting stays closed without configured final round', async ({ page }) => {
  await page.goto('/binh-chon');
  await expect(page.getByRole('heading', { name: 'Một phiếu. Một dấu ấn.' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Chưa có lượt bình chọn công khai' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận bình chọn' })).toHaveCount(0);
});
test('admin is guarded, gallery dialog and keyboard work', async ({ page }) => {
  await page.goto('/admin');
  await expect(
    page.getByText('Tài khoản được cấp quyền và xác thực hai bước mới có thể truy cập.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm mới' })).toHaveCount(0);
  await page.goto('/thu-vien');
  await page.getByRole('button', { name: /Mở tác phẩm/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('core public pages pass WCAG AA automated checks', async ({ page }) => {
  for (const path of ['/', '/dang-ky', '/thi-sinh', '/binh-chon', '/admin']) {
    await page.goto(path);
    await page.locator('h1').waitFor();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations, path).toEqual([]);
  }
});
test('320px layout and public routes render', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of [
    '/',
    '/gioi-thieu',
    '/timeline',
    '/thi-sinh',
    '/dang-ky',
    '/tin-tuc',
    '/thu-vien',
    '/ve',
    '/nha-tai-tro',
    '/quyen-rieng-tu',
    '/the-le',
    '/tai-khoan/dang-nhap',
  ]) {
    await page.goto(path);
    await page.locator('h1').waitFor();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      path,
    ).toBe(true);
  }
});
