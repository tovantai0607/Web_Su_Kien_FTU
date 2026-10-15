import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest';
import type { Purchase, PurchaseCatalog } from '@ftu/shared';

let db: PGlite;
const user = crypto.randomUUID(),
  admin = crypto.randomUUID(),
  edition = crypto.randomUUID(),
  round = crypto.randomUUID(),
  offer = crypto.randomUUID(),
  early = crypto.randomUUID(),
  normal = crypto.randomUUID();
const buyer = {
  name: 'TEST ONLY',
  school: 'FTU TEST',
  cohort_class: 'TEST',
  student_id: 'TEST',
  email: 'test@example.test',
  phone: '0000000000',
  facebook: 'TEST',
};
async function rpc<T = Purchase>(name: string, args: unknown[]) {
  await db.exec('savepoint test_rpc');
  try {
    const result = (
      await db.query<{ data: T }>(
        `select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) data`,
        args,
      )
    ).rows[0].data;
    await db.exec('release savepoint test_rpc');
    return result;
  } catch (e) {
    await db.exec('rollback to savepoint test_rpc;release savepoint test_rpc');
    throw e;
  }
}
const reserve = (product: string, n: number, size = 1, key = crypto.randomUUID()) =>
  rpc('reserve_purchase', [
    user,
    { offer_id: offer, buyer, lines: [{ product_id: product, quantity: n, bundle_size: size }] },
    key,
    'a'.repeat(64),
  ]);
async function complete(p: Purchase) {
  const id = crypto.randomUUID();
  await rpc('attach_purchase_evidence', [
    user,
    p.id,
    id,
    `private/purchases/${user}/${p.id}/${id}.webp`,
    100,
  ]);
  return rpc('complete_purchase', [user, p.id, id]);
}
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
  await db.query('insert into auth.users values($1),($2)', [user, admin]);
  await db.query("insert into public.user_roles values($1,'SUPER_ADMIN')", [admin]);
  await db.query(
    "insert into public.contest_editions(id,slug,title,year,published) values($1,'official-program-test','OFFICIAL TEST',2027,true)",
    [edition],
  );
  await db.query(
    "insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values($1,$2,'TEST','semifinal',0,null,true)",
    [round, edition],
  );
  await db.query(
    "insert into public.purchase_offers(id,edition_id,round_id,slug,title,mode,published,total_quota,early_quota,early_open_at,early_close_at,normal_close_at) values($1,$2,$3,'official-test','TEST','LIVE',true,700,100,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 day')",
    [offer, edition, round],
  );
  for (const [id, tier, quota] of [
    [early, 'EARLY', 100],
    [normal, 'NORMAL', 600],
  ])
    await db.query(
      "insert into public.purchase_products(id,offer_id,name,tier,quota,price_vnd,combo2_vnd,opens_at,closes_at) values($1,$2,'The Intro',$3,$4,100000,190000,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day')",
      [id, offer, tier, quota],
    );
});
beforeEach(async () => {
  await db.exec('begin');
  await db.query(
    "update public.purchase_offers set qr_path='/images/test-qr.png',payment_instructions='TEST ONLY' where id=$1",
    [offer],
  );
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});
const sheetEdit = (
  p: Purchase,
  lines: { product_id: string; bundle_size: number; quantity: number }[],
  revision = 0,
) =>
  rpc<Purchase>('edit_sheet_purchase', [
    admin,
    'aal1',
    p.id,
    {
      operation_id: crypto.randomUUID(),
      expected_revision: revision,
      code: p.code,
      buyer,
      lines,
      evidence_id: p.evidence_id,
    },
  ]);
it('rejects the 700-to-790 Sheet edit after early rollover, retaining order and stock atomically', async () => {
  const original = await complete(await reserve(early, 10));
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  await complete(await reserve(normal, 690));
  await expect(
    sheetEdit(original, [{ product_id: early, bundle_size: 1, quantity: 100 }]),
  ).rejects.toThrow('QUOTA_UNAVAILABLE');
  expect((await rpc('read_purchase', [user, original.id])).quantity).toBe(10);
  expect(
    (
      await db.query<{ n: number }>(
        'select sum(sold_quantity)::int n from public.purchase_products where offer_id=$1',
        [offer],
      )
    ).rows[0].n,
  ).toBe(700);
});
it('accepts edits within projected rollover capacity and handles bundle counts without counting tickets twice', async () => {
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  const original = await complete(await reserve(normal, 600));
  const edited = await sheetEdit(original, [{ product_id: normal, bundle_size: 2, quantity: 350 }]);
  expect(edited.quantity).toBe(700);
  expect(
    (await rpc<PurchaseCatalog>('purchase_catalog', ['official-test'])).offers[0].products.find(
      (p) => p.id === normal,
    )?.available,
  ).toBe(0);
});
it('preserves held early quota when a Sheet edit increases normal sales', async () => {
  await reserve(early, 20);
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  const original = await complete(await reserve(normal, 600));
  await expect(
    sheetEdit(original, [{ product_id: normal, bundle_size: 1, quantity: 681 }]),
  ).rejects.toThrow('QUOTA_UNAVAILABLE');
  expect(
    (await sheetEdit(original, [{ product_id: normal, bundle_size: 1, quantity: 680 }])).quantity,
  ).toBe(680);
});
it('does not transfer rollover capacity to a different ticket type through Sheet edits', async () => {
  const original = await complete(await reserve(early, 1));
  await db.query('update public.purchase_products set name=$1 where id=$2', ['Other type', normal]);
  // Use the existing early order to check a change to a normal type with no matching early allocation.
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  await expect(
    sheetEdit(original, [{ product_id: normal, bundle_size: 1, quantity: 601 }]),
  ).rejects.toThrow('QUOTA_UNAVAILABLE');
});

it('publishes metadata but fails closed without payment or fully allocated quotas', async () => {
  await db.query('update public.purchase_offers set qr_path=null where id=$1', [offer]);
  const c = await rpc<PurchaseCatalog>('purchase_catalog', ['official-test']);
  expect(c.offers[0]).toMatchObject({
    total_quota: 700,
    early_quota: 100,
    checkout_enabled: false,
  });
  await expect(reserve(early, 1)).rejects.toThrow('PAYMENT_NOT_CONFIGURED');
  await db.query('update public.purchase_products set base_quota=99,quota=99 where id=$1', [early]);
  await expect(reserve(early, 1)).rejects.toThrow('SALE_NOT_CONFIGURED');
});
it('counts combo tickets and blocks NORMAL until early sales finish', async () => {
  await expect(reserve(normal, 1)).rejects.toThrow('SALE_CLOSED');
  await reserve(early, 50, 2);
  await expect(reserve(early, 1)).rejects.toThrow('QUOTA_UNAVAILABLE');
  expect((await rpc<PurchaseCatalog>('purchase_catalog', ['official-test'])).offers[0].phase).toBe(
    'EARLY',
  );
});
it('transitions only after 100 completed early tickets and caps the full round at 700', async () => {
  const p = await reserve(early, 100);
  await complete(p);
  expect((await rpc<PurchaseCatalog>('purchase_catalog', ['official-test'])).offers[0].phase).toBe(
    'NORMAL',
  );
  await expect(reserve(early, 1)).rejects.toThrow('SALE_CLOSED');
  await reserve(normal, 600);
  await expect(reserve(normal, 1)).rejects.toThrow('QUOTA_UNAVAILABLE');
});
it('rolls unused early quota into the matching normal product while retaining active holds', async () => {
  const p = await reserve(early, 20);
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  const c = await rpc<PurchaseCatalog>('purchase_catalog', ['official-test']);
  expect(c.offers[0].products.find((p) => p.id === normal)?.available).toBe(680);
  await reserve(normal, 680);
  await complete(p);
  await expect(reserve(normal, 1)).rejects.toThrow('QUOTA_UNAVAILABLE');
});
it('releases expired early holds to normal sales without restarting a reservation', async () => {
  const p = await reserve(early, 20);
  await db.exec('alter table public.purchase_requests disable trigger guard_purchase');
  await db.query(
    "update public.purchase_requests set created_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '1 minute' where id=$1",
    [p.id],
  );
  await db.exec('alter table public.purchase_requests enable trigger guard_purchase');
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  expect(
    (await rpc<PurchaseCatalog>('purchase_catalog', ['official-test'])).offers[0].products.find(
      (p) => p.id === normal,
    )?.available,
  ).toBe(700);
  await reserve(normal, 700);
});
it('keeps price snapshots and idempotency across phase and price changes', async () => {
  const key = crypto.randomUUID(),
    p = await reserve(early, 1, 1, key);
  await db.query('update public.purchase_products set price_vnd=200000 where id=$1', [early]);
  expect((await reserve(early, 1, 1, key)).total_vnd).toBe(100000);
  await complete(p);
  expect(
    (
      await db.query<{ n: number }>(
        'select count(*)::int n from public.tickets where purchase_id=$1',
        [p.id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('blocks new reservations at the closing boundary but completes existing holds', async () => {
  const p = await reserve(early, 1);
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '2 days',early_close_at=clock_timestamp()-interval '1 day',normal_close_at=clock_timestamp() where id=$1",
    [offer],
  );
  await expect(reserve(normal, 1)).rejects.toThrow('SALE_CLOSED');
  expect((await complete(p)).status).toBe('COMPLETED');
});
it('guards ten minute semifinal voting on the official date', async () => {
  await db.exec(
    "update public.contest_editions set slug='legacy-ftucharm-2027' where slug='ftucharm-2027';update public.contest_editions set slug='ftucharm-2027' where slug='official-program-test';",
  );
  await expect(
    db.query(
      "insert into public.vote_sessions(edition_id,round_id,title,state,open_at,close_at,duration_seconds,updated_by) values($1,$2,'TEST','DRAFT','2027-04-24T20:00:00+07:00','2027-04-24T20:10:00+07:00',600,$3)",
      [edition, round, admin],
    ),
  ).rejects.toThrow('INVALID_VOTE_WINDOW');
});
it('denies direct client publication writes and legacy reservation bypasses', async () => {
  const r = (
    await db.query(
      "select has_table_privilege('authenticated','public.program_publications','SELECT') readable,has_function_privilege('service_role','public.reserve_purchase_before_2027(uuid,jsonb,uuid,text)','EXECUTE') bypass",
    )
  ).rows[0];
  expect(r).toEqual({ readable: false, bypass: false });
  await expect(rpc('save_program_publication', [user, 'aal1', {}])).rejects.toThrow('FORBIDDEN');
});
it('keeps photos and awards draft until staff supplies an image and explicitly publishes', async () => {
  const person = crypto.randomUUID(),
    publication = crypto.randomUUID();
  await db.query(
    "insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,talents,published) values($1,$2,$3,'official-photo-test','TEST ONLY','TEST','TEST','TEST',true)",
    [person, edition, user],
  );
  await db.query('insert into public.round_entries values($1,$2,$3,true)', [
    edition,
    round,
    person,
  ]);
  const input = {
    id: publication,
    edition_id: edition,
    contestant_id: person,
    round_id: round,
    award_name: '',
    photo_url: null,
    published: false,
  };
  await rpc('save_program_publication', [admin, 'aal1', input]);
  await expect(
    rpc('save_program_publication', [admin, 'aal1', { ...input, published: true }]),
  ).rejects.toThrow('PUBLICATION_PHOTO_REQUIRED');
  await rpc('save_program_publication', [
    admin,
    'aal1',
    { ...input, photo_url: '/images/test-photo.webp', published: true },
  ]);
  expect(
    (
      await db.query<{ published: boolean }>(
        'select published from public.program_publications where id=$1',
        [publication],
      )
    ).rows[0].published,
  ).toBe(true);
  expect(
    (
      await db.query<{ n: number }>(
        'select count(*)::int n from public.audit_logs where target_id=$1',
        [publication],
      )
    ).rows[0].n,
  ).toBe(2);
});
it('configures the official season idempotently without prices, images, votes or fake people', async () => {
  const sql = (await readFile('tools/configure-official-program-2027.sql', 'utf8'))
    .replace(/^begin;$/m, '')
    .replace(/^commit;$/m, '');
  await db.exec(sql);
  await db.exec(sql);
  const rows = (
    await db.query<{
      slug: string;
      published: boolean;
      total_quota: number;
      checkout_enabled: boolean;
    }>(
      "select o.slug,o.published,o.total_quota,(public.purchase_catalog(o.slug)->'offers'->0->>'checkout_enabled')::boolean checkout_enabled from public.purchase_offers o join public.contest_editions e on e.id=o.edition_id where e.slug='ftucharm-2027' order by o.slug",
    )
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.published && r.total_quota === 700 && !r.checkout_enabled)).toBe(true);
  const config = (
    await db.query<{ config: unknown }>(
      "select to_jsonb(o)||jsonb_build_object('products','[]'::jsonb) config from public.purchase_offers o where slug='ban-ket-2027'",
    )
  ).rows[0].config;
  await rpc('save_purchase_offer', [admin, 'aal1', config]);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from public.timeline_events t join public.contest_editions e on e.id=t.edition_id where e.slug='ftucharm-2027'",
      )
    ).rows[0].n,
  ).toBe(11);
});
it('retains rollover quota and permits unchanged config and completion after the sale closes', async () => {
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 minute' where id=$1",
    [offer],
  );
  const held = await reserve(normal, 700);
  await db.query(
    'update public.purchase_offers set normal_close_at=clock_timestamp() where id=$1',
    [offer],
  );
  const catalog = await rpc<PurchaseCatalog>('purchase_catalog', ['official-test']);
  expect(catalog.offers[0].products.find((p) => p.id === normal)).toMatchObject({
    quota: 700,
    held: 700,
    state: 'CLOSED',
  });
  const config = (
    await db.query<{ config: unknown }>(
      "select to_jsonb(o)||jsonb_build_object('products',(select jsonb_agg(to_jsonb(p)||jsonb_build_object('quota',p.base_quota)) from public.purchase_products p where p.offer_id=o.id)) config from public.purchase_offers o where id=$1",
      [offer],
    )
  ).rows[0].config;
  await rpc('save_purchase_offer', [admin, 'aal1', config]);
  expect((await complete(held)).status).toBe('COMPLETED');
});
async function saleConfig(target: string = offer) {
  return (
    await db.query<{
      config: Record<string, unknown> & {
        products: { id: string; name: string; tier: string; quota: number; price_vnd: number }[];
      };
    }>(
      "select to_jsonb(o)||jsonb_build_object('products',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('quota',p.base_quota)),'[]') from public.purchase_products p where p.offer_id=o.id)) config from public.purchase_offers o where id=$1",
      [target],
    )
  ).rows[0].config;
}
it('allows admin changes to official early quantity and Vietnam schedule, retaining the 700-ticket capacity', async () => {
  await db.exec(
    (await readFile('tools/configure-official-program-2027.sql', 'utf8'))
      .replace(/^begin;$/m, '')
      .replace(/^commit;$/m, ''),
  );
  const official = (
    await db.query<{ id: string }>(
      "select id from public.purchase_offers where slug='chung-ket-2027'",
    )
  ).rows[0].id;
  const config = await saleConfig(official);
  Object.assign(config, {
    early_quota: 200,
    early_open_at: '2027-04-01T09:00:00+07:00',
    early_close_at: '2027-04-02T10:00:00+07:00',
    normal_close_at: '2027-04-24T22:00:00+07:00',
  });
  await rpc('save_purchase_offer', [admin, 'aal1', config]);
  // Re-running bootstrap must not erase the admin's phase settings.
  await db.exec(
    (await readFile('tools/configure-official-program-2027.sql', 'utf8'))
      .replace(/^begin;$/m, '')
      .replace(/^commit;$/m, ''),
  );
  expect(await saleConfig(official)).toMatchObject({ early_quota: 200, total_quota: 700 });
  expect(
    (
      await db.query<{ phase: string }>(
        "select ftu_sales_private.offer_phase($1,'2027-04-02T10:00:00+07:00') phase",
        [official],
      )
    ).rows[0].phase,
  ).toBe('NORMAL');
  await expect(
    rpc('save_purchase_offer', [admin, 'aal1', { ...config, total_quota: 800 }]),
  ).rejects.toThrow('PROGRAM_CAPACITY_FIXED');
  await expect(rpc('save_purchase_offer', [user, 'aal2', config])).rejects.toThrow('FORBIDDEN');
  await db.exec('savepoint phase_rollback');
  await expect(
    db.exec(
      (await readFile('supabase/rollbacks/20261015102130_configurable_sale_phases.sql', 'utf8'))
        .replace(/^begin;$/m, '')
        .replace(/^commit;$/m, ''),
    ),
  ).rejects.toThrow('ROLLBACK_BLOCKED_CUSTOM_SALE_PHASES');
  await db.exec('rollback to savepoint phase_rollback;release savepoint phase_rollback');
  expect((await saleConfig(official)).early_quota).toBe(200);
});
it('preserves held prices and completion while applying new prices, quantity and times to new orders', async () => {
  const held = await reserve(early, 1);
  const config = await saleConfig();
  config.early_quota = 150;
  config.products.find((p) => p.id === early)!.quota = 150;
  config.products.find((p) => p.id === normal)!.quota = 550;
  config.products.find((p) => p.id === early)!.price_vnd = 120000;
  config.early_close_at = new Date(Date.now() + 7200000).toISOString();
  config.normal_close_at = new Date(Date.now() + 172800000).toISOString();
  await rpc('save_purchase_offer', [admin, 'aal1', config]);
  expect((await reserve(early, 2)).total_vnd).toBe(240000);
  expect((await complete(held)).total_vnd).toBe(100000);
  expect((await saleConfig()).early_quota).toBe(150);
});
it('rejects early limits below active holds and invalid phase times without partially saving', async () => {
  await reserve(early, 10);
  const before = await saleConfig();
  const config = structuredClone(before);
  config.early_quota = 5;
  config.products.find((p) => p.id === early)!.quota = 5;
  config.products.find((p) => p.id === normal)!.quota = 695;
  await expect(rpc('save_purchase_offer', [admin, 'aal1', config])).rejects.toThrow(
    'QUOTA_BELOW_ALLOCATED',
  );
  expect(await saleConfig()).toEqual(before);
  await expect(
    rpc('save_purchase_offer', [
      admin,
      'aal1',
      { ...before, early_close_at: before.early_open_at },
    ]),
  ).rejects.toThrow('INVALID_SALE_PHASES');
  expect(await saleConfig()).toEqual(before);
});
it('recalculates rollover using the new phase allocation without undercutting existing normal holds', async () => {
  await db.query(
    "update public.purchase_offers set early_open_at=clock_timestamp()-interval '1 day',early_close_at=clock_timestamp()-interval '1 hour' where id=$1",
    [offer],
  );
  const held = await reserve(normal, 700);
  const config = await saleConfig();
  config.early_quota = 150;
  config.products.find((p) => p.id === early)!.quota = 150;
  config.products.find((p) => p.id === normal)!.quota = 550;
  await rpc('save_purchase_offer', [admin, 'aal1', config]);
  expect(
    (await rpc<PurchaseCatalog>('purchase_catalog', ['official-test'])).offers[0].products.find(
      (p) => p.id === normal,
    ),
  ).toMatchObject({ quota: 700, base_quota: 550, held: 700 });
  expect((await complete(held)).quantity).toBe(700);
});
it('rolls schema behavior back without deleting publication records or existing purchases', async () => {
  const held = await reserve(early, 1);
  await db.exec(
    (await readFile('supabase/rollbacks/20261015102130_configurable_sale_phases.sql', 'utf8'))
      .replace(/^begin;$/m, '')
      .replace(/^commit;$/m, ''),
  );
  await db.exec(
    (await readFile('supabase/rollbacks/20261014150806_official_program_2027.sql', 'utf8'))
      .replace(/^begin;$/m, '')
      .replace(/^commit;$/m, ''),
  );
  expect((await rpc('read_purchase', [user, held.id])).quantity).toBe(1);
  expect(
    (
      await db.query<{ r: string }>(
        "select to_regclass('ftu_sales_private.program_publications')::text r",
      )
    ).rows[0].r,
  ).toBe('ftu_sales_private.program_publications');
});
