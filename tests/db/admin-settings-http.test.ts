import { beforeAll, afterAll, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import type { Env } from '../../apps/api/src/security';
import type { AccountAccess, AdminSettings } from '@ftu/shared';
let db: PGlite;
const id = (n: number) => `99010000-0000-4000-8000-${String(n).padStart(12, '0')}`;
vi.mock('../../apps/api/src/security', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../apps/api/src/security')>();
  return {
    ...original,
    authenticate: async (request: Request) => {
      const token = request.headers.get('Authorization');
      if (!['Bearer test-admin', 'Bearer test-user', 'Bearer test-aal1'].includes(token ?? '')) {
        const { HTTPException } = await import('hono/http-exception');
        throw new HTTPException(401);
      }
      return {
        id: token === 'Bearer test-user' ? id(2) : id(1),
        email: 'test@example.test',
        aal: token === 'Bearer test-aal1' ? 'aal1' : 'aal2',
      };
    },
    service: () => ({
      rpc: async (name: string, p: Record<string, unknown>) => {
        const parameters: Record<string, unknown[]> = {
          has_role: [p.p_user, p.p_roles],
          admin_event_settings: [p.p_actor, p.p_aal],
          save_sale_settings: [p.p_actor, p.p_aal, p.p_event, p.p_revision, p.p_phases],
          save_voting_settings: [p.p_actor, p.p_aal, p.p_round, p.p_open, p.p_close, p.p_reason],
        };
        if (!parameters[name]) throw new Error('Unexpected RPC');
        await db.exec('savepoint test_rpc;');
        try {
          const args = parameters[name];
          const result = await db.query<{ v: unknown }>(
            `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) v`,
            args,
          );
          await db.exec('release savepoint test_rpc;');
          return { data: result.rows[0].v, error: null };
        } catch (e) {
          await db.exec('rollback to savepoint test_rpc;release savepoint test_rpc;');
          return { data: null, error: { message: (e as Error).message } };
        }
      },
    }),
  };
});
import { app } from '../../apps/api/src/index';
const env = {
  SUPABASE_URL: 'https://settings-db.test',
  SUPABASE_SECRET_KEY: 'test-server-key',
  ALLOWED_ORIGIN: 'https://settings.test',
  DEMO_MODE: 'false',
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as Env;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(
      (await readFile('supabase/migrations/' + f, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.exec(await readFile('tests/fixtures/sales-inventory.sql', 'utf8'));
  await db.query("insert into public.user_roles values($1,'SUPER_ADMIN')", [id(1)]);
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec('begin;');
  // Keep the real authorize implementation; its private SDK uses a fake PostgREST transport.
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname !== '/rest/v1/rpc/has_role') throw new Error('Unexpected external request');
    const body = JSON.parse(String(init?.body));
    const result = await db.query<{ v: boolean }>('select public.has_role($1,$2) v', [
      body.p_user,
      body.p_roles,
    ]);
    return new Response(JSON.stringify(result.rows[0].v), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.exec('rollback;');
});
function request(path: string, token = 'test-admin', body?: unknown) {
  return app.request(
    'https://settings.test/api' + path,
    {
      method: body ? 'PUT' : 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Origin: env.ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
}
it('returns only the authenticated account capability and rejects private settings access', async () => {
  expect(
    ((await (await request('/me/access', 'test-user')).json()) as { data: AccountAccess }).data,
  ).toEqual({
    is_admin: false,
    aal: 'aal2',
  });
  expect((await request('/admin/settings', 'test-user')).status).toBe(403);
  expect((await request('/admin/settings', 'test-aal1')).status).toBe(200);
  expect((await request('/admin/settings', 'invalid')).status).toBe(401);
  expect((await request('/admin/settings')).status).toBe(200);
});
it('validates phase configuration and stores both category prices through the protected API', async () => {
  const body = {
    revision: 0,
    phases: [
      {
        kind: 'REGULAR',
        open_at: new Date(Date.now() - 60000).toISOString(),
        close_at: new Date(Date.now() + 3600000).toISOString(),
        prices: [
          { category_id: id(50), price_vnd: 90000 },
          { category_id: id(51), price_vnd: 120000 },
        ],
      },
    ],
  };
  expect((await request(`/admin/events/${id(40)}/sale-settings`, 'test-user', body)).status).toBe(
    403,
  );
  expect((await request(`/admin/events/${id(40)}/sale-settings`, 'test-aal1', body)).status).toBe(
    200,
  );
  const settings = ((await (await request('/admin/settings')).json()) as { data: AdminSettings })
    .data;
  expect(settings.events.find((e: { id: string }) => e.id === id(40))!.phases[0].prices).toEqual(
    expect.arrayContaining([
      { category_id: id(50), price_vnd: 90000 },
      { category_id: id(51), price_vnd: 120000 },
    ]),
  );
  expect((await request(`/admin/events/${id(40)}/sale-settings`, 'test-admin', body)).status).toBe(
    409,
  );
  expect(
    (
      await request(`/admin/events/${id(40)}/sale-settings`, 'test-admin', {
        ...body,
        revision: 1,
        phases: [],
      })
    ).status,
  ).toBe(400);
});
it('rejects cross-origin mutations and invalid voting windows before database writes', async () => {
  const body = { open_at: '2026-10-14T13:00:00Z', close_at: '2026-10-14T12:00:00Z' };
  expect(
    (await request(`/admin/rounds/${id(20)}/voting-settings`, 'test-admin', body)).status,
  ).toBe(400);
  const response = await app.request(
    `https://settings.test/api/admin/rounds/${id(20)}/voting-settings`,
    {
      method: 'PUT',
      headers: {
        Origin: 'https://other.test',
        Authorization: 'Bearer test-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    env,
  );
  expect(response.status).toBe(403);
});
