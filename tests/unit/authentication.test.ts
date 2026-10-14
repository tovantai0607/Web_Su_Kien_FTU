import { beforeAll, afterEach, it, expect, vi } from 'vitest';
import { SignJWT, jwtVerify, generateKeyPair, exportJWK, type JWTPayload } from 'jose';
import { authenticate, type Env } from '../../apps/api/src/security';
const project = 'https://auth-fixture.supabase.co';
const env: Env = {
  SUPABASE_URL: project,
  SUPABASE_JWKS_URL: project + '/auth/v1/.well-known/jwks.json',
  SUPABASE_PUBLISHABLE_KEY: 'test-only',
  ALLOWED_ORIGIN: 'http://localhost',
};
const owner = '99010000-0000-4000-8000-000000000001';
const secret = new TextEncoder().encode('local-test-signing-secret-never-used-by-a-service');
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  keys = await generateKeyPair('ES256');
});
afterEach(() => vi.unstubAllGlobals());
async function token(claims: JWTPayload = {}, asymmetric = false, signingSecret = secret) {
  return new SignJWT({
    iss: project + '/auth/v1',
    aud: 'authenticated',
    sub: owner,
    exp: Math.floor(Date.now() / 1000) + 300,
    aal: 'aal2',
    ...claims,
  })
    .setProtectedHeader(asymmetric ? { alg: 'ES256', kid: 'test-key' } : { alg: 'HS256' })
    .sign(asymmetric ? keys.privateKey : signingSecret);
}
async function authServer(
  options: { confirmed?: boolean; differentOwner?: boolean; networkFailure?: boolean } = {},
) {
  const jwk = await exportJWK(keys.publicKey);
  const handler = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (options.networkFailure) throw Error('offline');
    const url = String(input);
    if (url.endsWith('/.well-known/jwks.json'))
      return Response.json({ keys: [{ ...jwk, kid: 'test-key', alg: 'ES256', use: 'sig' }] });
    expect(url).toBe(project + '/auth/v1/user');
    const bearer = new Headers(init?.headers).get('authorization')?.slice(7) ?? '';
    try {
      const alg = JSON.parse(Buffer.from(bearer.split('.')[0], 'base64url').toString()).alg;
      await jwtVerify(bearer, alg === 'ES256' ? keys.publicKey : secret, {
        algorithms: ['HS256', 'ES256'],
      });
      return Response.json({
        id: options.differentOwner ? 'other' : owner,
        email: 'fixture@example.test',
        email_confirmed_at: options.confirmed === false ? null : '2026-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-01-01T00:00:00Z',
      });
    } catch {
      return Response.json({ msg: 'Invalid token', error_code: 'bad_jwt' }, { status: 401 });
    }
  });
  vi.stubGlobal('fetch', handler);
  return handler;
}
async function verify(value: string) {
  return authenticate(
    new Request('http://localhost/api/me/access', {
      headers: { Authorization: 'Bearer ' + value },
    }),
    env,
  );
}
it('verifies legacy HS256 through Supabase Auth and preserves signed MFA claims', async () => {
  await authServer();
  expect(await verify(await token())).toEqual({
    id: owner,
    email: 'fixture@example.test',
    aal: 'aal2',
  });
});
it('verifies asymmetric tokens with project JWKS and checks the current user', async () => {
  await authServer();
  expect((await verify(await token({}, true))).id).toBe(owner);
});
it('rejects signatures made with an unrelated secret', async () => {
  await authServer();
  await expect(
    verify(await token({}, false, new TextEncoder().encode('wrong-test-key'))),
  ).rejects.toMatchObject({ status: 401 });
});
it('rejects a forged MFA claim without a matching signature', async () => {
  await authServer();
  const original = await token({ aal: 'aal1' });
  const parts = original.split('.');
  parts[1] = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), aal: 'aal2' }),
  ).toString('base64url');
  await expect(verify(parts.join('.'))).rejects.toMatchObject({ status: 401 });
});
it.each([
  { iss: 'https://other.supabase.co/auth/v1' },
  { aud: 'service_role' },
  { exp: 1 },
  { nbf: Math.floor(Date.now() / 1000) + 300 },
])('rejects tokens with invalid scope/time: %j', async (claims) => {
  await authServer();
  await expect(verify(await token(claims))).rejects.toMatchObject({ status: 401 });
});
it.each([{ confirmed: false }, { differentOwner: true }, { networkFailure: true }])(
  'fails closed for invalid account or network state: %j',
  async (options) => {
    await authServer(options);
    await expect(verify(await token())).rejects.toMatchObject({ status: 401 });
  },
);
