import { beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../../apps/api/src/security';
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../apps/api/src/index', () => ({ app: { fetch: mock.fetch } }));
import worker from '../../apps/api/src/demo-test';
const env = { DEMO_TEST_OFFER_SLUG: 'test-giao-dich-demo' } as Env;
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
beforeEach(() => mock.fetch.mockReset());
it('rejects a non-local host before invoking the application', async () => {
  expect(
    (await worker.fetch(new Request('https://public.example/api/purchases'), env, ctx)).status,
  ).toBe(403);
  expect(mock.fetch).not.toHaveBeenCalled();
});
it('leaves public catalog selection to the shared application without forcing DEMO', async () => {
  mock.fetch.mockImplementation(async () => new Response('official catalog'));
  for (const suffix of ['', '?slug=ban-ket-2027', '?slug=test-giao-dich-demo']) {
    const request = new Request('http://127.0.0.1/api/purchase-catalog' + suffix);
    expect(await (await worker.fetch(request, env, ctx)).text()).toBe('official catalog');
    expect(mock.fetch).toHaveBeenLastCalledWith(request, env, ctx);
  }
});
it('preserves authentication and scope errors from the shared application', async () => {
  mock.fetch.mockResolvedValue(new Response('Authentication required', { status: 401 }));
  const request = new Request('http://localhost/api/purchases', { method: 'POST', body: '{}' });
  expect((await worker.fetch(request, env, ctx)).status).toBe(401);
  expect(mock.fetch).toHaveBeenCalledWith(request, env, ctx);
});
