import { it, expect } from 'vitest';
import {
  fromVietnamTime,
  toVietnamTime,
  saleSettingsSchema,
  currentSaleState,
  type SalesEvent,
} from '@ftu/shared';
it('converts Vietnam datetime-local values without using the device timezone', () => {
  expect(fromVietnamTime('2026-10-14T18:30')).toBe('2026-10-14T11:30:00.000Z');
  expect(toVietnamTime('2026-10-14T11:30:00Z')).toBe('2026-10-14T18:30');
  expect(() => fromVietnamTime('2026-02-30T18:30')).toThrow();
});
it('validates phase order and both ticket categories', () => {
  const prices = [
    { category_id: '99010000-0000-4000-8000-000000000050', price_vnd: 100000 },
    { category_id: '99010000-0000-4000-8000-000000000051', price_vnd: 120000 },
  ];
  const phases = [
    { kind: 'EARLY', open_at: '2026-10-14T01:00:00Z', close_at: '2026-10-14T02:00:00Z', prices },
    { kind: 'REGULAR', open_at: '2026-10-14T02:00:00Z', close_at: '2026-10-14T04:00:00Z', prices },
  ];
  expect(saleSettingsSchema.safeParse({ revision: 0, phases }).success).toBe(true);
  expect(
    saleSettingsSchema.safeParse({
      revision: 0,
      phases: [phases[0], { ...phases[1], open_at: '2026-10-14T01:00:00Z' }],
    }).success,
  ).toBe(false);
});
it('does not show an event as open during a gap between sale phases', () => {
  const event = {
    available: 10,
    phases: [
      { kind: 'EARLY', open_at: '2026-10-14T01:00:00Z', close_at: '2026-10-14T02:00:00Z' },
      { kind: 'REGULAR', open_at: '2026-10-14T03:00:00Z', close_at: '2026-10-14T04:00:00Z' },
    ],
  } as SalesEvent;
  expect(currentSaleState(event, Date.parse('2026-10-14T02:30:00Z'))).toBe('UPCOMING');
  expect(currentSaleState(event, Date.parse('2026-10-14T03:00:00Z'))).toBe('OPEN');
  expect(currentSaleState(event, Date.parse('2026-10-14T04:00:00Z'))).toBe('CLOSED');
});
