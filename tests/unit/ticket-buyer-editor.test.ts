// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { fakeBuyer, fixture } from '../helpers/purchase-runtime';
import TicketBuyerEditor from '../../apps/web/src/components/TicketBuyerEditor';
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../apps/web/src/lib/api', () => ({ api }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('keeps the ticket code read-only and submits a cleared buyer/proof to release the selected group', async () => {
  const id = fixture(90),
    ticket = fixture(91),
    closed = vi.fn();
  api.mockImplementation((_path: string, options?: { body: string }) =>
    Promise.resolve(
      options
        ? { status: 'CLEARED' }
        : [
            {
              code: 'DM00012',
              ticket_id: ticket,
              revision: 4,
              buyer: fakeBuyer,
              evidence_id: fixture(92),
              line: { product_id: fixture(50), name: 'The Intro', bundle_size: 1 },
            },
          ],
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(TicketBuyerEditor, { purchaseId: id, onClose: closed }),
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: /DM00012/ }));
  for (const label of [
    'Họ tên',
    'Trường',
    'Khóa/lớp',
    'MSSV',
    'Email liên hệ',
    'Số điện thoại',
    'Facebook',
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
  expect(screen.queryByRole('textbox', { name: /Mã vé/ })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Xóa minh chứng hiện tại' }));
  fireEvent.click(screen.getByRole('button', { name: 'Làm sạch và trả vé về kho' }));
  await waitFor(() => expect(closed).toHaveBeenCalledOnce());
  const call = api.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(call?.[0]).toBe(`/admin/sheets/purchases/${id}/ticket-group`);
  expect(JSON.parse(call?.[1].body)).toMatchObject({
    codes: ['DM00012'],
    ticket_ids: [ticket],
    expected_revision: 4,
    evidence_id: null,
    buyer: {
      name: '',
      school: '',
      cohort_class: '',
      student_id: '',
      email: '',
      phone: '',
      facebook: '',
    },
  });
});
