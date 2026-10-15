// @vitest-environment jsdom
import { createElement, useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Voting from '../../apps/web/src/pages/Voting';

const state = vi.hoisted(() => ({
  votes: [] as {
    ticket_id: string;
    category_id: string;
    contestant_id: string;
    round_id: string;
  }[],
  leaderboard: true,
  session: true,
}));
vi.mock('../../apps/web/src/lib/auth', () => ({ useAuth: () => ({ user: { id: 'buyer' } }) }));
vi.mock('../../apps/web/src/components/interface/MotionSystem', () => ({
  AnimatedGroup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    createElement('div', { className }, children),
}));
vi.mock('../../apps/web/src/components/Turnstile', () => ({
  Turnstile: ({ onToken }: { onToken: (value: string) => void }) => {
    useEffect(() => onToken('local-test-captcha'), [onToken]);
    return null;
  },
}));
vi.mock('../../apps/web/src/lib/api', () => ({
  preview: false,
  api: async (path: string, options?: RequestInit) => {
    const round = { id: 'round', title: 'Vòng DEMO', kind: 'semifinal' };
    const contestants = [
      { id: 'female', display_name: 'Nữ DEMO', gender: 'female', slug: 'female', number: 1 },
      { id: 'male', display_name: 'Nam DEMO', gender: 'male', slug: 'male', number: 2 },
    ];
    const categories = ['female', 'male'].map((gender) => ({
      id: gender + '-category',
      name: gender === 'female' ? 'Nữ được yêu thích nhất' : 'Nam được yêu thích nhất',
      gender,
    }));
    if (path === '/rounds') return [round];
    if (path === '/me/tickets')
      return [{ id: 'ticket', round_id: 'round', display_code: 'DM00001', status: 'issued' }];
    if (path === '/me/votes') return [...state.votes];
    if (path === '/votes') {
      const vote = JSON.parse(options!.body as string);
      if (
        state.votes.some(
          (old) => old.ticket_id === vote.ticket_id && old.category_id === vote.category_id,
        )
      )
        throw new Error('Vé đã bình chọn');
      state.votes.push(vote);
      return { recorded: true };
    }
    if (path === '/voting/round')
      return {
        round,
        contestants,
        categories,
        session: state.session
          ? {
              id: 'session',
              state: 'OPEN',
              open_at: new Date(Date.now() - 60000).toISOString(),
              close_at: new Date(Date.now() + 600000).toISOString(),
            }
          : null,
        eligible: categories.map((category) => ({
          category_id: category.id,
          contestant_id: category.gender,
        })),
        participation: { participants: state.votes.length ? 1 : 0, votes: state.votes.length },
        demo_leaderboard: state.leaderboard
          ? {
              session_id: 'session',
              rows: categories.map((category) => ({
                category_id: category.id,
                contestant_id: category.gender,
                rank: 1,
                votes: state.votes.filter((vote) => vote.category_id === category.id).length,
              })),
            }
          : null,
        server_time: new Date().toISOString(),
      };
    throw new Error('Unexpected path ' + path);
  },
}));
afterEach(() => {
  cleanup();
  state.votes = [];
  state.leaderboard = true;
  state.session = true;
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: ['/binh-chon'] }, createElement(Voting)),
    ),
  );
  return client;
}
it('updates the DEMO ranking immediately after voting and preserves one right per ticket per category', async () => {
  const client = mount();
  const board = await screen.findByRole('region', { name: 'Bảng xếp hạng DEMO' });
  expect(within(board).getByText('0 phiếu')).toBeTruthy();
  fireEvent.change(await screen.findByLabelText('Vé đủ điều kiện của vòng này'), {
    target: { value: 'ticket' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Chọn thí sinh' }));
  const confirm = await screen.findByRole('button', { name: 'Xác nhận bình chọn' });
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(within(board).getByText('1 phiếu')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /^Hoàn tất$/ }));
  await screen.findByText('Không có vé đủ điều kiện hoặc vé đã bình chọn');
  fireEvent.click(screen.getByRole('button', { name: /^Nam được yêu thích nhất$/ }));
  expect(await screen.findByLabelText('Vé đủ điều kiện của vòng này')).toBeTruthy();
  expect(within(board).getByText('0 phiếu')).toBeTruthy();
  expect(state.votes).toHaveLength(1);
  client.clear();
});
it('does not display a provisional ranking when the backend does not allow it', async () => {
  state.leaderboard = false;
  const client = mount();
  await screen.findByText('Vòng DEMO');
  expect(screen.queryByRole('region', { name: 'Bảng xếp hạng DEMO' })).toBeNull();
  client.clear();
});

it('explains an unconfigured DEMO session without showing an endless loading state', async () => {
  state.session = false;
  const client = mount();
  await screen.findByText('BTC chưa mở phiên bình chọn DEMO.');
  expect(screen.queryByText('Đang tải kết quả của phiên hiện tại.')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Chọn thí sinh' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  client.clear();
});
