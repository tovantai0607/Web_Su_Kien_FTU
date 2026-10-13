import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import type { SalesCatalog, SalesHold } from '@ftu/shared';
import type { Env } from '../../apps/api/src/security';
import { app } from '../../apps/api/src/index';

let db: PGlite;
let sequence = 0;
const user = '99010000-0000-4000-8000-000000000001',
  other = '99010000-0000-4000-8000-000000000002';
const event = '99010000-0000-4000-8000-000000000040';
const seats = [60, 61, 62, 63].map((n) => `99010000-0000-4000-8000-${String(n).padStart(12, '0')}`);
vi.mock('../../apps/api/src/security', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../apps/api/src/security')>();
  return {
    ...original,
    authenticate: async (request: Request) => {
      const token = request.headers.get('Authorization');
      if (token !== 'Bearer test-owner' && token !== 'Bearer test-other') {
        const { HTTPException } = await import('hono/http-exception');
        throw new HTTPException(401, { message: 'TEST unauthenticated' });
      }
      return {
        id: token === 'Bearer test-owner' ? user : other,
        email: 'test@example.test',
        aal: 'aal1' as const,
      };
    },
    service: () => ({
      rpc: async (name: string, p: Record<string, unknown>) => {
        const parameters: Record<string, unknown[]> = {
          sales_catalog: [p.p_edition ?? null, p.p_event ?? null, p.p_slug ?? null],
          reserve_sales_seats: [p.p_user, p.p_event, p.p_seats, p.p_key, p.p_hash],
          read_sales_hold: [p.p_user, p.p_order],
          release_sales_hold: [p.p_user, p.p_order],
          expire_sales_holds: [p.p_event ?? null, p.p_limit ?? 100],
        };
        if (!(name in parameters)) throw new Error('Unexpected test RPC');
        const savepoint = `rpc_${++sequence}`;
        await db.exec(`savepoint ${savepoint}; set local role service_role`);
        try {
          const args = parameters[name];
          const result = await db.query<{ data: unknown }>(
            `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as data`,
            args,
          );
          await db.exec('set constraints all immediate; set constraints all deferred; reset role');
          await db.exec(`release savepoint ${savepoint}`);
          return { data: result.rows[0].data, error: null };
        } catch (error) {
          await db.exec(`rollback to savepoint ${savepoint}; release savepoint ${savepoint}`);
          return { data: null, error: { message: (error as Error).message } };
        }
      },
    }),
  };
});
const env: Env = {
  SUPABASE_URL: 'http://127.0.0.1',
  SUPABASE_PUBLISHABLE_KEY: 'test-only',
  SUPABASE_JWKS_URL: 'http://127.0.0.1/auth/v1/.well-known/jwks.json',
  ALLOWED_ORIGIN: 'https://ftucharm.test',
  DEMO_MODE: 'false',
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};
function request(
  path: string,
  body?: unknown,
  key: string = crypto.randomUUID(),
  token = 'test-owner',
) {
  return app.request(
    'http://localhost/api' + path,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
async function hold(selected = [seats[1]], key = crypto.randomUUID()) {
  const response = await request(`/events/${event}/holds`, { seat_ids: selected }, key);
  return { response, data: ((await response.json()) as { data: SalesHold }).data };
}
async function catalog() {
  const response = await request('/events/sales-test-event');
  return ((await response.json()) as { data: SalesCatalog }).data;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  );
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await db.exec(
      (await readFile('supabase/migrations/' + name, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.exec(await readFile('tests/fixtures/sales-inventory.sql', 'utf8'));
});
beforeEach(async () => {
  await db.exec('begin');
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});
describe('Stage 03 Hono HTTP with real PostgreSQL/PGlite RPCs (test auth boundary)', () => {
  it('projects published database inventory without owner/hash/payment data', async () => {
    const result = await catalog();
    expect(result.events[0]).toMatchObject({ available: 3, sale_state: 'OPEN' });
    expect(result.events[0].seats[0].state).toBe('SOLD');
    const text = JSON.stringify(result);
    expect(text).not.toContain('user_id');
    expect(text).not.toContain('token_hash');
    expect(Date.parse(result.server_time)).toBeGreaterThan(0);
  });
  it('shows details before opening but refuses holds; closed sale also refuses', async () => {
    await db.query(
      "update public.events set sale_open_at=clock_timestamp()+interval '1 hour',sale_close_at=clock_timestamp()+interval '2 hours' where id=$1",
      [event],
    );
    expect((await catalog()).events[0].sale_state).toBe('UPCOMING');
    expect((await hold()).response.status).toBe(409);
    await db.query(
      "update public.events set sale_open_at=clock_timestamp()-interval '2 hours',sale_close_at=clock_timestamp()-interval '1 hour' where id=$1",
      [event],
    );
    expect((await catalog()).events[0].sale_state).toBe('CLOSED');
    expect((await hold()).response.status).toBe(409);
  });
  it('hides unconfigured drafts and refuses unpublished events', async () => {
    await db.query('update public.events set published=false where id=$1', [event]);
    expect((await request('/events/sales-test-event')).status).toBe(404);
    expect((await hold()).response.status).toBe(404);
  });
  it('uses server prices, snapshots and one TTL for every seat', async () => {
    const result = await hold([seats[1], seats[2]]);
    expect(result.response.status).toBe(200);
    expect(result.data).toMatchObject({
      quantity: 2,
      total_vnd: 200000,
      status: 'PENDING_PAYMENT',
    });
    expect((await catalog()).events[0].available).toBe(1);
    expect(
      Date.parse(result.data.expires_at) - Date.parse(result.data.server_time),
    ).toBeLessThanOrEqual(300000);
  });
  it('idempotent retry preserves identity and expiry; changed selection conflicts', async () => {
    const key = crypto.randomUUID();
    const first = await hold([seats[1]], key);
    const retry = await hold([seats[1]], key);
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.data.expires_at).toBe(first.data.expires_at);
    expect((await hold([seats[2]], key)).response.status).toBe(409);
    expect(
      (await db.query<{ n: number }>('select count(*)::integer n from public.orders')).rows[0].n,
    ).toBe(1);
  });
  it('cannot read/release another owner hold', async () => {
    const { data } = await hold();
    expect(
      (await request(`/me/holds/${data.id}`, undefined, crypto.randomUUID(), 'test-other')).status,
    ).toBe(404);
    expect(
      (await request(`/me/holds/${data.id}/release`, {}, crypto.randomUUID(), 'test-other')).status,
    ).toBe(404);
    expect((await catalog()).events[0].available).toBe(2);
  });
  it('release twice restores stock exactly once', async () => {
    const { data } = await hold();
    for (let i = 0; i < 2; i++)
      expect((await request(`/me/holds/${data.id}/release`, {})).status).toBe(200);
    expect((await catalog()).events[0].available).toBe(3);
    expect(
      (await db.query<{ state: string }>('select state from public.seat_holds')).rows[0].state,
    ).toBe('RELEASED');
  });
  it('rejects occupied/cross-event seats atomically with no partial order', async () => {
    expect((await hold([seats[0], seats[1]])).response.status).toBe(409);
    expect((await hold([crypto.randomUUID()])).response.status).toBe(409);
    expect((await db.query('select id from public.orders')).rows).toHaveLength(0);
  });
  it('validates quantity, duplicates, injected price and missing idempotency', async () => {
    for (const body of [
      { seat_ids: [] },
      { seat_ids: Array(11).fill(seats[1]) },
      { seat_ids: [seats[1], seats[1]] },
      { seat_ids: [seats[1]], total_vnd: 1 },
    ])
      expect((await request(`/events/${event}/holds`, body)).status).toBe(400);
    expect(
      (await request(`/events/${event}/holds`, { seat_ids: [seats[1]] }, 'bad-key')).status,
    ).toBe(400);
  });
  it('requires authentication and rejects foreign Origin before touching stock', async () => {
    expect(
      (
        await request(
          `/events/${event}/holds`,
          { seat_ids: [seats[1]] },
          crypto.randomUUID(),
          'bad',
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await app.request(
          `http://localhost/api/events/${event}/holds`,
          { method: 'POST', headers: { Origin: 'https://evil.test' } },
          env,
        )
      ).status,
    ).toBe(403);
  });
  it('anon/authenticated cannot execute sales helpers', async () => {
    for (const role of ['anon', 'authenticated'])
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,'public.reserve_sales_seats(uuid,uuid,uuid[],uuid,text)','execute') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(false);
  });
  it('expiry restores all holds once, retains old attempt on retry', async () => {
    await db.query('update public.events set hold_ttl_seconds=1 where id=$1', [event]);
    const key = crypto.randomUUID();
    const first = await hold([seats[1]], key);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const retry = await hold([seats[1]], key);
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.data.status).toBe('EXPIRED');
    expect((await catalog()).events[0].available).toBe(3);
    expect((await db.query<{ n: number }>('select public.expire_sales_holds() n')).rows[0].n).toBe(
      0,
    );
  });
  it('stage 03 rollback removes only functions and preserves holds/history, then reapplies', async () => {
    const { data } = await hold();
    const down = (
      await readFile('supabase/rollbacks/20261013150000_ticket_inventory_operations.sql', 'utf8')
    )
      .replace(/^begin;\n/m, '')
      .replace(/commit;\s*$/, '');
    await db.exec(down);
    expect(
      (await db.query('select id from public.orders where id=$1', [data.id])).rows,
    ).toHaveLength(1);
    const up = (
      await readFile('supabase/migrations/20261013150000_ticket_inventory_operations.sql', 'utf8')
    )
      .replace(/^begin;\n/m, '')
      .replace(/commit;\s*$/, '');
    await db.exec(up);
    expect((await catalog()).events[0].available).toBe(2);
  });
});
