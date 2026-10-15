import { describe, it, expect } from 'vitest';
import { app } from '../../apps/api/src/index';
import type { Env } from '../../apps/api/src/security';
const env: Env = {
  SUPABASE_URL: 'https://ifgtyslifgegwcguysbb.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test',
  SUPABASE_JWKS_URL: 'https://ifgtyslifgegwcguysbb.supabase.co/auth/v1/.well-known/jwks.json',
  ALLOWED_ORIGIN: 'https://ftucharm.test',
  DEMO_MODE: 'true',
};
describe('Worker HTTP protections', () => {
  it('identifies the isolated DEMO test without calling the database', async () => {
    const response = await app.request(
      'http://localhost/api/health',
      {},
      {
        ...env,
        DEMO_MODE: 'false',
        DEMO_TEST_OFFER_SLUG: 'test-giao-dich-demo',
      },
    );
    expect(await response.json()).toMatchObject({ status: 'ok', mode: 'demo-test' });
  });
  it('preview GET works and returns public contestant projection', async () => {
    const r = await app.request('http://localhost/api/contestants', {}, env);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain('email');
    expect(text).not.toContain('user_id');
  });
  it('preview never returns fake write success', async () => {
    const r = await app.request(
      'http://localhost/api/votes',
      { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN } },
      env,
    );
    expect(r.status).toBe(503);
  });
  it('cross-origin mutation is rejected before auth or DB', async () => {
    const r = await app.request(
      'http://localhost/api/votes',
      { method: 'POST', headers: { Origin: 'https://evil.test' } },
      { ...env, DEMO_MODE: 'false' },
    );
    expect(r.status).toBe(403);
  });
  it('private admin and application API deny missing auth', async () => {
    for (const path of ['admin/applications', 'me/application', 'me/tickets']) {
      const r = await app.request('http://localhost/api/' + path, {}, env);
      expect(r.status).toBe(401);
    }
  });
  it('malformed bearer tokens cannot reach admin', async () => {
    const r = await app.request(
      'http://localhost/api/admin/overview',
      { headers: { Authorization: 'Bearer fake.token.signature' } },
      env,
    );
    expect(r.status).toBe(401);
  });
  it('unknown API is 404 and adds security headers', async () => {
    const r = await app.request('http://localhost/api/unknown', {}, env);
    expect(r.status).toBe(404);
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Security-Policy')).toContain("object-src 'none'");
  });
});
