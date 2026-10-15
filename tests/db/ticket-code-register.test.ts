import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import { fixture, owner, other, admin, offerId, selection } from '../helpers/purchase-runtime';
import type { Purchase } from '@ftu/shared';
let db: PGlite;
async function rpc<T = Purchase>(name: string, args: unknown[]) {
  await db.exec('savepoint call_rpc');
  try {
    const data = (
      await db.query<{ data: T }>(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) data`,
        args,
      )
    ).rows[0].data;
    await db.exec('release savepoint call_rpc');
    return data;
  } catch (error) {
    await db.exec('rollback to savepoint call_rpc;release savepoint call_rpc');
    throw error;
  }
}
const configure = (initial = 50, capacity = 600) =>
  rpc('configure_ticket_code_stock', [offerId, 'DM', initial, capacity]);
async function reserve(n = 1, bundle = 1) {
  const data = selection(n);
  data.lines[0].bundle_size = bundle;
  return rpc('reserve_purchase', [owner, data, crypto.randomUUID(), 'a'.repeat(64)]);
}
async function proof(p: Purchase) {
  const evidence = crypto.randomUUID();
  await rpc('attach_purchase_evidence', [
    owner,
    p.id,
    evidence,
    `private/purchases/${owner}/${p.id}/${evidence}.webp`,
    100,
  ]);
  return evidence;
}
const finish = async (p: Purchase, evidence?: string) =>
  rpc('complete_purchase', [owner, p.id, evidence ?? (await proof(p))]);
beforeAll(async () => {
  db = new PGlite();
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
beforeEach(() => db.exec('begin'));
afterEach(() => db.exec('rollback'));
afterAll(() => db.close());
it('prepares fifty unique empty codes without issuing tickets or changing quota', async () => {
  const before = (
    await db.query<Record<string, unknown>>(
      'select quota from public.purchase_products where id=$1',
      [fixture(50)],
    )
  ).rows[0].quota;
  expect(await configure()).toMatchObject({ count: 50, assigned: 0, available: 50 });
  const result = await db.query<Record<string, unknown>>(
    'select count(*) n,count(distinct code) unique_count,min(code) first,max(code) last from ftu_sales_private.ticket_code_slots',
  );
  expect(result.rows[0]).toMatchObject({
    n: 50,
    unique_count: 50,
    first: 'DM00001',
    last: 'DM00050',
  });
  expect(
    (await db.query<Record<string, unknown>>('select count(*) n from public.tickets')).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select quota from public.purchase_products where id=$1',
        [fixture(50)],
      )
    ).rows[0].quota,
  ).toBe(before);
});
it('prepares separate seven-hundred-code LIVE stocks with exact five-digit BK/CK suffixes', async () => {
  await db.query<Record<string, unknown>>(
    "insert into public.contest_rounds(id,edition_id,title,kind,position,published) values($1,$2,'FINAL TEST','final',1,true)",
    [fixture(21), fixture(10)],
  );
  for (const [number, prefix, round] of [
    [41, 'BK', 20],
    [42, 'CK', 21],
  ] as const) {
    await db.query<Record<string, unknown>>(
      "insert into public.purchase_offers(id,edition_id,round_id,slug,title,venue,mode,total_quota,early_quota,early_open_at,early_close_at,normal_close_at) values($1,$2,$3,$4,'LIVE TEST','TEST','LIVE',700,100,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 day')",
      [fixture(number), fixture(10), fixture(round), 'live-test-' + prefix.toLowerCase()],
    );
    expect(
      await rpc('configure_ticket_code_stock', [fixture(number), prefix, 700, 700]),
    ).toMatchObject({ count: 700, assigned: 0 });
  }
  const rows = (
    await db.query<Record<string, unknown>>(
      'select count(*) n,count(distinct code) unique_count,min(code) first,max(code) last from ftu_sales_private.ticket_code_slots',
    )
  ).rows[0];
  expect(rows).toMatchObject({ n: 1400, unique_count: 1400, first: 'BK00001', last: 'CK00700' });
});
it('assigns three consecutive unique codes to a completed Combo3, grouped together, and never duplicates on retry', async () => {
  await configure();
  const p = await reserve(1, 3),
    evidence = await proof(p);
  await finish(p, evidence);
  await finish(p, evidence);
  const rows = (
    await db.query<{ code: string; ticket_id: string; line: { group_code: string } }>(
      `select s.code,s.ticket_id,ftu_sales_private.ticket_code_line(t.purchase_id,t.purchase_ordinal) line from ftu_sales_private.ticket_code_slots s join public.tickets t on t.id=s.ticket_id order by s.sequence`,
    )
  ).rows;
  expect(rows.map((r) => r.code)).toEqual(['DM00001', 'DM00002', 'DM00003']);
  expect(new Set(rows.map((r) => r.ticket_id)).size).toBe(3);
  expect(new Set(rows.map((r) => r.line.group_code)).size).toBe(1);
  const next = await reserve();
  await finish(next);
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select count(ticket_id) n from ftu_sales_private.ticket_code_slots',
      )
    ).rows[0].n,
  ).toBe(4);
});
it('keeps two buyers and multiple Combo3 groups separate in completion order, including retries', async () => {
  await configure();
  const firstBuyer = await reserve(2, 3);
  const data = selection();
  data.lines[0].bundle_size = 3;
  data.buyer = { ...data.buyer, name: 'SECOND DEMO BUYER', email: 'second@example.test' };
  const secondBuyer = await rpc('reserve_purchase', [
    other,
    data,
    crypto.randomUUID(),
    'b'.repeat(64),
  ]);
  const evidence = crypto.randomUUID();
  await rpc('attach_purchase_evidence', [
    other,
    secondBuyer.id,
    evidence,
    `private/purchases/${other}/${secondBuyer.id}/${evidence}.webp`,
    100,
  ]);
  // The later reservation finishes first: allocation follows successful completion.
  await rpc('complete_purchase', [other, secondBuyer.id, evidence]);
  await finish(firstBuyer);
  await rpc('complete_purchase', [other, secondBuyer.id, evidence]);
  const register = await rpc<{
    rows: {
      code: string;
      request_id: string;
      buyer: { name: string; email: string };
      line: { group_code: string; bundle_size: number };
    }[];
  }>('read_ticket_code_register', [admin, 'aal1', 'DEMO', 0]);
  const issued = register.rows.filter((row) => row.request_id);
  expect(issued).toHaveLength(9);
  const second = issued.filter((row) => row.request_id === secondBuyer.id);
  expect(second.map((row) => row.code)).toEqual(['DM00001', 'DM00002', 'DM00003']);
  expect(new Set(second.map((row) => row.line.group_code)).size).toBe(1);
  for (const row of second) {
    expect(row.buyer).toMatchObject(data.buyer);
    expect(row.line.bundle_size).toBe(3);
  }
  const first = issued.filter((row) => row.request_id === firstBuyer.id);
  expect(first.map((row) => row.code)).toEqual([
    'DM00004',
    'DM00005',
    'DM00006',
    'DM00007',
    'DM00008',
    'DM00009',
  ]);
  expect(new Set(first.map((row) => row.line.group_code)).size).toBe(2);
  expect(new Set(first.slice(0, 3).map((row) => row.line.group_code)).size).toBe(1);
  expect(new Set(first.slice(3).map((row) => row.line.group_code)).size).toBe(1);
  expect(first[0].line.group_code).not.toBe(first[3].line.group_code);
  expect(first[0].line.group_code).not.toBe(second[0].line.group_code);
  for (const row of first) expect(row.buyer).toMatchObject(selection().buyer);
  const ownership = (
    await db.query<{ correct: boolean }>(
      'select bool_and(t.user_id=r.user_id) correct from public.tickets t join public.purchase_requests r on r.id=t.purchase_id',
    )
  ).rows[0];
  expect(ownership.correct).toBe(true);
});
it('backfills existing completed tickets idempotently without changing legacy codes or UUIDs', async () => {
  const p = await reserve(2);
  await finish(p);
  const before = (
    await db.query<Record<string, unknown>>('select id,ticket_code from public.tickets order by id')
  ).rows;
  await configure();
  await configure();
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select id,ticket_code from public.tickets order by id',
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select count(ticket_id) n from ftu_sales_private.ticket_code_slots',
      )
    ).rows[0].n,
  ).toBe(2);
  await expect(rpc('configure_ticket_code_stock', [offerId, 'BK', 50, 700])).rejects.toThrow(
    'INVALID_TICKET_CODE_SCOPE',
  );
});
it('rolls back completion and every code assignment if the configured stock capacity is insufficient', async () => {
  await configure(1, 2);
  const p = await reserve(3),
    evidence = await proof(p);
  await expect(finish(p, evidence)).rejects.toThrow('TICKET_CODE_STOCK_EXHAUSTED');
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select status from public.purchase_requests where id=$1',
        [p.id],
      )
    ).rows[0].status,
  ).toBe('HELD');
  expect(
    (await db.query<Record<string, unknown>>('select count(*) n from public.tickets')).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select count(ticket_id) n from ftu_sales_private.ticket_code_slots',
      )
    ).rows[0].n,
  ).toBe(0);
});
it('exposes buyer data only through the role-checked register and never through private tables', async () => {
  await configure();
  const p = await reserve();
  await finish(p);
  await expect(rpc('read_ticket_code_register', [owner, 'aal2', 'DEMO', 0])).rejects.toThrow(
    'FORBIDDEN',
  );
  const result = await rpc<{
    count: number;
    rows: { code: string; buyer: unknown; status: string }[];
  }>('read_ticket_code_register', [admin, 'aal1', 'DEMO', 0]);
  expect(result.count).toBe(50);
  expect(result.rows[0]).toMatchObject({
    code: 'DM00001',
    status: 'ISSUED',
    buyer: selection().buyer,
  });
  expect(result.rows[1]).toMatchObject({ code: 'DM00002', status: 'AVAILABLE', buyer: null });
  const permissions = (
    await db.query<Record<string, unknown>>(
      "select has_table_privilege('authenticated','ftu_sales_private.ticket_code_slots','SELECT') can_read,has_function_privilege('anon','public.configure_ticket_code_stock(uuid,text,integer,integer)','EXECUTE') can_seed",
    )
  ).rows[0];
  expect(permissions).toEqual({ can_read: false, can_seed: false });
});
it('grows beyond the prepared stock without reusing issued codes, and blocks destructive rollback', async () => {
  await configure(1, 5);
  const p = await reserve(2);
  await finish(p);
  expect(
    (
      await db.query<Record<string, unknown>>(
        'select count(*) n from ftu_sales_private.ticket_code_slots',
      )
    ).rows[0].n,
  ).toBe(2);
  await db.exec('savepoint tamper');
  await expect(
    db.exec(
      'update ftu_sales_private.ticket_code_slots set ticket_id=null,linked_at=null where ticket_id is not null',
    ),
  ).rejects.toThrow('IMMUTABLE_TICKET_CODE');
  await db.exec('rollback to savepoint tamper');
  await expect(
    db.exec(await readFile('supabase/rollbacks/20261015041125_ticket_code_register.sql', 'utf8')),
  ).rejects.toThrow('ROLLBACK_BLOCKED_RETAIN_TICKET_CODES');
  await db.exec('rollback;begin');
});

it('installs independently on the thirteen-migration remote baseline without requiring unrelated pending migrations', async () => {
  const baseline = new PGlite();
  try {
    await baseline.exec(
      "create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
    );
    for (const f of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f < '20261014160311')
      .sort())
      await baseline.exec(
        (await readFile('supabase/migrations/' + f, 'utf8')).replace(
          'create extension if not exists pgcrypto;',
          '',
        ),
      );
    await baseline.exec(
      await readFile('supabase/migrations/20261015041125_ticket_code_register.sql', 'utf8'),
    );
    await baseline.exec(await readFile('tests/fixtures/purchases.sql', 'utf8'));
    const result = await baseline.query<{ data: { count: number; assigned: number } }>(
      'select public.configure_ticket_code_stock($1,$2,$3,$4) data',
      [offerId, 'DM', 50, 600],
    );
    expect(result.rows[0].data).toMatchObject({ count: 50, assigned: 0 });
  } finally {
    await baseline.close();
  }
});
