import { test, expect, type Page } from './isolated-test';
import AxeBuilder from '@axe-core/playwright';
import { demoEdition } from '@ftu/shared';
const id = (n: number) => `99020000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function setup(page: Page, time = '2027-02-20T12:00:00+07:00', state = 'UPCOMING') {
  const edition = {
    ...demoEdition,
    id: id(1),
    slug: 'ftucharm-2027',
    title: 'FTUCharm 2027',
    published: true,
    registration_open_at: '2027-03-07T00:00:00+07:00',
    registration_close_at: '2027-03-22T00:00:00+07:00',
  };
  const offers = [
    {
      id: id(3),
      edition_id: edition.id,
      round_id: id(2),
      slug: 'ban-ket-2027',
      title: 'Đêm bán kết FTUCharm 2027',
      mode: 'LIVE',
      venue: '',
      starts_at: null,
      event_date: '2027-04-25',
      total_quota: 700,
      early_quota: 100,
      early_open_at: '2027-03-29T00:00:00+07:00',
      early_close_at: '2027-03-31T00:00:00+07:00',
      normal_close_at: '2027-04-25T00:00:00+07:00',
      products: [],
      checkout_enabled: false,
      phase: 'UPCOMING',
      payment_instructions: '',
      qr_path: null,
    },
  ];
  const timeline = [
    {
      id: id(4),
      edition_id: edition.id,
      title: 'Khám phá FTUCharm 2027',
      description: '15/02–06/03: xem thông tin',
      position: 0,
      starts_at: '2027-02-15T00:00:00+07:00',
      ends_at: '2027-03-07T00:00:00+07:00',
      published: true,
    },
  ];
  const writes: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') writes.push(path);
    const data: Record<string, unknown> = {
      '/api/program': { edition, server_time: time, timeline, offers, registration_state: state },
      '/api/editions/current': edition,
      '/api/timeline': timeline,
      '/api/rounds': [
        { id: id(2), edition_id: edition.id, title: 'Bán kết', kind: 'semifinal', published: true },
      ],
      '/api/contestants': [],
      '/api/awards': [],
      '/api/sponsors': [],
      '/api/purchase-catalog': { server_time: time, offers },
    };
    return route.fulfill({ json: { data: data[path] ?? [] } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return writes;
}
test('official homepage and ticket metadata work without preview, prices or photos', async ({
  page,
}, info) => {
  const writes = await setup(page);
  await page.goto('/');
  await expect(page.locator('.preview-bar')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Xem form đăng ký' })).toBeVisible();
  await expect(page.getByText('Kết quả chờ công bố', { exact: true })).toBeVisible();
  await page.goto('/ve');
  await expect(page.getByText('Tổng 700 vé · Tối đa 100 vé sớm')).toBeVisible();
  await page.getByRole('link', { name: 'Xem vé & combo' }).click();
  await expect(
    page.getByText('Chưa nhận đơn. Giá, phân bổ loại vé và QR chuyển khoản đang chờ BTC cấu hình.'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hạng vé dự kiến' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The Intro', exact: true })).toBeVisible();
  await expect(page.getByText('Chờ cập nhật giá', { exact: true })).toHaveCount(3);
  await expect(page.getByLabel('Lịch mở bán')).toContainText('29 thg 3, 2027');
  await expect(page.getByRole('button', { name: 'Xác nhận vé & combo' })).toHaveCount(0);
  for (const width of info.project.name === 'mobile' ? [320, 390] : [1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(writes).toEqual([]);
  await page.screenshot({
    path: info.outputPath('official-ticket-pending-price.png'),
    fullPage: true,
  });
});

test('guests see both official nights and cannot open DEMO voting', async ({ page }) => {
  await setup(page);
  await page.route('**/api/purchase-catalog', (route) =>
    route.fulfill({
      json: {
        data: {
          server_time: new Date().toISOString(),
          offers: [
            {
              id: id(3),
              slug: 'ban-ket-2027',
              title: 'Đêm bán kết FTUCharm 2027',
              mode: 'LIVE',
              event_date: '2027-04-25',
              products: [],
              checkout_enabled: false,
            },
            {
              id: id(8),
              slug: 'chung-ket-2027',
              title: 'Đêm chung kết FTUCharm 2027',
              mode: 'LIVE',
              event_date: '2027-05-23',
              products: [],
              checkout_enabled: false,
            },
            {
              id: id(9),
              slug: 'test-giao-dich-demo',
              title: 'Đợt thử DEMO',
              mode: 'DEMO',
              products: [],
            },
          ],
        },
      },
    }),
  );
  await page.goto('/ve');
  await expect(page.getByRole('heading', { name: 'Đêm bán kết FTUCharm 2027' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đêm chung kết FTUCharm 2027' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem vé & combo' })).toHaveCount(2);
  await expect(page.getByText('Đợt thử DEMO', { exact: true })).toHaveCount(0);
  await page.goto('/binh-chon?demo=1&vong=' + id(99));
  await expect(page.getByText('DEMO chỉ dành cho tài khoản admin')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bảng xếp hạng DEMO' })).toHaveCount(0);
});
test('registration uses server time even if the browser clock claims the registration window is open', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Date.now = () => new Date('2027-03-10T12:00:00+07:00').getTime();
  });
  const writes = await setup(page, '2027-03-06T23:59:59+07:00');
  await page.goto('/dang-ky');
  await expect(page.getByRole('heading', { name: 'Chưa mở đăng ký dự thi' })).toBeVisible();
  await expect(page.getByLabel('Họ và tên')).toBeVisible();
  expect(writes).toEqual([]);
});
test('registration opens at the boundary and closes at midnight after March 21', async ({
  page,
}) => {
  await setup(page, '2027-03-07T00:00:00+07:00', 'OPEN');
  await page.goto('/dang-ky');
  await expect(page.getByRole('heading', { name: 'Đăng nhập để gửi hồ sơ.' })).toBeVisible();
  await page.unrouteAll();
  await setup(page, '2027-03-22T00:00:00+07:00', 'CLOSED');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Đã đóng đăng ký dự thi' })).toBeVisible();
  await expect(page.getByLabel('Họ và tên')).toBeVisible();
});
test('registration remains reachable and shows all three steps without permitting early writes', async ({
  page,
}) => {
  const writes = await setup(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Xem form đăng ký', exact: true }).click();
  await expect(page).toHaveURL(/\/dang-ky$/);
  await page.getByLabel('Họ và tên', { exact: true }).fill('Thí sinh kiểm thử');
  await page.getByLabel('Email đã xác minh').fill('student@example.test');
  await page.getByLabel('Số điện thoại').fill('0901234567');
  await page.getByLabel('Khoa / ngành học').fill('Kinh tế');
  await page.getByLabel('Khóa', { exact: true }).fill('K63');
  await page.getByLabel('Lớp', { exact: true }).fill('K63A');
  await page.getByLabel('Chiều cao (cm)').fill('170');
  await page.getByLabel('Hạng mục dự thi').selectOption('female');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page
    .getByLabel('Câu chuyện của bạn')
    .fill('Câu chuyện của thí sinh kiểm thử, chỉ chuẩn bị thông tin trên trình duyệt.');
  await page.locator('textarea[name=talents]').fill('Hát và biểu diễn nghệ thuật.');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Ảnh hồ sơ' })).toBeVisible();
  await expect(page.getByLabel('Ảnh thẻ sinh viên FTU')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gửi hồ sơ' })).toBeDisabled();
  expect(writes).toEqual([]);
});
test('login form keeps a balanced centered width on small phones and wide desktops', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/tai-khoan/dang-nhap');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  for (const width of [320, 390, 758, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await page.locator('.auth-card').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(width < 520 ? width - 34 : 470);
    expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
test('round lists and the official gallery remain empty until BTC publishes images', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/thi-sinh');
  await page.getByLabel('Vòng thi').selectOption(id(2));
  await expect(page.getByText('Chưa tìm thấy gương mặt phù hợp')).toBeVisible();
  await page.goto('/thu-vien');
  await expect(page.getByText('Ảnh chính thức chờ công bố')).toBeVisible();
  await expect(page.locator('img[src*="silk-bloom"]')).toHaveCount(0);
});

test('ticket types stay grouped when the server switches from early to normal sales', async ({
  page,
}, info) => {
  const writes = await setup(page);
  let phase = 'EARLY';
  await page.route('**/api/purchase-catalog*', (route) =>
    route.fulfill({
      json: {
        data: {
          server_time: new Date().toISOString(),
          offers: [
            {
              id: id(3),
              slug: 'ban-ket-2027',
              title: 'Đêm bán kết FTUCharm 2027',
              mode: 'LIVE',
              total_quota: 700,
              early_quota: 100,
              phase,
              checkout_enabled: true,
              early_close_at: '2027-04-01T10:00:00+07:00',
              products: ['The Intro', 'The Bridge', 'The Chorus'].flatMap((name, i) =>
                ['EARLY', 'NORMAL'].map((tier, j) => ({
                  id: id(100 + i * 2 + j),
                  name,
                  tier,
                  available: 20,
                  price_vnd: j ? 160000 : 100000,
                  combo2_vnd: j ? 300000 : 190000,
                  combo3_vnd: j ? 450000 : 280000,
                  opens_at: '2027-03-29T00:00:00+07:00',
                  closes_at: j ? '2027-04-25T00:00:00+07:00' : '2027-04-01T10:00:00+07:00',
                  state: tier === phase ? 'OPEN' : tier === 'EARLY' ? 'CLOSED' : 'UPCOMING',
                })),
              ),
            },
          ],
        },
      },
    }),
  );
  await page.clock.install();
  await page.goto('/ve/ban-ket-2027');
  await expect(page.locator('.purchase-products > .card')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'The Intro', exact: true })).toHaveCount(1);
  await page.getByLabel('Số lượng vé đơn The Intro EARLY', { exact: true }).fill('1');
  await expect(page.locator('.purchase-summary')).toContainText('100.000');
  await expect(page.getByRole('button', { name: 'Xác nhận vé & combo' })).toBeEnabled();
  phase = 'NORMAL';
  await page.clock.fastForward(16000);
  await expect(page.getByLabel('Số lượng vé đơn The Intro NORMAL', { exact: true })).toHaveValue(
    '0',
  );
  await expect(page.locator('.purchase-products > .card')).toHaveCount(3);
  await expect(
    page.getByText('Đợt bán đã thay đổi. Kiểm tra giá hiện tại và chọn lại số lượng vé.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận vé & combo' })).toBeDisabled();
  await page.getByLabel('Số lượng vé đơn The Intro NORMAL', { exact: true }).fill('1');
  await expect(page.locator('.purchase-summary')).toContainText('160.000');
  await page.getByRole('button', { name: 'Xác nhận vé & combo' }).click();
  await expect(page.getByLabel('Họ tên', { exact: true })).toBeVisible();
  for (const width of info.project.name === 'mobile' ? [320, 390] : [1280]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(writes).toEqual([]);
});
