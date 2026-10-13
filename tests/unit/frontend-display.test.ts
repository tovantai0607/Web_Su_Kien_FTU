// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { TimelineEvent } from '@ftu/shared';
import EventCountdown, { countdownParts } from '../../apps/web/src/components/EventCountdown';
import AdminOverview from '../../apps/web/src/components/AdminOverview';
import { Marquee } from '../../apps/web/src/components/interface/Marquee';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('published event countdown', () => {
  it('does not invent a deadline when no schedule is published', () => {
    render(React.createElement(EventCountdown, { events: [] }));
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByText('Lịch chính thức sắp công bố')).toBeTruthy();
  });
  it('uses the next future date, skipping expired and invalid dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    const events = [
      { id: 'past', title: 'Đã kết thúc', starts_at: '2026-10-12T10:00:00Z' },
      { id: 'bad', title: 'Chưa có lịch', starts_at: 'invalid' },
      { id: 'later', title: 'Chung kết', starts_at: '2026-10-20T10:00:00Z' },
      { id: 'next', title: 'Bán kết', starts_at: '2026-10-14T12:03:04Z' },
    ] as TimelineEvent[];
    render(React.createElement(EventCountdown, { events }));
    expect(screen.getByRole('heading', { name: 'Bán kết' })).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('01Ngày02Giờ03Phút04Giây');
  });
  it('clamps an expired deadline to zero', () => {
    expect(countdownParts(1000, 2000)).toEqual([0, 0, 0, 0]);
  });
});

it('dashboard distinguishes unavailable metrics from actual zero', () => {
  const view = render(React.createElement(AdminOverview, { summary: undefined }));
  expect(screen.getAllByText('Chưa có dữ liệu')).toHaveLength(3);
  view.rerender(
    React.createElement(AdminOverview, { summary: { applications: 0, votes: 12, checked_in: 30 } }),
  );
  expect(screen.queryByText('Chưa có dữ liệu')).toBeNull();
  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.getAllByText('12')).toHaveLength(2);
});

it('marquee duplicates are hidden from assistive technology and inert', () => {
  const { container } = render(
    React.createElement(Marquee, {
      children: React.createElement('a', { href: '#sponsor' }, 'Nhà tài trợ thử'),
    }),
  );
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(container.querySelector('.marquee-copy')?.hasAttribute('inert')).toBe(true);
});
