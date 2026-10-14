import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import type { AdminSettings, SalesCatalog, SalesHold } from '@ftu/shared';
let db: PGlite;
const id = (n: number) => `99010000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1),
  user = id(2),
  edition = id(10),
  round = id(20),
  event = id(40),
  cat1 = id(50),
  cat2 = id(51);
const open = () => new Date(Date.now() - 60000).toISOString(),
  close = () => new Date(Date.now() + 3600000).toISOString();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
  create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
  create table auth.identities(user_id uuid references auth.users,provider text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  alter default privileges grant execute on functions to anon,authenticated;`);
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(
      (await readFile('supabase/migrations/' + file, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.exec(await readFile('tests/fixtures/sales-inventory.sql', 'utf8'));
  await db.query("insert into public.user_roles(user_id,role) values($1,'SUPER_ADMIN')", [admin]);
  for (const [n, gender] of [
    [70, 'male'],
    [71, 'female'],
  ] as const) {
    await db.query(
      "insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,gender,published) values($1,$2,$3,$4,'TEST','TEST','TEST',$5,true)",
      [id(n), edition, n === 70 ? admin : user, 'test-' + n, gender],
    );
    await db.query('insert into public.round_entries values($1,$2,$3,true)', [
      edition,
      round,
      id(n),
    ]);
  }
  await db.query("select public.prepare_gender_voting($1,'aal2',$2)", [admin, round]);
  await db.query("select public.check_in($1,'aal2','test-only-token-hash')", [admin]);
});
beforeEach(() => db.exec('begin;'));
afterEach(() => db.exec('rollback;'));
afterAll(() => db.close());
it('preserves supplemental tickets and semifinal voting from the fetched remote baseline', async () => {
  await db.query("update public.contest_rounds set kind='semifinal' where id=$1", [round]);
  expect((await settings()).rounds.some((r) => r.id === round)).toBe(true);
  await db.query(
    "insert into public.purchase_offers(id,edition_id,round_id,slug,title,published) values($1,$2,$3,'test-supplement','TEST',true)",
    [id(80), edition, round],
  );
  await db.query(
    "insert into public.purchase_products(id,offer_id,name,tier,quota,price_vnd,opens_at,closes_at) values($1,$2,'TEST','NORMAL',5,100000,$3,$4)",
    [id(81), id(80), open(), close()],
  );
  const buyer = Object.fromEntries(
    ['name', 'school', 'cohort_class', 'student_id', 'email', 'phone', 'facebook'].map((k) => [
      k,
      'TEST ONLY',
    ]),
  );
  const purchase = (
    await db.query<{ v: { id: string } }>('select public.reserve_purchase($1,$2,$3,$4) v', [
      user,
      { offer_id: id(80), buyer, lines: [{ product_id: id(81), bundle_size: 1, quantity: 1 }] },
      crypto.randomUUID(),
      'test-hash',
    ])
  ).rows[0].v;
  await db.query('select public.attach_purchase_evidence($1,$2,$3,$4,100)', [
    user,
    purchase.id,
    id(82),
    `private/purchases/${user}/${purchase.id}/${id(82)}.webp`,
  ]);
  await db.query('select public.complete_purchase($1,$2,$3)', [user, purchase.id, id(82)]);
  await voteWindow(new Date(Date.now() - 1000).toISOString(), close());
  const issued = (
    await db.query<{ id: string }>('select id from public.tickets where purchase_id=$1', [
      purchase.id,
    ])
  ).rows[0].id;
  const category = (
    await db.query<{ id: string }>(
      "select id from public.vote_categories where round_id=$1 and gender='male'",
      [round],
    )
  ).rows[0].id;
  const session = (
    await db.query<{ id: string }>('select id from public.vote_sessions where round_id=$1', [round])
  ).rows[0].id;
  await expect(
    db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
      user,
      round,
      issued,
      id(70),
      category,
      session,
    ]),
  ).resolves.toBeDefined();
});
async function settings() {
  return (
    await db.query<{ v: AdminSettings }>("select public.admin_event_settings($1,'aal2') v", [admin])
  ).rows[0].v;
}
async function sale(price = 80000, revision?: number) {
  const current = await settings();
  return db.query("select public.save_sale_settings($1,'aal2',$2,$3,$4)", [
    admin,
    event,
    revision ?? current.events.find((e) => e.id === event)!.sales_revision,
    [
      {
        kind: 'REGULAR',
        open_at: open(),
        close_at: close(),
        prices: [
          { category_id: cat1, price_vnd: price },
          { category_id: cat2, price_vnd: price + 20000 },
        ],
      },
    ],
  ]);
}
async function catalog() {
  return (await db.query<{ v: SalesCatalog }>('select public.sales_catalog(null,$1) v', [event]))
    .rows[0].v.events[0];
}
async function hold(quote: string | null | undefined, seat = id(61), key = crypto.randomUUID()) {
  return (
    await db.query<{ v: SalesHold }>('select public.reserve_sales_seats($1,$2,$3,$4,$5,$6) v', [
      user,
      event,
      [seat],
      key,
      'a'.repeat(64),
      quote ?? null,
    ])
  ).rows[0].v;
}
async function voteWindow(start: string, end: string, reason = '') {
  return db.query("select public.save_voting_settings($1,'aal2',$2,$3,$4,$5)", [
    admin,
    round,
    start,
    end,
    reason,
  ]);
}
it('allows admins without MFA but rejects regular users and direct authenticated writes', async () => {
  await expect(
    db.query("select public.admin_event_settings($1,'aal1')", [admin]),
  ).resolves.toBeDefined();
  await db.exec('rollback;begin;');
  await expect(db.query("select public.admin_event_settings($1,'aal2')", [user])).rejects.toThrow(
    'FORBIDDEN',
  );
  await db.exec('rollback;begin;set local role authenticated;');
  await expect(db.query('select * from public.ticket_phase_prices')).rejects.toThrow(
    'permission denied',
  );
});
it('keeps MFA required for non-admin staff roles and rejects an invalid assurance value', async () => {
  await db.query("insert into public.user_roles(user_id,role) values($1,'CONTENT_EDITOR')", [user]);
  await expect(
    db.query("select public.admin_save($1,'aal1','contest_editions',$2,$3)", [
      user,
      edition,
      { title: 'TEST' },
    ]),
  ).rejects.toThrow('FORBIDDEN');
});
it('rejects missing assurance even for an admin', async () => {
  await expect(db.query('select public.admin_event_settings($1,null)', [admin])).rejects.toThrow(
    'FORBIDDEN',
  );
});
it('requires an actually Google-verified account before bootstrap', async () => {
  await expect(db.query('select public.bootstrap_admin_role($1)', [user])).rejects.toThrow(
    'ADMIN_EMAIL_NOT_VERIFIED',
  );
  await db.exec('rollback;begin;');
  await db.query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1', [user]);
  await db.query("insert into auth.identities values($1,'google')", [user]);
  expect(
    (await db.query<{ v: boolean }>('select public.bootstrap_admin_role($1) v', [user])).rows[0].v,
  ).toBe(true);
  expect(
    (await db.query<{ v: boolean }>('select public.bootstrap_admin_role($1) v', [user])).rows[0].v,
  ).toBe(false);
});
it('snapshots phase prices and rejects stale quotes after price changes', async () => {
  await sale();
  const quoted = await catalog();
  const key = crypto.randomUUID();
  expect(quoted.categories.map((c) => c.price_vnd)).toEqual([80000, 100000]);
  const order = await hold(quoted.pricing_version, id(61), key);
  expect(order.total_vnd).toBe(80000);
  await sale(120000);
  const retry = await hold(quoted.pricing_version, id(61), key);
  expect(retry.id).toBe(order.id);
  expect(retry.total_vnd).toBe(80000);
  await expect(hold(quoted.pricing_version, id(62))).rejects.toThrow('PRICE_CHANGED');
});
it('blocks the legacy hold contract from bypassing phase quotes', async () => {
  await sale();
  await expect(
    db.query('select public.reserve_sales_seats($1,$2,$3,$4,$5)', [
      user,
      event,
      [id(61)],
      crypto.randomUUID(),
      'a'.repeat(64),
    ]),
  ).rejects.toThrow('PRICE_CHANGED');
});
it('switches sale phases using the database clock and treats close as exclusive', async () => {
  const now = await db.query<{ now: string }>('select clock_timestamp()::text as now');
  const boundary = new Date(Date.parse(now.rows[0].now) - 1000).toISOString();
  const phases = [
    {
      kind: 'EARLY',
      open_at: open(),
      close_at: boundary,
      prices: [
        { category_id: cat1, price_vnd: 70000 },
        { category_id: cat2, price_vnd: 90000 },
      ],
    },
    {
      kind: 'REGULAR',
      open_at: boundary,
      close_at: close(),
      prices: [
        { category_id: cat1, price_vnd: 110000 },
        { category_id: cat2, price_vnd: 130000 },
      ],
    },
  ];
  await db.query("select public.save_sale_settings($1,'aal2',$2,0,$3)", [admin, event, phases]);
  const current = await catalog();
  expect(current.active_phase).toBe('REGULAR');
  expect(current.categories[0].price_vnd).toBe(110000);
  const order = await hold(current.pricing_version);
  expect(order.total_vnd).toBe(110000);
});
it('rejects overlap and rolls back the entire settings change', async () => {
  const phases = ['EARLY', 'REGULAR'].map((kind) => ({
    kind,
    open_at: open(),
    close_at: close(),
    prices: [
      { category_id: cat1, price_vnd: 70000 },
      { category_id: cat2, price_vnd: 90000 },
    ],
  }));
  await db.query("select public.save_sale_settings($1,'aal2',$2,0,$3)", [admin, event, phases]);
  await expect(db.exec('set constraints all immediate;')).rejects.toThrow('SALE_PHASE_OVERLAP');
});
it('rejects stale admin revisions instead of losing another save', async () => {
  await sale();
  await expect(sale(90000, 0)).rejects.toThrow('SETTINGS_CHANGED');
});
it('records new prices after a previous hold expires without changing old snapshots', async () => {
  await db.query('update public.events set hold_ttl_seconds=1 where id=$1', [event]);
  await sale();
  const first = await hold((await catalog()).pricing_version);
  await sale(120000);
  await new Promise((r) => setTimeout(r, 1100));
  const next = await hold((await catalog()).pricing_version);
  expect(next.total_vnd).toBe(120000);
  const old = (
    await db.query<{ price: number }>(
      'select unit_price_vnd::int as price from public.order_items where order_id=$1',
      [first.id],
    )
  ).rows[0];
  expect(old.price).toBe(80000);
});
it('opens scheduled voting by time without a cron state transition', async () => {
  const start = new Date(Date.now() + 800).toISOString(),
    end = close();
  await voteWindow(start, end);
  const state = (
    await db.query<{ state: string }>('select state from public.vote_sessions where round_id=$1', [
      round,
    ])
  ).rows[0].state;
  expect(state).toBe('SCHEDULED');
  await new Promise((r) => setTimeout(r, 900));
  const category = (
    await db.query<{ id: string }>(
      "select id from public.vote_categories where round_id=$1 and gender='male'",
      [round],
    )
  ).rows[0].id;
  const session = (
    await db.query<{ id: string }>('select id from public.vote_sessions where round_id=$1', [round])
  ).rows[0].id;
  const result = await db.query<{ v: { id: string } }>(
    'select public.cast_category_vote($1,$2,$3,$4,$5,$6) v',
    [admin, round, id(30), id(70), category, session],
  );
  expect(result.rows[0].v.id).toBeTruthy();
});
it('extends an active vote, freezes its start and can close it early', async () => {
  const start = new Date(Date.now()).toISOString();
  await voteWindow(start, close());
  await voteWindow(start, new Date(Date.now() + 7200000).toISOString(), 'TEST extension');
  expect((await settings()).rounds.find((r) => r.id === round)?.vote_close_at).toBeTruthy();
  await voteWindow(start, new Date(Date.now()).toISOString(), 'TEST close');
  expect((await settings()).rounds.find((r) => r.id === round)?.session_state).toBe('CLOSED');
  await expect(voteWindow(start, close(), 'TEST reopen')).rejects.toThrow('VOTE_ALREADY_CLOSED');
});
it('rejects active start changes and close changes without a reason', async () => {
  const start = new Date(Date.now()).toISOString();
  await voteWindow(start, close());
  await expect(voteWindow(start, close())).rejects.toThrow('VOTE_REASON_REQUIRED');
});
it('legacy admin edits cannot clear a configured vote window', async () => {
  const start = new Date(Date.now() + 3600000).toISOString();
  await voteWindow(start, new Date(Date.now() + 7200000).toISOString());
  await expect(
    db.query("select public.admin_save($1,'aal2','contest_rounds',$2,$3)", [
      admin,
      round,
      { edition_id: edition, vote_open_at: null, vote_close_at: null },
    ]),
  ).rejects.toThrow('VOTE_SETTINGS_REQUIRED');
});
it('public RPCs and private helpers remain inaccessible to client roles', async () => {
  const result = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('authenticated','public.save_sale_settings(uuid,text,uuid,bigint,jsonb)','execute') as allowed",
  );
  expect(result.rows[0].allowed).toBe(false);
  await db.exec('set local role service_role;');
  await expect(db.query("select public.open_voting($1,'aal2',$2)", [admin, round])).rejects.toThrow(
    'permission denied',
  );
});
it('rollback restores the preceding schema and privileged RPCs on an unused migration', async () => {
  const clean = new PGlite();
  try {
    await clean.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
    create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await clean.exec(
        (await readFile('supabase/migrations/' + file, 'utf8')).replace(
          'create extension if not exists pgcrypto;',
          '',
        ),
      );
    await clean.exec(
      await readFile(
        'supabase/rollbacks/20261014120001_reconciled_admin_event_settings.sql',
        'utf8',
      ),
    );
    expect(
      (
        await clean.query<{ v: string | null }>(
          "select to_regclass('public.ticket_sale_phases')::text v",
        )
      ).rows[0].v,
    ).toBeNull();
    expect(
      (
        await clean.query<{ allowed: boolean }>(
          "select has_function_privilege('service_role','public.open_voting(uuid,text,uuid)','execute') allowed",
        )
      ).rows[0].allowed,
    ).toBe(true);
  } finally {
    await clean.close();
  }
});
it('the optional-MFA rollback restores the previous admin policy without removing accounts', async () => {
  const clean = new PGlite();
  try {
    await clean.exec(
      `create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
    );
    for (const file of (await readdir('supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await clean.exec(
        (await readFile('supabase/migrations/' + file, 'utf8')).replace(
          'create extension if not exists pgcrypto;',
          '',
        ),
      );
    await clean.exec(await readFile('tests/fixtures/sales-inventory.sql', 'utf8'));
    await clean.query("insert into public.user_roles(user_id,role) values($1,'SUPER_ADMIN')", [
      admin,
    ]);
    await expect(
      clean.query("select public.admin_event_settings($1,'aal1')", [admin]),
    ).resolves.toBeDefined();
    await clean.exec(
      await readFile('supabase/rollbacks/20261014122630_admin_optional_mfa.sql', 'utf8'),
    );
    await expect(
      clean.query("select public.admin_event_settings($1,'aal1')", [admin]),
    ).rejects.toThrow('FORBIDDEN');
    expect(
      (await clean.query<{ n: number }>('select count(*)::int n from auth.users')).rows[0].n,
    ).toBe(2);
  } finally {
    await clean.close();
  }
});
