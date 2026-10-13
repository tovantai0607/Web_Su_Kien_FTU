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
  await expect(page.getByLabel('Trường', { exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: 'Ảnh hồ sơ' })).toBeVisible();
  await page.getByRole('button', { name: 'Gửi hồ sơ' }).click();
  await expect(page.getByText('Cần 3 ảnh hồ sơ')).toBeVisible();
  await expect(page.getByLabel('Ảnh thẻ sinh viên FTU', { exact: true })).toBeVisible();
  await expect(page.getByText('Cần ảnh thẻ sinh viên FTU', { exact: true })).toBeVisible();
  await expect(page.getByText('Hồ sơ đã được tiếp nhận.', { exact: true })).toHaveCount(0);
});

test('tribute, sponsor slots and motion control are accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Lê Phương Nghi', exact: true })).toBeAttached();
  await expect(page.locator('.sponsor-placeholders .sponsor-tile')).toHaveCount(4);
  await page.getByRole('button', { name: 'Dừng chuyển động', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(page.getByRole('link', { name: 'Facebook FTUCharm', exact: true })).toHaveAttribute(
    'href',
    'https://www.facebook.com/ftucharm.duyendangngoaithuong',
  );
});
test('voting stays closed without configured final round', async ({ page }) => {
  await page.goto('/binh-chon');
  await expect(page.getByRole('heading', { name: 'Bình chọn', level: 1 })).toBeVisible();
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
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of [
    '/',
    '/dang-ky',
    '/thi-sinh',
    '/binh-chon',
    '/admin',
    '/ve',
    '/ve/ban-ket-demo',
    '/ve/chung-ket-demo',
    '/thu-vien',
    '/tai-khoan/dang-nhap',
    '/tai-khoan/dang-ky',
    '/tai-khoan/quen-mat-khau',
    '/tai-khoan/dat-lai-mat-khau',
  ]) {
    await page.goto(path);
    await page.locator('h1').waitFor();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(scan.violations, path).toEqual([]);
  }
});
test('ticket details remain viewable before sale opens, without reserving', async ({ page }) => {
  await page.goto('/ve');
  await page.getByRole('link', { name: 'Xem chi tiết' }).first().click();
  await expect(page).toHaveURL(/\/ve\/ban-ket-demo$/);
  await expect(
    page.getByRole('heading', { name: 'Đêm bán kết · Minh họa', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Sắp mở bán', { exact: true })).toBeVisible();
  await expect(page.locator('.sales-seat:enabled')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Giữ ghế', exact: true })).toBeDisabled();
});
test('ticket seat selection supports keyboard and stops at ten in preview', async ({ page }) => {
  await page.goto('/ve/chung-ket-demo');
  const seats = page.locator('.sales-seat:enabled');
  await seats.first().focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.sales-seat[aria-pressed="true"]')).toHaveCount(1);
  for (let i = 0; i < 9; i++)
    await page.locator('.sales-seat[aria-pressed="false"]:enabled').first().click();
  await expect(page.locator('.sales-seat[aria-pressed="true"]')).toHaveCount(10);
  await expect(page.locator('.sales-seat[aria-pressed="false"]:enabled')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Giữ ghế', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('reference hero copy and ticket purchase remain honest', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('FTUCHARM');
  await expect(page.locator('.hero-description')).toHaveText(
    'Có một vẻ đẹp chỉ thuộc về bạn.Có một sân khấu chờ bạn viết nên câu chuyện.',
  );
  await expect(page.getByRole('link', { name: 'Đăng ký tỏa sáng' })).toHaveAttribute(
    'href',
    '/dang-ky',
  );
  await expect(page.getByRole('timer')).toHaveCount(0);
  await page.goto('/ve');
  await page.getByRole('link', { name: 'Xem chi tiết' }).last().click();
  await expect(page.getByRole('button', { name: 'Giữ ghế', exact: true })).toBeDisabled();
  await expect(page.locator('.sales-seat:enabled').first()).toBeVisible();
});

test('gallery supports keyboard, slide status and lightbox dismissal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/thu-vien');
  const gallery = page.getByRole('region', { name: 'Thư viện FTUCharm' });
  await gallery.focus();
  await page.keyboard.press('ArrowRight');
  await expect(gallery.getByRole('status')).toHaveText('2 / 2');
  await expect(gallery.getByRole('button', { name: 'Ảnh tiếp theo' })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(gallery.getByRole('status')).toHaveText('1 / 2');
  await gallery.getByRole('button', { name: /Mở tác phẩm/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
    '/tai-khoan/dang-ky',
    '/tai-khoan/quen-mat-khau',
    '/tai-khoan/dat-lai-mat-khau',
  ]) {
    await page.goto(path);
    await page.locator('h1').waitFor();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      path,
    ).toBe(true);
  }
});

test('account signup has confirmation, password visibility and no preview write', async ({
  page,
}) => {
  await page.goto('/tai-khoan/dang-ky');
  await page.getByLabel('Email', { exact: true }).fill('preview@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Cụm từ dài 2026');
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill('different');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByText('Mật khẩu chưa khớp.')).toBeVisible();
  await page.getByRole('button', { name: 'Hiện mật khẩu', exact: true }).click();
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill('Cụm từ dài 2026');
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page.getByText('Bản xem trước không tạo tài khoản.')).toBeVisible();
});

test('crown responds to scroll and becomes static when motion is paused', async ({ page }) => {
  await page.goto('/');
  await page.locator('.stage-crown img').waitFor();
  await expect(page.locator('.stage-crown img')).toHaveJSProperty('complete', true);
  const before = await page
    .locator('.crown-scroll')
    .evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(500);
  const after = await page
    .locator('.crown-scroll')
    .evaluate((el) => getComputedStyle(el).transform);
  expect(after).not.toBe(before);
  await page.getByRole('button', { name: 'Dừng chuyển động', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  expect(
    await page.locator('.stage-crown').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.crown-scroll').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
});
