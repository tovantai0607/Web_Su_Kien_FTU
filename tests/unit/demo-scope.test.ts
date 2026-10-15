import { beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../../apps/api/src/security';
const state = vi.hoisted(() => ({ exists: true, present: true }));
const offer = {
  id: 'demo-offer',
  mode: 'DEMO',
  edition_id: 'demo-edition',
  round_id: '11111111-1111-4111-8111-111111111111',
};
vi.mock('../../apps/api/src/security', () => ({
  service: () => ({
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (key: string, value: string) => {
          filters[key] = value;
          return q;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            table === 'purchase_offers'
              ? state.exists && filters.mode === 'DEMO'
                ? offer
                : null
              : state.present &&
                  (filters.offer_id === offer.id || filters.round_id === offer.round_id)
                ? { id: filters.id }
                : null,
        }),
      };
      return q;
    },
  }),
}));
import { enforceDemoWrite } from '../../apps/api/src/demo-scope';
const env = { DEMO_TEST_OFFER_SLUG: 'test-giao-dich-demo' } as Env;
const request = (path: string, body: unknown = {}, method = 'POST') =>
  new Request('https://fixture.test/api/' + path, { method, body: JSON.stringify(body) });
beforeEach(() => Object.assign(state, { exists: true, present: true }));
it('rejects LIVE purchases, unrelated modules and attempts to change the DEMO offer scope', async () => {
  for (const r of [
    request('purchases', { offer_id: 'live' }),
    request('contestants/apply'),
    request('admin/purchase-offers', { ...offer, mode: 'LIVE' }),
    request('admin/editions', {}),
    request('votes', { round_id: 'live' }),
  ])
    await expect(enforceDemoWrite(r, env)).rejects.toMatchObject({ status: 403 });
});
it('allows only the existing DEMO purchase and session before application authorization', async () => {
  for (const r of [
    request('purchases', { offer_id: offer.id }),
    request('admin/purchase-offers', offer),
    request('votes', { round_id: offer.round_id }),
    request(`purchases/${offer.round_id}/complete`),
    request(`admin/sheets/purchases/${offer.round_id}`),
    request(`admin/vote-sessions/${offer.round_id}/close`),
    request(`admin/rounds/${offer.round_id}/voting-settings`, {}, 'PUT'),
  ])
    await expect(enforceDemoWrite(r, env)).resolves.toBeUndefined();
  state.present = false;
  await expect(
    enforceDemoWrite(request(`purchases/${offer.round_id}/evidence`), env),
  ).rejects.toMatchObject({ status: 403 });
});
it('fails closed when the configured DEMO offer is missing', async () => {
  state.exists = false;
  await expect(
    enforceDemoWrite(request('purchases', { offer_id: offer.id }), env),
  ).rejects.toMatchObject({ status: 503 });
});
