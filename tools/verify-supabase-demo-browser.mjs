import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
if (!process.argv.includes('--run-approved-demo'))
  throw new Error('Cần duyệt ghi DEMO trước khi chạy.');
const account = JSON.parse(await readFile('output/demo-test/account.secret', 'utf8'));
if (account.project !== 'ifgtyslifgegwcguysbb') throw new Error('Sai project.');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let order;
try {
  order = JSON.parse(await readFile('output/demo-test/browser-order.json', 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
try {
  await page.goto('http://127.0.0.1:5173/tai-khoan');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.waitForFunction(
    () => !!document.querySelector('input[name="cf-turnstile-response"]')?.value,
    {},
    { timeout: 45000 },
  );
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/tai-khoan\/ho-so/, { timeout: 30000 });
  // Auth tokens are intentionally kept in memory: use normal SPA navigation after login.
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await page.getByRole('link', { name: 'Vé', exact: true }).click();
  await page.getByRole('link', { name: 'Xem vé & combo', exact: true }).click();
  if (order) {
    await page.evaluate((id) => {
      history.pushState({}, '', location.pathname + '?don=' + id);
      dispatchEvent(new PopStateEvent('popstate'));
    }, order.id);
    await expect(
      page.getByRole('heading', { name: 'Đã lưu đơn thành công', exact: true }),
    ).toBeVisible({ timeout: 30000 });
  }
  if (!order) {
    const card = page
      .locator('.purchase-products .card')
      .filter({ has: page.getByRole('heading', { name: 'The Intro', exact: true }) })
      .filter({ hasText: 'Vé sớm' });
    await card.getByRole('checkbox', { name: 'Chọn Combo 3 The Intro EARLY' }).check();
    await page.getByRole('button', { name: 'Xác nhận vé & combo', exact: true }).click();
    for (const [label, value] of Object.entries({
      'Họ tên': 'DEMO BROWSER',
      Trường: 'DEMO',
      'Khóa/lớp': 'DEMO',
      MSSV: 'DEMO',
      Email: account.email,
      'Số điện thoại': '0000000000',
      Facebook: 'DEMO',
    }))
      await page.getByLabel(label, { exact: true }).fill(value);
    const responsePromise = page.waitForResponse(
      (r) => r.url().endsWith('/api/purchases') && r.request().method() === 'POST',
    );
    const [response] = await Promise.all([
      responsePromise,
      page.getByRole('button', { name: 'Xác nhận thông tin', exact: true }).click(),
    ]);
    if (response.status() !== 200) throw new Error('Giữ vé browser thất bại: ' + response.status());
    order = (await response.json()).data;
    await writeFile('output/demo-test/browser-order.json', JSON.stringify({ id: order.id }));
  }
  if (
    (await page.getByRole('heading', { name: 'Đã lưu đơn thành công', exact: true }).count()) === 0
  ) {
    await expect(page.getByRole('timer')).toHaveText(/^(30:00|29:\d{2})$/);
    await page.screenshot({ path: 'output/demo-test/browser-qr-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Tiếp tục gửi minh chứng', exact: true }).click();
    const blank = await sharp({
      create: { width: 120, height: 120, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'anh-chon-nham-demo.png', mimeType: 'image/png', buffer: blank });
    await expect(
      page.getByRole('button', { name: 'Đổi ảnh minh chứng', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Đổi ảnh minh chứng', exact: true })
      .click({ noWaitAfter: true });
    await page.locator('input[type=file]').setInputFiles('output/demo-test/proof-demo.png');
    await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Đã lưu đơn thành công', exact: true }),
    ).toBeVisible({
      timeout: 30000,
    });
  }
  const row = page.getByRole('row').filter({ hasText: 'DEMO BROWSER' });
  const proofResponse = page.waitForResponse(
    (r) => /\/api\/purchase-evidence\//.test(r.url()) && r.status() === 200,
  );
  await row.getByRole('button', { name: 'Xem minh chứng', exact: true }).click();
  const proof = await proofResponse;
  if (proof.status() !== 200) throw new Error('Không đọc được minh chứng riêng tư.');
  const picture = row.getByAltText('Minh chứng chuyển khoản của đơn vé');
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  const pixel = await picture.evaluate((img) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  if (!(pixel[2] > 140 && pixel[0] < 80))
    throw new Error('Ảnh lưu không phải ảnh DEMO xanh đã chọn lại.');
  await expect(page.getByText('Bản xem trước không lưu')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error('Giao diện bị tràn ngang.');
  if (errors.length) throw new Error('Có lỗi JavaScript: ' + errors.join(';'));
  await page.screenshot({ path: 'output/demo-test/browser-completed-mobile.png', fullPage: true });
  await writeFile(
    'output/demo-test/browser-verification.json',
    JSON.stringify(
      {
        checked_at: new Date().toISOString(),
        request_id: order.id,
        viewport: 390,
        real_auth: true,
        real_supabase_write: true,
        proof_replaced_before_submit: true,
        overflow: false,
        javascript_errors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Browser mobile: đăng nhập Auth thật, Combo 3, giữ 30 phút, đổi minh chứng và Hoàn tất ghi Supabase đạt.',
  );
} catch (error) {
  await page.screenshot({ path: 'output/demo-test/browser-failure.png', fullPage: true });
  await writeFile('output/demo-test/browser-failure.txt', await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
