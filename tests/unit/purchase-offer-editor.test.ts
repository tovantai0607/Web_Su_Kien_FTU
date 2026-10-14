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
function setup() {
  const config = initial();
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
    group: () => within(screen.getByRole('group', { name: 'The Intro · Vé sớm' })),
  };
}
it('lets BTC edit price, quota and combos while retaining IDs and Vietnam time', async () => {
  const { config, saved, group } = setup();
  expect((group().getByLabelText('Mở bán (giờ Việt Nam)') as HTMLInputElement).value).toBe(
    '2027-04-26T00:00',
  );
  fireEvent.change(group().getByLabelText('Giá vé đơn (VND)'), { target: { value: '150000' } });
  fireEvent.change(group().getByLabelText('Quota (số vé)'), { target: { value: '20' } });
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
it('blocks invalid closing time and incomplete LIVE publication without saving', async () => {
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
  expect(await screen.findByText('Thêm ảnh QR nhận tiền trước khi công bố LIVE.')).toBeTruthy();
  expect(screen.getByText('Nhập hướng dẫn chuyển khoản trước khi công bố LIVE.')).toBeTruthy();
  expect(saved).not.toHaveBeenCalled();
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
