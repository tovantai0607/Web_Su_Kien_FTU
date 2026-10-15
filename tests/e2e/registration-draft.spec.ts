import { test, expect } from './isolated-test';

test('draft survives rules, login navigation and reload without writing PII to localStorage', async ({
  page,
  context,
}) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Họ và tên').fill('QA hồ sơ đang điền');
  await page.getByLabel('Số điện thoại').fill('0000000000');
  await page.getByRole('link', { name: 'Xem thể lệ', exact: true }).click();
  await expect(page).toHaveURL(/\/the-le$/);
  await page.goBack();
  await expect(page.getByLabel('Họ và tên')).toHaveValue('QA hồ sơ đang điền');
  await page.reload();
  await expect(page.getByLabel('Số điện thoại')).toHaveValue('0000000000');
  const storage = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }),
    session: sessionStorage.getItem('ftucharm-registration-draft-v1'),
  }));
  expect(storage.local).not.toContain('QA hồ sơ đang điền');
  expect(storage.session).toContain('QA hồ sơ đang điền');
  const another = await context.newPage();
  await another.goto('/dang-ky');
  await expect(another.getByLabel('Họ và tên')).toHaveValue('');
  await another.close();
});

test('footer contains official 2027 contact details at mobile and desktop widths', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('h1').waitFor();
    await page.screenshot({ path: `output/ui-refresh/home-${width}.png` });
    const footer = page.getByRole('contentinfo');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toContainText('© 2027 FTUCHARM');
    await expect(
      footer.getByRole('link', { name: 'ftucharm.duyendangngoaithuong@gmail.com', exact: true }),
    ).toHaveAttribute('href', 'mailto:ftucharm.duyendangngoaithuong@gmail.com');
    await expect(
      footer.getByRole('link', { name: 'Hotline: 0932197168', exact: true }),
    ).toHaveAttribute('href', 'tel:0932197168');
    await expect(footer.getByRole('link', { name: /Fanpage chính thức/ })).toHaveAttribute(
      'href',
      'https://www.facebook.com/ftucharm.duyendangngoaithuong',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await footer.screenshot({ path: `output/ui-refresh/footer-${width}.png` });
    const strip = page.getByRole('region', { name: 'Đơn vị tổ chức và đồng hành' });
    await strip.screenshot({ path: `output/ui-refresh/logos-${width}.png` });
  }
});
