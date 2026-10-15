import { beforeEach, expect, it, vi } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import { hashBytes, proofSignature } from '../../apps/api/src/proof-signature';
import type { Env } from '../../apps/api/src/security';
const state = vi.hoisted(() => ({
  owner: 'owner',
  status: 'HELD',
  demo: true,
  auth: true,
  staff: false,
  expired: false,
}));
vi.mock('../../apps/api/src/security', () => ({
  authenticate: async () => {
    if (!state.auth) throw new HTTPException(401);
    return { id: 'owner' };
  },
  authorize: async () => {
    if (!state.staff) throw new HTTPException(403);
  },
  service: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          error: null,
          data:
            table === 'purchase_requests'
              ? {
                  user_id: state.owner,
                  status: state.status,
                  expires_at: new Date(Date.now() + (state.expired ? -60000 : 60000)).toISOString(),
                  offer_id: 'demo',
                }
              : state.demo
                ? { id: 'demo' }
                : null,
        }),
      };
      return q;
    },
  }),
}));
import { proofHandler } from '../../supabase/functions/ftu-proof-transform/handler';
const env = { DEMO_TEST_OFFER_SLUG: 'test-giao-dich-demo' } as Env;
const secret = 'local-fixture-key';
const id = '11111111-1111-4111-8111-111111111111';
const codec = vi.fn(() => new Uint8Array([1, 2, 3]));
const handler = proofHandler(env, codec, [secret]);
beforeEach(() => {
  Object.assign(state, {
    owner: 'owner',
    status: 'HELD',
    demo: true,
    auth: true,
    staff: false,
    expired: false,
  });
  codec.mockClear();
});
async function request(
  intent = 'owner',
  bytes = new Uint8Array([1, 2, 3]),
  time = String(Date.now()),
) {
  const r = new Request('https://fixture.test', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user',
      'Content-Type': 'image/png',
      'X-FTU-Purchase': id,
      'X-FTU-Proof-Intent': intent,
      'X-FTU-Proof-Time': time,
    },
    body: bytes,
  });
  const hash = await hashBytes(bytes);
  r.headers.set('X-FTU-Proof-Hash', hash);
  r.headers.set('X-FTU-Proof-Signature', await proofSignature(secret, r, id, intent, time, hash));
  return r;
}
it('requires the signed Worker call in addition to the real user authentication', async () => {
  const r = await request();
  r.headers.delete('X-FTU-Proof-Signature');
  expect((await handler(r)).status).toBe(401);
  state.auth = false;
  expect((await handler(await request())).status).toBe(401);
  expect(codec).not.toHaveBeenCalled();
});
it('rejects expired signatures, changed JWTs and body hash mismatches', async () => {
  expect(
    (await handler(await request('owner', new Uint8Array([1]), String(Date.now() - 60000)))).status,
  ).toBe(401);
  const r = await request();
  r.headers.set('Authorization', 'Bearer other');
  expect((await handler(r)).status).toBe(401);
  const altered = await request();
  altered.headers.set('X-FTU-Proof-Hash', 'a'.repeat(64));
  altered.headers.set(
    'X-FTU-Proof-Signature',
    await proofSignature(
      secret,
      altered,
      id,
      'owner',
      altered.headers.get('X-FTU-Proof-Time')!,
      'a'.repeat(64),
    ),
  );
  expect((await handler(altered)).status).toBe(400);
  expect(codec).not.toHaveBeenCalled();
});
it('rejects foreign, expired, completed and LIVE purchases before decoding', async () => {
  state.owner = 'someone-else';
  expect((await handler(await request())).status).toBe(404);
  state.owner = 'owner';
  state.expired = true;
  expect((await handler(await request())).status).toBe(409);
  state.expired = false;
  state.status = 'COMPLETED';
  expect((await handler(await request())).status).toBe(409);
  state.status = 'HELD';
  state.demo = false;
  expect((await handler(await request())).status).toBe(403);
  expect(codec).not.toHaveBeenCalled();
});
it('allows owned DEMO and checks staff authorization for completed proof replacements', async () => {
  const r = await handler(await request());
  expect(r.status).toBe(200);
  expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  state.status = 'COMPLETED';
  expect((await handler(await request('staff'))).status).toBe(403);
  state.staff = true;
  expect((await handler(await request('staff'))).status).toBe(200);
});
it('bounds streaming uploads before calling the codec', async () => {
  expect((await handler(await request('owner', new Uint8Array(5242881)))).status).toBe(413);
  expect(codec).not.toHaveBeenCalled();
});
