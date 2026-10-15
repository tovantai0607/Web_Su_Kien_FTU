import { expect, it } from 'vitest';
import { demoPurchaseCatalog, type Offer } from '@ftu/shared';
import { currentTicketProducts } from '../../apps/web/src/lib/ticket-phases';

function offer(): Offer {
  const value = demoPurchaseCatalog().offers[0];
  value.products = value.products.flatMap((p) => [
    { ...p, state: 'OPEN' as const },
    {
      ...p,
      id: crypto.randomUUID(),
      tier: 'NORMAL' as const,
      state: 'OPEN' as const,
      price_vnd: 150000,
    },
  ]);
  return value;
}
it('shows each ticket type once when a legacy DEMO has both windows open', () => {
  const value = offer();
  expect(currentTicketProducts(value).map((p) => [p.name, p.tier])).toEqual([
    ['The Intro', 'EARLY'],
    ['The Bridge', 'EARLY'],
    ['The Chorus', 'EARLY'],
  ]);
  value.products[0].state = 'SOLD_OUT';
  expect(currentTicketProducts(value)[0].tier).toBe('NORMAL');
});
it('does not let a sold-out early type bypass the server-controlled phase', () => {
  const value = offer();
  value.phase = 'EARLY';
  value.products[0].state = 'SOLD_OUT';
  expect(currentTicketProducts(value)[0]).toMatchObject({ tier: 'EARLY', state: 'SOLD_OUT' });
  value.phase = 'NORMAL';
  expect(currentTicketProducts(value).every((p) => p.tier === 'NORMAL')).toBe(true);
});
it('shows the next normal window once early sales close, including a zero-early allocation', () => {
  const value = offer();
  value.products.forEach((p) => {
    p.state = p.tier === 'EARLY' ? 'CLOSED' : 'UPCOMING';
  });
  expect(currentTicketProducts(value).every((p) => p.tier === 'NORMAL')).toBe(true);
  value.phase = 'UPCOMING';
  value.early_quota = 0;
  expect(currentTicketProducts(value).every((p) => p.tier === 'NORMAL')).toBe(true);
});
