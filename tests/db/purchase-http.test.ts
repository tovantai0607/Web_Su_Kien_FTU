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
  fixture,
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
    readClient: () => {
      const publicClient = databaseAdapter(query);
      return {
        ...publicClient,
        rpc: (name: string, args: Record<string, unknown>) =>
          name === 'read_vote_participation'
            ? Promise.resolve({
                data: null,
                error: {
                  code: '42501',
                  message: 'permission denied for function read_vote_participation',
                },
              })
            : publicClient.rpc(name, args),
      };
    },
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
  objects.clear();
  await db.close();
});
it('serves both official nights publicly, restricts DEMO to admins, and fences writes before mutation', async () => {
  const scoped = {
    ...env,
    PUBLIC_EDITION_SLUG: 'ftucharm-2027',
    DEMO_TEST_OFFER_SLUG: 'ban-ket-local',
  };
  const call = (path: string, body?: unknown, user: string | null = owner) =>
    app.request(
      'http://localhost/api' + path,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: env.ALLOWED_ORIGIN,
          ...(user ? { Authorization: token(user, user === admin ? 'aal2' : 'aal1') } : {}),
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      scoped,
    );
  await db.exec('begin');
  try {
    await db.exec(
      (await readFile('tools/configure-official-program-2027.sql', 'utf8'))
        .replace(/^begin;\s*$/m, '')
        .replace(/^commit;\s*$/m, ''),
    );
    const catalog = await responseData<{ offers: { mode: string; slug: string }[] }>(
      await call('/purchase-catalog', undefined, null),
    );
    expect(catalog.offers).toHaveLength(2);
    expect(catalog.offers.every((o) => o.mode === 'LIVE')).toBe(true);
    expect(catalog.offers.map((o) => o.slug).sort()).toEqual(['ban-ket-2027', 'chung-ket-2027']);
    const rounds = await responseData<{ id: string }[]>(await call('/rounds'));
    expect(rounds).toHaveLength(2);
    expect(rounds.map((r) => r.id)).not.toContain(fixture(20));
    for (const path of [
      '/purchase-catalog?slug=ban-ket-local',
      '/rounds?demo=1',
      '/voting/' + fixture(20),
    ]) {
      expect((await call(path, undefined, null)).status).toBe(401);
      expect((await call(path)).status).toBe(403);
      expect((await call(path, undefined, admin)).status).toBe(200);
    }
    const demoCatalog = await responseData<{ offers: { mode: string }[] }>(
      await call('/purchase-catalog?slug=ban-ket-local', undefined, admin),
    );
    expect(demoCatalog.offers.map((o) => o.mode)).toEqual(['DEMO']);
    const voting = await responseData<{ demo_leaderboard: { rows: unknown[]; session_id: null } }>(
      await call('/voting/' + fixture(20), undefined, admin),
    );
    expect(voting.demo_leaderboard).toEqual({ rows: [], session_id: null });
    expect((await call('/purchases', { ...selection(), offer_id: fixture(99) })).status).toBe(403);
    // Official registration reaches its own strict validation; DEMO purchase guards stay intact.
    expect((await call('/contestants/apply', {})).status).toBe(400);
    expect((await call('/purchases', selection())).status).toBe(403);
    expect((await call('/votes', { round_id: fixture(20) })).status).toBe(403);
    expect(
      (await call('/purchases', { ...selection(), offer_id: fixture(99) }, admin)).status,
    ).toBe(403);
    expect((await call('/purchases', selection(), admin)).status).toBe(200);
    // Previously created DEMO orders remain intact, but their ordinary owner cannot open them.
    const old = await responseData<Purchase>(await request('/purchases', selection()));
    expect((await call('/purchases/' + old.id)).status).toBe(403);
    const png = new Uint8Array(
      await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 3,
          background: '#ffffff',
        },
      })
        .png()
        .toBuffer(),
    );
    const proof = await responseData<{ id: string }>(
      await request(`/purchases/${old.id}/evidence`, png, owner, { 'Content-Type': 'image/png' }),
    );
    expect((await request(`/purchases/${old.id}/complete`, { evidence_id: proof.id })).status).toBe(
      200,
    );
    expect(await responseData<Ticket[]>(await request('/me/tickets'))).toHaveLength(1);
    expect(await responseData<Ticket[]>(await call('/me/tickets'))).toEqual([]);
    expect((await call('/purchase-evidence/' + proof.id)).status).toBe(403);
    expect((await call('/purchase-evidence/' + proof.id, undefined, admin)).status).toBe(200);
    expect(await responseData<Purchase[]>(await call('/me/purchases'))).toEqual([]);
    expect(
      (
        await responseData<{ rows: Purchase[] }>(
          await call('/admin/sheets/purchases', undefined, admin),
        )
      ).rows,
    ).toHaveLength(1);
    expect((await call('/voting/' + rounds[0].id, undefined, null)).status).toBe(200);
  } finally {
    await db.exec('rollback');
    objects.clear();
  }
});
it('serves public vote participation through the privileged server client without granting the public client execute', async () => {
  const privileges = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('anon','public.read_vote_participation(uuid)','EXECUTE') allowed",
  );
  expect(privileges.rows[0].allowed).toBe(false);
  const response = await request('/voting/' + fixture(20));
  expect(response.status).toBe(200);
  const data = await responseData<{ participation: { participants: number; votes: number } }>(
    response,
  );
  expect(data.participation).toEqual({ participants: 0, votes: 0 });
  expect((data as { demo_leaderboard?: unknown }).demo_leaderboard).toBeNull();
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
  expect((await request('/purchase-evidence/' + proof.id + '?view=sheet')).status).toBe(403);
  const sheetImage = await app.request(
    '/api/purchase-evidence/' + proof.id + '?view=sheet',
    { headers: { Authorization: token(admin, 'aal2') } },
    env,
  );
  expect(sheetImage.status).toBe(200);
  expect(sheetImage.headers.get('Content-Type')).toBe('image/jpeg');
  expect(sheetImage.headers.get('Cache-Control')).toContain('no-store');
  expect((await sharp(Buffer.from(await sheetImage.arrayBuffer())).metadata()).format).toBe('jpeg');
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
  const exportList = await request('/admin/sheets/purchases', undefined, admin, {
    Authorization: token(admin, 'aal2'),
  });
  expect(exportList.status).toBe(200);
  expect(
    (await responseData<{ rows: (Purchase & { revision: number })[] }>(exportList)).rows[0]
      .revision,
  ).toBe(0);
  const edit = {
    operation_id: crypto.randomUUID(),
    expected_revision: 0,
    code: purchase.code,
    buyer: { ...purchase.buyer, email: 'new-contact@example.test' },
    lines: purchase.lines.map((line) => ({
      product_id: line.product_id,
      bundle_size: line.bundle_size,
      quantity: line.quantity,
    })),
    evidence_id: proof.id,
  };
  expect((await request(`/admin/sheets/purchases/${purchase.id}`, edit, other)).status).toBe(403);
  const saved = await request(`/admin/sheets/purchases/${purchase.id}`, edit, admin, {
    Authorization: token(admin, 'aal2'),
  });
  expect(saved.status).toBe(200);
  expect((await responseData<Purchase>(saved)).buyer.email).toBe('new-contact@example.test');
  expect(
    (
      await request(
        `/admin/sheets/purchases/${purchase.id}`,
        { ...edit, operation_id: crypto.randomUUID() },
        admin,
        { Authorization: token(admin, 'aal2') },
      )
    ).status,
  ).toBe(409);
  const replacementId = crypto.randomUUID();
  const replaceProof = () =>
    request(`/admin/sheets/purchases/${purchase.id}/evidence`, png, admin, {
      Authorization: token(admin, 'aal2'),
      'Content-Type': 'image/png',
      'Idempotency-Key': replacementId,
    });
  const stagedProof = await replaceProof();
  expect(stagedProof.status, await stagedProof.clone().text()).toBe(200);
  expect((await replaceProof()).status).toBe(200);
  const replaceEdit = {
    ...edit,
    operation_id: crypto.randomUUID(),
    expected_revision: 1,
    evidence_id: replacementId,
  };
  expect(
    (
      await request(`/admin/sheets/purchases/${purchase.id}`, replaceEdit, admin, {
        Authorization: token(admin, 'aal2'),
      })
    ).status,
  ).toBe(200);
  expect((await request('/purchase-evidence/' + proof.id)).status).toBe(200);
  expect((await request('/purchase-evidence/' + replacementId)).status).toBe(200);
  const currentProof = await request('/purchases/' + purchase.id);
  expect((await responseData<Purchase>(currentProof)).evidence_id).toBe(replacementId);
});

it('exports the role-protected code register and returns only the caller’s own display codes', async () => {
  await query('select public.configure_ticket_code_stock($1,$2,$3,$4)', [
    fixture(40),
    'DM',
    50,
    600,
  ]);
  const forbidden = await request('/admin/sheets/ticket-codes?mode=DEMO', undefined, other);
  expect(forbidden.status).toBe(403);
  const result = await request('/admin/sheets/ticket-codes?mode=DEMO', undefined, admin, {
    Authorization: token(admin, 'aal2'),
  });
  expect(result.status).toBe(200);
  const register = await responseData<{ count: number; rows: { code: string }[] }>(result);
  expect(register.count).toBe(50);
  expect(register.rows[0].code).toBe('DM00001');
  const own = await responseData<(Ticket & { display_code: string })[]>(
    await request('/me/tickets'),
  );
  expect(own.length).toBeGreaterThan(0);
  expect(own.every((t) => /^DM\d{5}$/.test(t.display_code))).toBe(true);
  expect(new Set(own.map((t) => t.display_code)).size).toBe(own.length);
  const otherTickets = await responseData<Ticket[]>(await request('/me/tickets', undefined, other));
  expect(otherTickets).toHaveLength(0);
});
