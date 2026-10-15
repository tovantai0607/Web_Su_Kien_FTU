import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../../apps/api/src/security';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
vi.mock('../../apps/api/src/security', () => ({
  service: () => ({ storage: { from: () => mocks } }),
}));
import { proofStorage, remoteProofTransform } from '../../apps/api/src/proof-storage';
import { proofSignature, hashBytes } from '../../apps/api/src/proof-signature';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable',
  SUPABASE_SECRET_KEY: 'fixture-private',
  PURCHASE_PROOF_BUCKET: 'private-proof',
  PURCHASE_PROOF_FUNCTION: 'ftu-proof-transform',
} as Env;
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());
it('never upserts proof bytes and treats conditional duplicate as a retry conflict', async () => {
  const store = proofStorage(env);
  mocks.upload.mockResolvedValue({ error: null });
  expect(await store.put('private/proof.webp', new ArrayBuffer(4))).toBe(true);
  expect(mocks.upload.mock.calls[0][2]).toMatchObject({ upsert: false, contentType: 'image/webp' });
  mocks.upload.mockResolvedValue({ error: { statusCode: '409' } });
  expect(await store.put('private/proof.webp', new ArrayBuffer(4), true)).toBe(false);
  await expect(store.put('private/proof.webp', new ArrayBuffer(4))).rejects.toMatchObject({
    status: 503,
  });
});
it('returns a private blob and distinguishes missing objects from unavailable storage', async () => {
  const store = proofStorage(env);
  mocks.download.mockResolvedValue({ error: null, data: new Blob(['processed']) });
  expect(await (await store.get('private/proof.webp'))?.text()).toBe('processed');
  mocks.download.mockResolvedValue({ error: { statusCode: '404', message: 'Object not found' } });
  expect(await store.get('private/proof.webp')).toBeNull();
  mocks.download.mockResolvedValue({
    error: { statusCode: '500', message: 'private provider details' },
  });
  await expect(store.get('private/proof.webp')).rejects.toMatchObject({ status: 503 });
});
it('fails closed when storage or the trusted image processor is unconfigured', async () => {
  expect(() => proofStorage({} as Env)).toThrow('chưa được cấu hình');
  await expect(
    remoteProofTransform(
      new Request('https://fixture.test'),
      {} as Env,
      new ArrayBuffer(0),
      'id',
      false,
    ),
  ).rejects.toMatchObject({ status: 503 });
});
it('signs image bytes, authenticated user, purchase and intent with a server-only key', async () => {
  const request = new Request('https://fixture.test', {
    headers: { Authorization: 'Bearer verified-user', 'Content-Type': 'image/png' },
  });
  const raw = new Uint8Array([1, 2, 3]).buffer;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(env.SUPABASE_URL + '/functions/v1/ftu-proof-transform');
    const headers = new Headers(init.headers);
    expect(headers.get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    expect(headers.get('X-FTU-Proof-Signature')).toBe(
      await proofSignature(
        env.SUPABASE_SECRET_KEY!,
        request,
        'order-id',
        'owner',
        headers.get('X-FTU-Proof-Time')!,
        await hashBytes(new Uint8Array(raw)),
      ),
    );
    expect(JSON.stringify(init.headers)).not.toContain(env.SUPABASE_SECRET_KEY);
    return new Response(new Uint8Array([4, 5, 6]), { headers: { 'Content-Type': 'image/webp' } });
  });
  vi.stubGlobal('fetch', fetcher);
  expect(new Uint8Array(await remoteProofTransform(request, env, raw, 'order-id', false))).toEqual(
    new Uint8Array([4, 5, 6]),
  );
});
it('rejects non-image processor replies and never silently stores the original upload', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('gateway HTML', { headers: { 'Content-Type': 'text/html' } })),
  );
  await expect(
    remoteProofTransform(
      new Request('https://fixture.test', { headers: { 'Content-Type': 'image/png' } }),
      env,
      new ArrayBuffer(2),
      'id',
      false,
    ),
  ).rejects.toMatchObject({ status: 503 });
});
