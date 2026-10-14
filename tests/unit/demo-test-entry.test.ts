import { beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../../apps/api/src/security';

const mock = vi.hoisted(() => ({ fetch: vi.fn(), mode: 'DEMO', present: true }));
vi.mock('../../apps/api/src/index', () => ({ app: { fetch: mock.fetch } }));
vi.mock('../../apps/api/src/security', () => ({
  service: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          error: null,
          data:
            table === 'purchase_offers'
              ? {
                  id: 'demo-offer',
                  mode: mock.mode,
                  edition_id: 'demo-edition',
                  round_id: 'demo-round',
                }
              : mock.present
                ? { id: 'demo-purchase' }
                : null,
        }),
      };
      return query;
    },
  }),
}));
import worker from '../../apps/api/src/demo-test';
const env = { DEMO_TEST_OFFER_SLUG: 'test-giao-dich-demo' } as Env & {
  DEMO_TEST_OFFER_SLUG: string;
};
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
beforeEach(() => {
  mock.fetch.mockReset();
  mock.mode = 'DEMO';
  mock.present = true;
});
it('rejects non-local hosts and LIVE offers before passing to the application', async () => {
  expect(
    (await worker.fetch(new Request('https://public.example/api/purchases'), env, ctx)).status,
  ).toBe(403);
  mock.mode = 'LIVE';
  expect(
    (
      await worker.fetch(
        new Request('http://127.0.0.1/api/purchases', { method: 'POST', body: '{}' }),
        env,
        ctx,
      )
    ).status,
  ).toBe(503);
  expect(mock.fetch).not.toHaveBeenCalled();
});
it('rejects writes outside the approved offer and other modules', async () => {
  for (const request of [
    new Request('http://127.0.0.1/api/purchases', {
      method: 'POST',
      body: '{"offer_id":"live-offer"}',
    }),
    new Request('http://127.0.0.1/api/admin/purchase-offers', { method: 'POST', body: '{}' }),
  ])
    expect((await worker.fetch(request, env, ctx)).status).toBe(403);
  mock.present = false;
  expect(
    (
      await worker.fetch(
        new Request(
          'http://127.0.0.1/api/purchases/11111111-1111-4111-8111-111111111111/complete',
          { method: 'POST', body: '{}' },
        ),
        env,
        ctx,
      )
    ).status,
  ).toBe(403);
  expect(mock.fetch).not.toHaveBeenCalled();
});
it('delegates valid DEMO requests to existing application authentication', async () => {
  mock.fetch.mockResolvedValue(new Response('Authentication required', { status: 401 }));
  const request = new Request('http://127.0.0.1/api/purchases', {
    method: 'POST',
    body: '{"offer_id":"demo-offer"}',
  });
  expect((await worker.fetch(request, env, ctx)).status).toBe(401);
  expect(mock.fetch).toHaveBeenCalledWith(request, env, ctx);
});
it('permits admin configuration only within the DEMO scope and retains application authorization', async () => {
  mock.fetch.mockResolvedValue(new Response('MFA required', { status: 403 }));
  const request = new Request('http://127.0.0.1/api/admin/purchase-offers', {
    method: 'POST',
    body: JSON.stringify({
      id: 'demo-offer',
      mode: 'DEMO',
      edition_id: 'demo-edition',
      round_id: 'demo-round',
    }),
  });
  expect((await worker.fetch(request, env, ctx)).status).toBe(403);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
  mock.fetch.mockClear();
  const changedScope = new Request('http://127.0.0.1/api/admin/purchase-offers', {
    method: 'POST',
    body: JSON.stringify({
      id: 'demo-offer',
      mode: 'DEMO',
      edition_id: 'live-edition',
      round_id: 'demo-round',
    }),
  });
  expect((await worker.fetch(changedScope, env, ctx)).status).toBe(403);
  expect(mock.fetch).not.toHaveBeenCalled();
});
it('restricts public catalog reads to the approved DEMO slug', async () => {
  mock.fetch.mockImplementation(
    async (request: Request) => new Response(new URL(request.url).searchParams.get('slug')),
  );
  expect(
    await (
      await worker.fetch(new Request('http://127.0.0.1/api/purchase-catalog'), env, ctx)
    ).text(),
  ).toBe('test-giao-dich-demo');
  mock.fetch.mockClear();
  const response = await worker.fetch(
    new Request('http://127.0.0.1/api/purchase-catalog?slug=chung-ket-2027'),
    env,
    ctx,
  );
  expect(((await response.json()) as { data: { offers: unknown[] } }).data.offers).toEqual([]);
  expect(mock.fetch).not.toHaveBeenCalled();
});
