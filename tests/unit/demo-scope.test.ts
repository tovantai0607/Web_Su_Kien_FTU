import { beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../../apps/api/src/security';
import { HTTPException } from 'hono/http-exception';
const state = vi.hoisted(() => ({ exists: true, present: true, admin: true, signedIn: true }));
const offer = {
  id: 'demo-offer',
  mode: 'DEMO',
  edition_id: 'demo-edition',
  round_id: '11111111-1111-4111-8111-111111111111',
};
vi.mock('../../apps/api/src/security', () => ({
  authenticate: async () => {
    if (!state.signedIn) throw new HTTPException(401);
    return { id: 'user', aal: 'aal2' };
  },
  authorize: async () => {
    if (!state.admin) throw new HTTPException(403);
  },
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
beforeEach(() =>
  Object.assign(state, { exists: true, present: true, admin: true, signedIn: true }),
);
it('rejects non-admin and anonymous DEMO writes even with the approved offer ID', async () => {
  state.admin = false;
  await expect(
    enforceDemoWrite(request('purchases', { offer_id: offer.id }), env),
  ).rejects.toMatchObject({ status: 403 });
  state.signedIn = false;
  await expect(
    enforceDemoWrite(request('votes', { round_id: offer.round_id }), env),
  ).rejects.toMatchObject({ status: 401 });
});
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
it('allows an admin only within the existing DEMO purchase and session scope', async () => {
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

it('lets the authorized image route prepare bytes without permitting LIVE records or path lookalikes', async () => {
  await expect(enforceDemoWrite(request('admin/public-images'), env)).resolves.toBeUndefined();
  for (const r of [
    request('admin/publications', { published: true }),
    request('admin/publications', { published: false }),
    request('admin/public-images/extra'),
    request('media/upload'),
    request('admin/public-images', {}, 'PUT'),
  ])
    await expect(enforceDemoWrite(r, env)).rejects.toMatchObject({ status: 403 });
});
