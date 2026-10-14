import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const id = (n: number) => `99010000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tomorrow = new Date(Date.now() + 86400000).toISOString(),
  later = new Date(Date.now() + 172800000).toISOString();
async function setup(page: Page, access = { is_admin: true, aal: 'aal2' }) {
  const user = {
    id: id(1),
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@example.test',
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: {},
    identities: [{ provider: 'google' }],
    created_at: new Date().toISOString(),
  };
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token =
    encode({ alg: 'HS256', typ: 'JWT' }) +
    '.' +
    encode({
      sub: user.id,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      aal: access.aal,
    }) +
    '.test-signature';
  const config = {
    server_time: new Date().toISOString(),
    editions: [{ id: id(10), title: 'FTUCHARM 2027', year: 2027 }],
    rounds: [
      {
        id: id(20),
        edition_id: id(10),
        title: 'Chung kết',
        kind: 'final',
        published: true,
        vote_open_at: null as string | null,
        vote_close_at: null as string | null,
        session_state: null as string | null,
      },
    ],
    events: [
      {
        id: id(40),
        edition_id: id(10),
        title: 'Đêm chung kết',
        published: true,
        sales_revision: 0,
        categories: [
          { id: id(50), name: 'Hạng 1', position: 1, price_vnd: 100000 },
          { id: id(51), name: 'Hạng 2', position: 2, price_vnd: 150000 },
        ],
        phases: [
          {
            kind: 'REGULAR',
            open_at: tomorrow,
            close_at: later,
            prices: [
              { category_id: id(50), price_vnd: 100000 },
              { category_id: id(51), price_vnd: 150000 },
            ],
          },
        ],
      },
    ],
  };
  let exchanges = 0,
    settingsRequests = 0;
  const saved: unknown[] = [];
  let purchaseRequests = 0;
  await page.route('https://auth-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/auth/v1/authorize')
      return route.fulfill({
        status: 303,
        headers: { location: 'http://127.0.0.1:4174/tai-khoan/oauth-callback?code=test-code' },
      });
    if (url.pathname === '/auth/v1/token') {
      exchanges++;
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: 'test-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        },
      });
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user });
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me/access') return route.fulfill({ json: { data: access } });
    if (path === '/api/admin/purchases') {
      purchaseRequests++;
      return route.fulfill({
        json: {
          data: {
            rows: [
              {
                id: id(70),
                code: 'DEMO-CUSTOMER-1',
                buyer: {
                  name: 'Khách DEMO',
                  school: 'Trường DEMO',
                  cohort_class: 'K63',
                  student_id: 'DEMO-1',
                  email: 'customer@example.test',
                  phone: '0000000000',
                  facebook: 'DEMO',
                },
                lines: [
                  {
                    product_id: id(80),
                    name: 'The Intro',
                    tier: 'EARLY',
                    bundle_size: 2,
                    quantity: 1,
                    ticket_quantity: 2,
                    unit_price_vnd: 200000,
                  },
                ],
                quantity: 2,
                total_vnd: 200000,
                status: 'COMPLETED',
                evidence_id: id(90),
                completed_at: new Date().toISOString(),
                round_id: id(20),
              },
            ],
            count: 1,
          },
        },
      });
    }
    if (path === '/api/purchase-evidence/' + id(90))
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    if (path === '/api/admin/settings') {
      settingsRequests++;
      return route.fulfill({ json: { data: config } });
    }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      saved.push(body);
      if (path.includes('/rounds/'))
        Object.assign(config.rounds[0], {
          vote_open_at: body.open_at,
          vote_close_at: body.close_at,
          session_state: 'SCHEDULED',
        });
      else {
        config.events[0].phases = body.phases;
        config.events[0].sales_revision++;
      }
      return route.fulfill({ json: { data: { saved: true } } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return {
    get exchanges() {
      return exchanges;
    },
    get settingsRequests() {
      return settingsRequests;
    },
    get purchaseRequests() {
      return purchaseRequests;
    },
    saved,
  };
}
async function login(page: Page) {
  await page.goto('/tai-khoan/dang-nhap');
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
  await expect(page).toHaveURL(/\/tai-khoan\/ho-so$/);
}
test('Google PKCE callback exchanges once and an admin configures Vietnam times and phase prices', async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await login(page);
  expect(state.exchanges).toBe(1);
  await page.goto('/tai-khoan/dang-nhap'); // memory-only sessions are intentionally lost on full navigation
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
  await expect(page).toHaveURL(/\/tai-khoan\/ho-so$/);
  await page.getByRole('link', { name: 'Mở quản trị' }).click();
  await expect(page).toHaveURL(/\/admin\/cau-hinh$/);
  await page.getByLabel('Giờ mở vote').fill('2026-11-14T18:00');
  await page.getByLabel('Giờ đóng vote').fill('2026-11-14T20:00');
  await page.getByRole('button', { name: 'Lưu lịch bình chọn' }).click();
  await expect.poll(() => state.saved.length).toBe(1);
  expect(state.saved[0]).toMatchObject({
    open_at: '2026-11-14T11:00:00.000Z',
    close_at: '2026-11-14T13:00:00.000Z',
  });
  await page.getByRole('button', { name: 'Đợt bán vé', exact: true }).click();
  await page.getByLabel('Giá Hạng 1 (VND)').fill('120000');
  await page.getByLabel('Giá Hạng 2 (VND)').fill('160000');
  await expect(page.getByText('Có thay đổi chưa lưu.')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu đợt bán và giá vé' }).click();
  await expect.poll(() => state.saved.length).toBe(2);
  expect(state.saved[1]).toMatchObject({
    revision: 0,
    phases: [
      {
        kind: 'REGULAR',
        prices: [
          { category_id: id(50), price_vnd: 120000 },
          { category_id: id(51), price_vnd: 160000 },
        ],
      },
    ],
  });
  for (const width of testInfo.project.name === 'mobile' ? [320, 390] : [1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({
    path: `output/admin-settings-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
test('ordinary users cannot fetch private settings while admins can enter without MFA', async ({
  page,
}) => {
  for (const access of [
    { is_admin: false, aal: 'aal1' },
    { is_admin: true, aal: 'aal1' },
  ]) {
    await page.unrouteAll();
    const state = await setup(page, access);
    await login(page);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/admin/cau-hinh');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    if (access.is_admin) {
      await expect(page.getByRole('button', { name: 'Lưu lịch bình chọn' })).toBeVisible();
      expect(state.settingsRequests).toBeGreaterThan(0);
    } else {
      await expect(
        page.getByRole('heading', { name: 'Trang này chưa được tìm thấy.' }),
      ).toBeVisible();
      expect(state.settingsRequests).toBe(0);
      await expect(page.getByRole('button', { name: 'Lưu lịch bình chọn' })).toHaveCount(0);
    }
  }
});
test('cancelled or expired callbacks show recovery instructions', async ({ page }) => {
  await setup(page);
  await page.goto('/tai-khoan/oauth-callback?error=access_denied');
  await expect(
    page.getByText('Bạn đã hủy đăng nhập Google hoặc chưa cấp quyền. Hãy thử lại.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Về đăng nhập', exact: true }).click();
  await page.goto('/tai-khoan/oauth-callback');
  await expect(
    page.getByText('Liên kết đăng nhập đã hết hạn hoặc không hợp lệ. Hãy thử lại.'),
  ).toBeVisible();
});

test('admin opens customer records with six columns, proof, CSV and database link', async ({
  page,
}) => {
  const state = await setup(page, { is_admin: true, aal: 'aal1' });
  await login(page);
  await page.getByRole('link', { name: 'Mở quản trị', exact: true }).click();
  await page.getByRole('link', { name: 'Khách đã mua vé', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/ve$/);
  await expect(page.getByRole('heading', { name: 'Khách đã mua vé', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveCount(6);
  await expect(page.getByText('customer@example.test', { exact: false })).toBeVisible();
  await expect(page.getByText('1 đơn đã Hoàn tất · trang 1')).toBeVisible();
  const prior = state.purchaseRequests;
  await page.getByRole('button', { name: 'Tải lại danh sách', exact: true }).click();
  await expect.poll(() => state.purchaseRequests).toBeGreaterThan(prior);
  await page.getByRole('button', { name: 'Xem minh chứng', exact: true }).click();
  await expect(page.getByAltText('Minh chứng chuyển khoản của đơn vé')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Database Supabase', exact: true })).toHaveAttribute(
    'href',
    'https://supabase.com/dashboard/project/ifgtyslifgegwcguysbb/editor',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải dữ liệu trang này (CSV)', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('ftucharm-ve.csv');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('ordinary users cannot request customer records through the direct admin URL', async ({
  page,
}) => {
  const state = await setup(page, { is_admin: false, aal: 'aal1' });
  await login(page);
  await page.evaluate(() => {
    history.pushState({}, '', '/admin/ve');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Trang này chưa được tìm thấy.' })).toBeVisible();
  expect(state.purchaseRequests).toBe(0);
  await expect(page.getByRole('columnheader')).toHaveCount(0);
});
