// @vitest-environment jsdom
import { createElement, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PurchaseOfferEditor from '../../apps/web/src/components/PurchaseOfferEditor';

afterEach(cleanup);
function initial() {
  return {
    id: crypto.randomUUID(),
    edition_id: crypto.randomUUID(),
    round_id: crypto.randomUUID(),
    slug: 'test-editor',
    title: 'Đợt thử',
    venue: '',
    starts_at: null,
    mode: 'DEMO',
    published: false,
    qr_path: null,
    payment_instructions: '',
    products: [
      {
        id: crypto.randomUUID(),
        name: 'The Intro',
        tier: 'EARLY',
        quota: 0,
        price_vnd: 100000,
        combo2_vnd: null,
        combo3_vnd: null,
        opens_at: '2027-04-25T17:00:00Z',
        closes_at: '2027-04-26T17:00:00Z',
        enabled: false,
      },
    ],
  };
}
function setup(config = initial()) {
  const saved = vi.fn();
  function Harness() {
    const [value, setValue] = useState(JSON.stringify(config));
    return createElement(PurchaseOfferEditor, {
      value,
      onChange: setValue,
      busy: false,
      onSave: async () => {
        saved(JSON.parse(value));
      },
    });
  }
  render(createElement(Harness));
  return {
    config,
    saved,
    group: () =>
      within(
        within(screen.getByRole('group', { name: 'The Intro' })).getByRole('group', {
          name: 'Vé sớm',
        }),
      ),
  };
}
it('lets BTC edit price, quota and combos while retaining IDs and Vietnam time', async () => {
  const { config, saved, group } = setup();
  expect((group().getByLabelText('Mở bán (giờ Việt Nam)') as HTMLInputElement).value).toBe(
    '2027-04-26T00:00',
  );
  fireEvent.change(group().getByLabelText('Giá vé đơn (VND)'), { target: { value: '150000' } });
  fireEvent.change(group().getByLabelText('Số lượng vé'), { target: { value: '20' } });
  fireEvent.change(group().getByLabelText('Giá Combo 2 (VND)'), { target: { value: '290000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình vé' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  const payload = saved.mock.calls[0][0];
  expect(payload.id).toBe(config.id);
  expect(payload.products[0]).toMatchObject({
    id: config.products[0].id,
    price_vnd: 150000,
    quota: 20,
    combo2_vnd: 290000,
    combo3_vnd: null,
    enabled: false,
    opens_at: '2027-04-25T17:00:00Z',
  });
});
it('groups both phases by ticket type and saves admin allocation, prices and Vietnam schedule together', async () => {
  const config = {
    ...initial(),
    total_quota: 700,
    early_quota: 100,
    early_open_at: '2027-03-29T00:00:00+07:00',
    early_close_at: '2027-03-31T00:00:00+07:00',
    normal_close_at: '2027-04-25T00:00:00+07:00',
  };
  config.products[0].quota = 100;
  config.products.push({
    ...config.products[0],
    id: crypto.randomUUID(),
    tier: 'NORMAL',
    quota: 600,
  });
  const { saved } = setup(config);
  const ticket = within(screen.getByRole('group', { name: 'The Intro' }));
  expect(ticket.getAllByRole('group')).toHaveLength(2);
  const early = within(ticket.getByRole('group', { name: 'Vé sớm' }));
  const normal = within(ticket.getByRole('group', { name: 'Vé thường' }));
  fireEvent.change(screen.getByLabelText('Số vé bán sớm'), { target: { value: '120' } });
  fireEvent.change(early.getByLabelText('Số lượng vé'), { target: { value: '120' } });
  fireEvent.change(normal.getByLabelText('Số lượng vé'), { target: { value: '580' } });
  fireEvent.change(early.getByLabelText('Giá vé đơn (VND)'), { target: { value: '90000' } });
  fireEvent.change(normal.getByLabelText('Giá vé đơn (VND)'), { target: { value: '150000' } });
  fireEvent.change(screen.getByLabelText('Kết thúc vé sớm / bắt đầu vé thường'), {
    target: { value: '2027-04-01T10:00' },
  });
  fireEvent.change(screen.getByLabelText('Đóng vé thường (giờ Việt Nam)'), {
    target: { value: '2027-04-24T22:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình vé' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(saved.mock.calls[0][0]).toMatchObject({
    total_quota: 700,
    early_quota: 120,
    early_close_at: '2027-04-01T10:00:00+07:00',
    normal_close_at: '2027-04-24T22:00:00+07:00',
    products: [
      {
        id: config.products[0].id,
        quota: 120,
        price_vnd: 90000,
        closes_at: '2027-04-01T10:00:00+07:00',
      },
      {
        id: config.products[1].id,
        quota: 580,
        price_vnd: 150000,
        closes_at: '2027-04-24T22:00:00+07:00',
      },
    ],
  });
});
it('blocks an inverted phase schedule or allocations beyond the configured early limit', async () => {
  const config = {
    ...initial(),
    total_quota: 700,
    early_quota: 10,
    early_open_at: '2027-03-29T00:00:00+07:00',
    early_close_at: '2027-03-31T00:00:00+07:00',
    normal_close_at: '2027-04-25T00:00:00+07:00',
  };
  config.products[0].quota = 20;
  const { saved } = setup(config);
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình vé' }));
  expect(
    await screen.findByText('Phân bổ từng hạng vượt số vé sớm hoặc số vé thường còn lại.'),
  ).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Số vé bán sớm'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('Kết thúc vé sớm / bắt đầu vé thường'), {
    target: { value: '2027-03-28T00:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình vé' }));
  expect(await screen.findByText('Kết thúc vé sớm phải sau giờ mở.')).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
});
it('blocks invalid time but permits official information before QR readiness', async () => {
  const { saved, group } = setup();
  fireEvent.change(group().getByLabelText('Đóng bán (giờ Việt Nam)'), {
    target: { value: '2027-04-26T00:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình vé' }));
  expect(await screen.findByText('Ngày đóng phải sau ngày mở.')).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
  fireEvent.change(group().getByLabelText('Đóng bán (giờ Việt Nam)'), {
    target: { value: '2027-04-27T00:00' },
  });
  fireEvent.change(screen.getByLabelText('Chế độ đợt bán'), { target: { value: 'LIVE' } });
  fireEvent.click(screen.getByLabelText('Công bố đợt bán (mùa và vòng cũng phải được công bố)'));
  fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình vé' }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(saved.mock.calls[0][0]).toMatchObject({ mode: 'LIVE', published: true, qr_path: null });
});
it('adds missing draft tiers without duplicating or changing an existing price', () => {
  const { group } = setup();
  fireEvent.change(group().getByLabelText('Giá vé đơn (VND)'), { target: { value: '150000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Thêm các hạng vé còn thiếu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thêm các hạng vé còn thiếu' }));
  expect(screen.getAllByLabelText('Giá vé đơn (VND)')).toHaveLength(6);
  expect((group().getByLabelText('Giá vé đơn (VND)') as HTMLInputElement).value).toBe('150000');
  expect(
    screen
      .getAllByLabelText('Cho phép bán hạng vé này')
      .every((el) => !(el as HTMLInputElement).checked),
  ).toBe(true);
});
