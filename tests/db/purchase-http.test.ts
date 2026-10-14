import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { Purchase, Ticket } from '@ftu/shared';
import {
  databaseAdapter,
  localEnvironment,
  testAuthenticate,
  testAuthorize,
  token,
  selection,
  owner,
  other,
  admin,
  type Query,
} from '../helpers/purchase-runtime';
import { app } from '../../apps/api/src/index';
let db: PGlite;
let query: Query;
vi.mock('../../apps/api/src/security', async (original) => {
  const source = await original<typeof import('../../apps/api/src/security')>();
  return {
    ...source,
    authenticate: testAuthenticate,
    authorize: (...args: Parameters<typeof source.authorize>) => testAuthorize(query, ...args),
    service: () => databaseAdapter(query),
    readClient: () => databaseAdapter(query),
  };
});
const { env, objects } = localEnvironment();
const request = (
  path: string,
  body?: unknown,
  user = owner,
  headers: Record<string, string> = {},
) =>
  app.request(
    'http://localhost/api' + path,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Authorization: token(user),
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof Uint8Array
            ? new Uint8Array(body).buffer
            : JSON.stringify(body),
    },
    env,
  );
const responseData = async <T>(r: Response) => ((await r.json()) as { data: T }).data;
beforeAll(async () => {
  db = new PGlite();
  query = (sql, params) => db.query(sql, params);
  await db.exec(
    "create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  );
  for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(
      (await readFile('supabase/migrations/' + f, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.exec(await readFile('tests/fixtures/purchases.sql', 'utf8'));
});
afterAll(async () => {
  await db.close();
});
it('guards authentication, Origin, input, idempotency and body limits before DB writes', async () => {
  expect(
    (
      await app.request(
        'http://localhost/api/purchases',
        { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN }, body: '{}' },
        env,
      )
    ).status,
  ).toBe(401);
  expect(
    (await request('/purchases', selection(), owner, { Origin: 'https://attacker.test' })).status,
  ).toBe(403);
  expect((await request('/purchases', { ...selection(), price: 1 })).status).toBe(400);
  expect(
    (await request('/purchases', selection(), owner, { 'Idempotency-Key': 'bad' })).status,
  ).toBe(400);
  expect((await request('/purchases', { payload: 'x'.repeat(66000) })).status).toBe(413);
});
it('completes the real HTTP->SQL flow with a private, transformed proof and idempotent vote rights', async () => {
  const held = await request('/purchases', selection(2));
  expect(held.status).toBe(200);
  const purchase = await responseData<Purchase>(held);
  expect((await request('/purchases/' + purchase.id, undefined, other)).status).toBe(404);
  expect(
    (
      await request(`/purchases/${purchase.id}/evidence`, new Uint8Array([1, 2, 3]), owner, {
        'Content-Type': 'image/png',
      })
    ).status,
  ).toBe(400);
  const png = new Uint8Array(
    await sharp({ create: { width: 100, height: 100, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer(),
  );
  const upload = await request(`/purchases/${purchase.id}/evidence`, png, owner, {
    'Content-Type': 'image/png',
  });
  expect(upload.status).toBe(200);
  const proof = await responseData<{ id: string }>(upload);
  expect(objects.size).toBe(1);
  const evidence = await request('/purchase-evidence/' + proof.id);
  expect(evidence.status).toBe(200);
  expect(evidence.headers.get('Content-Type')).toBe('image/webp');
  expect(evidence.headers.get('Cache-Control')).toContain('no-store');
  expect((await request('/purchase-evidence/' + proof.id, undefined, other)).status).toBe(403);
  for (let i = 0; i < 2; i++) {
    const completed = await request(`/purchases/${purchase.id}/complete`, {
      evidence_id: proof.id,
    });
    expect(completed.status).toBe(200);
    expect((await responseData<Purchase>(completed)).status).toBe('COMPLETED');
  }
  const own = await request('/me/tickets');
  expect(await responseData<Ticket[]>(own)).toHaveLength(2);
  const adminList = await request('/admin/purchases', undefined, admin, {
    Authorization: token(admin, 'aal2'),
  });
  expect(adminList.status).toBe(200);
  expect((await responseData<{ rows: Purchase[] }>(adminList)).rows).toHaveLength(1);
  expect((await request('/admin/purchases', undefined, owner)).status).toBe(403);
  expect((await request('/purchase-catalog')).status).toBe(200);
});
