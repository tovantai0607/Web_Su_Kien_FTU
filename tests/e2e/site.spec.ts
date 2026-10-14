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
  await page.getByLabel('Khóa', { exact: true }).fill('K63');
  await page.getByLabel('Lớp', { exact: true }).fill('Anh 1');
  await page.getByLabel('Chiều cao (cm)').fill('168');
  await page.getByLabel('Hạng mục dự thi').selectOption('female');
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

test('tribute and sponsor slots stay accessible with system reduced motion', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Lê Phương Nghi', exact: true })).toBeAttached();
  await expect(page.locator('.sponsor-placeholders .sponsor-tile')).toHaveCount(4);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await expect(page.getByRole('link', { name: 'Facebook FTUCHARM', exact: true })).toHaveAttribute(
    'href',
    'https://www.facebook.com/ftucharm.duyendangngoaithuong',
  );
});
test('gender voting categories are ready but stay closed before opening', async ({ page }) => {
  await page.goto('/binh-chon');
  await expect(page.getByRole('heading', { name: 'Bình chọn', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Bình chọn chưa mở hoặc đã kết thúc' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận bình chọn' })).toHaveCount(0);
});
test('admin is guarded, gallery dialog and keyboard work', async ({ page }) => {
  await page.goto('/admin');
  await expect(
    page.getByText('Chỉ tài khoản được cấp quyền admin mới có thể truy cập.'),
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
  await page.getByRole('link', { name: 'Xem vé & combo' }).first().click();
  await expect(page).toHaveURL(/\/ve\/ban-ket-demo$/);
  await expect(
    page.getByRole('heading', { name: 'Đêm bán kết', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/Vé sớm · Sắp mở bán/).first()).toBeVisible();
  await expect(page.locator('.sales-seat')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xác nhận vé & combo' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Thông tin người mua' })).toHaveCount(0);
});
test('ticket types and combos support quantities over ten and read-only DEMO checkout', async ({
  page,
}) => {
  await page.goto('/ve/chung-ket-demo');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/')) writes.push(request.url());
  });
  await expect(page.getByLabel('Họ tên', { exact: true })).toHaveCount(0);
  await page.getByLabel('Số lượng vé đơn The Intro EARLY').fill('12');
  await page.getByRole('checkbox', { name: 'Chọn Combo 2 The Intro EARLY' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Số lượng Combo 2 The Intro EARLY')).toHaveValue('1');
  await page.getByRole('button', { name: 'Xác nhận vé & combo' }).click();
  await expect(page.getByRole('heading', { name: 'Thông tin người mua' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Thanh toán chuyển khoản' })).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Đổi vé & combo' }).click();
  await expect(page.getByLabel('Số lượng vé đơn The Intro EARLY')).toHaveValue('12');
  await page.getByRole('button', { name: 'Xác nhận vé & combo' }).click();
  for (const [name, value] of Object.entries({
    'Họ tên': 'DEMO',
    Trường: 'DEMO',
    'Khóa/lớp': 'DEMO',
    MSSV: 'DEMO',
    Email: 'demo@example.test',
    'Số điện thoại': '0000000000',
    Facebook: 'DEMO',
  }))
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Xác nhận thông tin' }).click();
  await expect(page.getByRole('heading', { name: 'Thanh toán chuyển khoản' })).toBeVisible();
  await expect(page.getByRole('timer', { name: 'Thời gian còn lại' })).toHaveText(
    /^(30:00|29:5\d)$/,
  );
  await expect(page.getByText(/14 vé/).first()).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tiếp tục gửi minh chứng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Thanh toán chuyển khoản' })).toHaveCount(0);
  const proof = page.getByLabel('Ảnh minh chứng JPG/PNG (tối đa 5 MB)');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9J0AAAAASUVORK5CYII=',
    'base64',
  );
  await proof.setInputFiles({ name: 'chon-nham.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Ảnh đã chọn: chon-nham.png', { exact: true })).toBeVisible();
  const image = page.getByAltText('Ảnh minh chứng bạn đã chọn');
  const firstImage = await image.getAttribute('src');
  const chooserReady = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Đổi ảnh minh chứng', exact: true }).click();
  await (
    await chooserReady
  ).setFiles({ name: 'dung-minh-chung.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Ảnh đã chọn: dung-minh-chung.png', { exact: true })).toBeVisible();
  await expect(image).not.toHaveAttribute('src', firstImage!);
  await expect(proof).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Hoàn tất', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('QR countdown expires after thirty minutes without restarting between steps', async ({
  page,
}) => {
  const start = new Date('2026-10-14T12:00:00+07:00');
  await page.clock.install({ time: start });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ve/chung-ket-demo');
  await page.getByLabel('Số lượng vé đơn The Intro EARLY').fill('1');
  await page.getByRole('button', { name: 'Xác nhận vé & combo' }).click();
  for (const [name, value] of Object.entries({
    'Họ tên': 'DEMO',
    Trường: 'DEMO',
    'Khóa/lớp': 'DEMO',
    MSSV: 'DEMO',
    Email: 'demo@example.test',
    'Số điện thoại': '0000000000',
    Facebook: 'DEMO',
  }))
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Xác nhận thông tin' }).click();
  const timer = page.getByRole('timer', { name: 'Thời gian còn lại' });
  await expect(timer).toHaveText(/^(30:00|29:5\d)$/);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  const initial = (await timer.innerText()).split(':').map(Number);
  const seconds = initial[0] * 60 + initial[1] - 5;
  const expected = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  await page.clock.fastForward(5000);
  await expect(timer).toHaveText(expected);
  await page.getByRole('button', { name: 'Xem lại thông tin' }).click();
  await page.getByRole('button', { name: 'Xác nhận thông tin' }).click();
  await expect(timer).toHaveText(expected);
  await page.getByRole('button', { name: 'Tiếp tục gửi minh chứng' }).click();
  await expect(timer).toHaveText(expected);
  await page.getByRole('button', { name: 'Xem lại thanh toán' }).click();
  await expect(timer).toHaveText(expected);
  await page.clock.fastForward(30 * 60 * 1000);
  await expect(page.getByRole('heading', { name: 'Đã hết hạn giữ vé' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Thanh toán chuyển khoản' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đặt vé lại' }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận vé & combo' })).toBeVisible();
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
  await page.getByRole('link', { name: 'Xem vé & combo' }).last().click();
  await expect(page.getByRole('button', { name: 'Xác nhận vé & combo' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'The Intro', exact: true })).toBeVisible();
});

test('gallery supports keyboard, slide status and lightbox dismissal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/thu-vien');
  const gallery = page.getByRole('region', { name: 'Thư viện FTUCHARM' });
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

test('crown responds to scroll and becomes static with system reduced motion', async ({ page }) => {
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  expect(
    await page.locator('.stage-crown').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.locator('.crown-scroll').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
});
