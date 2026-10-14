import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import type { Purchase, PurchaseCatalog } from '@ftu/shared';

let db: PGlite;
const user = crypto.randomUUID(),
  other = crypto.randomUUID(),
  admin = crypto.randomUUID();
const edition = crypto.randomUUID(),
  round = crypto.randomUUID(),
  offer = crypto.randomUUID(),
  product = crypto.randomUUID();
const male = crypto.randomUUID(),
  female = crypto.randomUUID();
const buyer = {
  name: 'TEST ONLY',
  school: 'TEST',
  cohort_class: 'TEST',
  student_id: 'TEST',
  email: 'test@example.test',
  phone: '0000000000',
  facebook: 'TEST',
};
const data = (quantity = 1, bundle_size = 1) => ({
  offer_id: offer,
  buyer,
  lines: [{ product_id: product, quantity, bundle_size }],
});
async function rpc<
  T = Purchase & PurchaseCatalog & { created_at: string; already_recorded: boolean },
>(name: string, args: unknown[]) {
  const result = await db.query<{ data: T }>(
    `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) data`,
    args,
  );
  return result.rows[0].data;
}
const reserve = (quantity = 1, bundle = 1, key = crypto.randomUUID(), owner = user) =>
  rpc('reserve_purchase', [owner, data(quantity, bundle), key, 'a'.repeat(64)]);
async function proof(id: string, owner = user) {
  const eid = crypto.randomUUID();
  return rpc('attach_purchase_evidence', [
    owner,
    id,
    eid,
    `private/purchases/${owner}/${id}/${eid}.webp`,
    100,
  ]);
}
const complete = (id: string, evidence: string, owner = user) =>
  rpc('complete_purchase', [owner, id, evidence]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  );
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(
      (await readFile('supabase/migrations/' + file, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.query('insert into auth.users values($1),($2),($3)', [user, other, admin]);
  await db.query("insert into public.user_roles values($1,'SUPER_ADMIN')", [admin]);
  await db.query(
    "insert into public.contest_editions(id,slug,title,year,published) values($1,'proof-test','TEST',2027,true)",
    [edition],
  );
  await db.query(
    "insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values($1,$2,'TEST','semifinal',0,10,true)",
    [round, edition],
  );
  await db.query(
    "insert into public.purchase_offers(id,edition_id,round_id,slug,title,mode,published) values($1,$2,$3,'proof-test','TEST','DEMO',true)",
    [offer, edition, round],
  );
  await db.query(
    "insert into public.purchase_products(id,offer_id,name,tier,quota,price_vnd,combo2_vnd,combo3_vnd,opens_at,closes_at) values($1,$2,'The Intro','EARLY',100,100000,190000,280000,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')",
    [product, offer],
  );
  for (const [cid, gender, uid] of [
    [male, 'male', admin],
    [female, 'female', other],
  ]) {
    await db.query(
      "insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,gender,published) values($1::uuid,$2,$3,$1::text,'TEST','TEST','TEST',$4,true)",
      [cid, edition, uid, gender],
    );
    await db.query('insert into public.round_entries values($1,$2,$3,true)', [edition, round, cid]);
  }
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
it('automatically closes only expired open voting sessions and never finalizes or publishes them', async () => {
  await rpc('prepare_gender_voting', [admin, 'aal2', round]);
  const session = await rpc('open_gender_voting', [admin, 'aal2', round]);
  expect(await rpc('close_due_vote_sessions', [100])).toBe(0);
  await db.query(
    "update public.vote_sessions set close_at=clock_timestamp()+interval '2 seconds',reopen_reason='TEST deadline fixture' where id=$1",
    [session.id],
  );
  await new Promise((resolve) => setTimeout(resolve, 2100));
  expect(await rpc('close_due_vote_sessions', [100])).toBe(1);
  expect(await rpc('close_due_vote_sessions', [100])).toBe(0);
  const { rows } = await db.query<{ state: string }>(
    'select state from public.vote_sessions where id=$1',
    [session.id],
  );
  expect(rows[0].state).toBe('CLOSED');
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.vote_result_snapshots'))
      .rows[0].n,
  ).toBe(0);
});
const editData = (r: Purchase, quantity: number, revision = 0) => ({
  operation_id: crypto.randomUUID(),
  expected_revision: revision,
  code: r.code,
  buyer: { ...buyer, email: 'contact-only@example.test' },
  lines: [{ product_id: product, bundle_size: 1, quantity }],
  evidence_id: r.evidence_id,
});
it('sheet edits change contact fields and quantity atomically, retaining owner, audit and idempotency', async () => {
  const held = await reserve(3),
    evidence = await proof(held.id);
  const original = await complete(held.id, evidence.id);
  const input = editData(original, 2);
  const edited = await rpc<Purchase & { revision: number }>('edit_sheet_purchase', [
    admin,
    'aal1',
    held.id,
    input,
  ]);
  expect(edited.quantity).toBe(2);
  expect(edited.revision).toBe(1);
  expect(edited.buyer.email).toBe('contact-only@example.test');
  expect(await rpc('edit_sheet_purchase', [admin, 'aal1', held.id, input])).toEqual(edited);
  const counts = await db.query<{ active: number; archived: number }>(
    "select count(*) filter(where status='issued')::int active,count(*) filter(where status='void')::int archived from public.tickets where purchase_id=$1",
    [held.id],
  );
  expect(counts.rows[0]).toEqual({ active: 2, archived: 1 });
  expect(
    (
      await db.query<{ user_id: string }>(
        'select user_id from public.purchase_requests where id=$1',
        [held.id],
      )
    ).rows[0].user_id,
  ).toBe(user);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.audit_logs where action='sheet_purchase_edited'",
        [],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query<{ sold_quantity: number }>(
        'select sold_quantity from public.purchase_products where id=$1',
        [product],
      )
    ).rows[0].sold_quantity,
  ).toBe(2);
});
it('sheet edits count voted ticket identities across categories and never lose recorded votes', async () => {
  const held = await reserve(3),
    evidence = await proof(held.id),
    original = await complete(held.id, evidence.id);
  await rpc('prepare_gender_voting', [admin, 'aal2', round]);
  const session = await rpc('open_gender_voting', [admin, 'aal2', round]);
  const tickets = (
    await db.query<{ id: string }>(
      'select id from public.tickets where purchase_id=$1 order by purchase_ordinal',
      [held.id],
    )
  ).rows;
  const categories = (
    await db.query<{ id: string; gender: string }>(
      'select id,gender from public.vote_categories where round_id=$1',
      [round],
    )
  ).rows;
  for (const category of categories)
    await rpc('cast_category_vote', [
      user,
      round,
      tickets[2].id,
      category.gender === 'male' ? male : female,
      category.id,
      session.id,
    ]);
  const result = await rpc('edit_sheet_purchase', [admin, 'aal1', held.id, editData(original, 1)]);
  expect(result.quantity).toBe(1);
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.votes')).rows[0].n,
  ).toBe(2);
  expect(
    (
      await db.query<{ id: string }>(
        "select id from public.tickets where purchase_id=$1 and status='issued'",
        [held.id],
      )
    ).rows[0].id,
  ).toBe(tickets[2].id);
  expect(await rpc('read_vote_participation', [round])).toEqual({ participants: 1, votes: 2 });
});
it('sheet edits reject stale revisions, low quota, missing rights and reduction below voted tickets', async () => {
  const held = await reserve(3),
    evidence = await proof(held.id),
    original = await complete(held.id, evidence.id);
  await rpc('prepare_gender_voting', [admin, 'aal2', round]);
  const session = await rpc('open_gender_voting', [admin, 'aal2', round]);
  const tickets = (
    await db.query<{ id: string }>(
      'select id from public.tickets where purchase_id=$1 order by purchase_ordinal',
      [held.id],
    )
  ).rows;
  const category = (
    await db.query<{ id: string }>(
      "select id from public.vote_categories where round_id=$1 and gender='male'",
      [round],
    )
  ).rows[0];
  for (const ticket of tickets.slice(1))
    await rpc('cast_category_vote', [user, round, ticket.id, male, category.id, session.id]);
  for (const [actor, input, message] of [
    [admin, editData(original, 1), 'SHEET_BELOW_VOTED_TICKETS'],
    [admin, editData(original, 3, 9), 'SHEET_REVISION_CONFLICT'],
    [user, editData(original, 3), 'FORBIDDEN'],
    [admin, editData(original, 101), 'QUOTA_UNAVAILABLE'],
  ] as const) {
    await db.exec('savepoint expected_sheet_failure');
    await expect(rpc('edit_sheet_purchase', [actor, 'aal1', held.id, input])).rejects.toThrow(
      message,
    );
    await db.exec('rollback to savepoint expected_sheet_failure');
  }
  expect((await rpc('read_purchase', [user, held.id])).quantity).toBe(3);
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.votes')).rows[0].n,
  ).toBe(2);
});
it('snapshots the seven fields, type/combo price and exactly 30 minutes without a ten-ticket cap', async () => {
  const r = await reserve(12, 2);
  expect(r.quantity).toBe(24);
  expect(r.total_vnd).toBe(2280000);
  expect(r.buyer).toEqual(buyer);
  expect(Date.parse(r.expires_at) - Date.parse(r.created_at)).toBe(1800000);
  const stock = await rpc('purchase_catalog', [null]);
  expect(stock.offers[0].products[0].available).toBe(76);
});
it('does not create tickets, financial PAID records or emails while held', async () => {
  await reserve();
  for (const table of ['tickets', 'orders', 'payments', 'email_outbox'])
    expect(
      (await db.query<{ n: number }>(`select count(*)::int n from public.${table}`)).rows[0].n,
    ).toBe(0);
});
it('reservation retry returns the same request and expiry without consuming quota twice', async () => {
  const key = crypto.randomUUID(),
    first = await reserve(2, 1, key),
    retry = await reserve(2, 1, key);
  expect(retry.id).toBe(first.id);
  expect(retry.expires_at).toBe(first.expires_at);
  expect((await rpc('purchase_catalog', [null])).offers[0].products[0].held).toBe(2);
});
it('conflicting retry is rejected', async () => {
  const key = crypto.randomUUID();
  await reserve(1, 1, key);
  await expect(rpc('reserve_purchase', [user, data(2), key, 'b'.repeat(64)])).rejects.toThrow(
    'IDEMPOTENCY_CONFLICT',
  );
});
it('server rejects over-quota and combined bundles exceeding the same product quota', async () => {
  await expect(reserve(101)).rejects.toThrow('QUOTA_UNAVAILABLE');
});
it('validates combo configuration and sale time at the database boundary', async () => {
  await db.query('update public.purchase_products set combo2_vnd=null where id=$1', [product]);
  await expect(reserve(1, 2)).rejects.toThrow('COMBO_NOT_CONFIGURED');
});
it('never exposes buyer data or evidence through the public catalog', async () => {
  const r = await reserve();
  await proof(r.id);
  const catalog = JSON.stringify(await rpc('purchase_catalog', [null]));
  expect(catalog).not.toContain('test@example.test');
  expect(catalog).not.toContain('private/purchases/');
  expect(catalog).not.toContain(r.code);
});
it('foreign owner cannot read or attach evidence', async () => {
  const r = await reserve();
  await expect(rpc('read_purchase', [other, r.id])).rejects.toThrow('PURCHASE_NOT_FOUND');
});
it('cannot complete without evidence belonging to the request', async () => {
  const r = await reserve();
  await expect(complete(r.id, crypto.randomUUID())).rejects.toThrow('INVALID_EVIDENCE');
});
it('completion issues distinct codes immediately with no check-in and no PAID claim', async () => {
  const r = await reserve(2, 3),
    e = await proof(r.id),
    saved = await complete(r.id, e.id);
  expect(saved.status).toBe('COMPLETED');
  const tickets = (
    await db.query<{ ticket_code: string; checked_in_at: null; source: string }>(
      'select ticket_code,checked_in_at,source from public.tickets where purchase_id=$1',
      [r.id],
    )
  ).rows;
  expect(tickets).toHaveLength(6);
  expect(new Set(tickets.map((t) => t.ticket_code)).size).toBe(6);
  expect(tickets.every((t) => t.checked_in_at === null && t.source === 'SUPPLEMENT')).toBe(true);
});
it('completion and proof retries cannot duplicate tickets or replace saved proof', async () => {
  const r = await reserve(),
    e = await proof(r.id);
  await complete(r.id, e.id);
  expect((await complete(r.id, e.id)).id).toBe(r.id);
  expect((await proof(r.id)).id).toBe(e.id);
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.tickets')).rows[0].n,
  ).toBe(1);
});
it('keeps a saved proof available after reload; upload alone grants no vote entitlement', async () => {
  const r = await reserve(),
    e = await proof(r.id);
  const reloaded = await rpc('read_purchase', [user, r.id]);
  expect(reloaded.evidence_id).toBe(e.id);
  expect(reloaded.status).toBe('HELD');
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.tickets')).rows[0].n,
  ).toBe(0);
});
it('rolls back status, inventory and tickets together if issuance fails after proof is stored', async () => {
  const r = await reserve(),
    e = await proof(r.id);
  await db.exec(
    "create function public.test_fail_ticket() returns trigger language plpgsql as $$begin raise exception 'TEST_ISSUANCE_FAILURE';end$$;create trigger test_fail_ticket before insert on public.tickets for each row execute function public.test_fail_ticket();savepoint completion_failure",
  );
  await expect(complete(r.id, e.id)).rejects.toThrow('TEST_ISSUANCE_FAILURE');
  await db.exec('rollback to savepoint completion_failure');
  expect((await rpc('read_purchase', [user, r.id])).status).toBe('HELD');
  expect(
    (
      await db.query<{ sold_quantity: number }>(
        'select sold_quantity from public.purchase_products where id=$1',
        [product],
      )
    ).rows[0].sold_quantity,
  ).toBe(0);
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.tickets')).rows[0].n,
  ).toBe(0);
});
it('completed purchases and their tickets cannot be cancelled, voided or edited', async () => {
  const r = await reserve(),
    e = await proof(r.id);
  await complete(r.id, e.id);
  await expect(
    db.query("update public.tickets set status='void' where purchase_id=$1", [r.id]),
  ).rejects.toThrow('IMMUTABLE_TICKET');
});
it('MFA and TICKET_STAFF are required to configure sales', async () => {
  await expect(rpc('save_purchase_offer', [user, 'aal2', {}])).rejects.toThrow('FORBIDDEN');
});
async function offerConfiguration() {
  return (
    await db.query<{
      data: { products: { price_vnd: number; combo2_vnd: number; quota: number }[] };
    }>(
      "select to_jsonb(o)||jsonb_build_object('products',(select jsonb_agg(to_jsonb(p)) from public.purchase_products p where p.offer_id=o.id)) data from public.purchase_offers o where o.id=$1",
      [offer],
    )
  ).rows[0].data;
}
it('price changes affect new purchases while held prices and deadlines remain stable', async () => {
  const key = crypto.randomUUID();
  const held = await reserve(1, 2, key);
  const config = await offerConfiguration();
  config.products[0].price_vnd = 120000;
  config.products[0].combo2_vnd = 220000;
  await rpc('save_purchase_offer', [admin, 'aal2', config]);
  const retried = await reserve(1, 2, key);
  expect(retried.total_vnd).toBe(190000);
  expect(retried.lines[0].unit_price_vnd).toBe(190000);
  expect(retried.expires_at).toBe(held.expires_at);
  const fresh = await reserve(1, 2);
  expect(fresh.total_vnd).toBe(220000);
  const evidence = await proof(held.id);
  const completed = await complete(held.id, evidence.id);
  expect(completed.total_vnd).toBe(190000);
  expect(completed.quantity).toBe(2);
});
it('configuration rejects quota below completed and active held tickets atomically', async () => {
  const finished = await reserve(2);
  const evidence = await proof(finished.id);
  await complete(finished.id, evidence.id);
  await reserve(3);
  const config = await offerConfiguration();
  config.products[0].quota = 4;
  config.products[0].price_vnd = 120000;
  await db.exec('savepoint invalid_config');
  await expect(rpc('save_purchase_offer', [admin, 'aal2', config])).rejects.toThrow(
    'QUOTA_BELOW_ALLOCATED',
  );
  await db.exec('rollback to savepoint invalid_config');
  const unchanged = await offerConfiguration();
  expect(unchanged.products[0].quota).toBe(100);
  expect(unchanged.products[0].price_vnd).toBe(100000);
  config.products[0].quota = 5;
  await rpc('save_purchase_offer', [admin, 'aal2', config]);
  const saved = await offerConfiguration();
  expect(saved.products[0].quota).toBe(5);
  expect(saved.products[0].price_vnd).toBe(120000);
});
it('private tables and privileged RPCs are unavailable to anon/authenticated', async () => {
  const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
    "select tablename,rowsecurity from pg_tables where schemaname='public' and tablename like 'purchase_%'",
  );
  expect(rows).toHaveLength(5);
  expect(rows.every((r) => r.rowsecurity)).toBe(true);
  const privileges = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('authenticated','public.complete_purchase(uuid,uuid,uuid)','EXECUTE') allowed",
  );
  expect(privileges.rows[0].allowed).toBe(false);
  await db.exec('set local role authenticated');
  await expect(db.query('select * from public.purchase_requests')).rejects.toThrow(
    'permission denied',
  );
});
it('one completed ticket votes once per category in semifinal, without check-in; retry is idempotent', async () => {
  const r = await reserve(),
    e = await proof(r.id);
  await complete(r.id, e.id);
  await rpc('prepare_gender_voting', [admin, 'aal2', round]);
  const s = await rpc('open_gender_voting', [admin, 'aal2', round]);
  const tid = (
    await db.query<{ id: string }>('select id from public.tickets where purchase_id=$1', [r.id])
  ).rows[0].id;
  const cats = (
    await db.query<{ id: string; gender: string }>(
      'select id,gender from public.vote_categories where round_id=$1',
      [round],
    )
  ).rows;
  for (const c of cats) {
    const args = [user, round, tid, c.gender === 'male' ? male : female, c.id, s.id];
    expect((await rpc('cast_category_vote', args)).already_recorded).toBe(false);
    expect((await rpc('cast_category_vote', args)).already_recorded).toBe(true);
  }
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.votes')).rows[0].n,
  ).toBe(2);
  await rpc('manage_purchase_voting', [
    admin,
    'aal2',
    s.id,
    'close',
    'TEST close with audit reason',
  ]);
  await rpc('manage_purchase_voting', [admin, 'aal2', s.id, 'finalize', null]);
  await rpc('manage_purchase_voting', [admin, 'aal2', s.id, 'publish', null]);
  expect(
    (await db.query<{ n: number }>('select count(*)::int n from public.vote_result_snapshots'))
      .rows[0].n,
  ).toBe(2);
});
it('wrong-round tickets and foreign ownership cannot vote', async () => {
  const r = await reserve(),
    e = await proof(r.id);
  await complete(r.id, e.id);
  await rpc('prepare_gender_voting', [admin, 'aal2', round]);
  const s = await rpc('open_gender_voting', [admin, 'aal2', round]);
  const tid = (
    await db.query<{ id: string }>('select id from public.tickets where purchase_id=$1', [r.id])
  ).rows[0].id;
  const cat = (
    await db.query<{ id: string }>(
      'select id from public.vote_categories where round_id=$1 limit 1',
      [round],
    )
  ).rows[0].id;
  await expect(rpc('cast_category_vote', [other, round, tid, male, cat, s.id])).rejects.toThrow(
    'TICKET_NOT_ELIGIBLE',
  );
});
