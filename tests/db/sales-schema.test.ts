import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

let db: PGlite;
const legacy = {
  user: crypto.randomUUID(),
  admin: crypto.randomUUID(),
  edition: crypto.randomUUID(),
  round: crypto.randomUUID(),
  candidate: crypto.randomUUID(),
  ticket: crypto.randomUUID(),
  vote: crypto.randomUUID(),
};
type Fixture = {
  owner: string;
  other: string;
  admin: string;
  staff: string;
  edition: string;
  round: string;
  candidate: string;
  otherCandidate: string;
  event: string;
  categories: string[];
  seats: string[];
  ticket: string;
};
let f: Fixture;
let savepointId = 0;
async function attempt<T>(action: () => Promise<T>): Promise<T> {
  const name = `check_${++savepointId}`;
  await db.exec(`savepoint ${name}`);
  try {
    const result = await action();
    await db.exec(`release savepoint ${name}`);
    return result;
  } catch (error) {
    await db.exec(`rollback to savepoint ${name}; release savepoint ${name}`);
    throw error;
  }
}
async function flush() {
  await db.exec('set constraints all immediate; set constraints all deferred');
}
async function asRole<T>(
  role: 'anon' | 'authenticated' | 'service_role',
  user: string | null,
  action: () => Promise<T>,
) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  try {
    return await action();
  } finally {
    await db.exec('reset role');
  }
}
async function makeOrder(seats = [f.seats[1]], owner = f.owner) {
  const id = crypto.randomUUID();
  const reference = `FTU${id.replaceAll('-', '').slice(0, 12)}`;
  const sum = await db.query<{ amount: number }>(
    'select sum(c.price_vnd)::integer as amount from public.event_seats s join public.ticket_categories c on c.id=s.category_id where s.id=any($1::uuid[])',
    [seats],
  );
  await db.query(
    `with tick as (select clock_timestamp() as t) insert into public.orders(id,event_id,user_id,reference,idempotency_key,request_hash,quantity,total_vnd,created_at,expires_at)
    select $1,$2,$3,$4,$5,$6,$7,$8,t,t+make_interval(secs=>(select hold_ttl_seconds from public.events where id=$2)) from tick`,
    [
      id,
      f.event,
      owner,
      reference,
      crypto.randomUUID(),
      'a'.repeat(64),
      seats.length,
      sum.rows[0].amount,
    ],
  );
  for (const seat of seats) {
    const item = crypto.randomUUID();
    await db.query(
      `insert into public.order_items(id,order_id,event_id,category_id,seat_id,unit_price_vnd,category_name,seat_label)
      select $1,$2,s.event_id,s.category_id,s.id,c.price_vnd,c.name,s.label from public.event_seats s join public.ticket_categories c on c.id=s.category_id where s.id=$3`,
      [item, id, seat],
    );
    await db.query(
      `insert into public.seat_holds(order_item_id,order_id,event_id,category_id,seat_id,expires_at)
      select i.id,i.order_id,i.event_id,i.category_id,i.seat_id,o.expires_at from public.order_items i join public.orders o on o.id=i.order_id where i.id=$1`,
      [item],
    );
  }
  await db.query(
    `insert into public.order_reservations(order_id,event_id,category_id,quantity,expires_at)
    select i.order_id,i.event_id,i.category_id,count(*)::integer,o.expires_at from public.order_items i join public.orders o on o.id=i.order_id where i.order_id=$1 group by i.order_id,i.event_id,i.category_id,o.expires_at`,
    [id],
  );
  await flush();
  return { id, reference, amount: sum.rows[0].amount, owner };
}
async function payOrder(order: Awaited<ReturnType<typeof makeOrder>>) {
  const payment = crypto.randomUUID();
  const transaction = `TEST-${crypto.randomUUID()}`;
  await db.query(
    `insert into public.payments(id,order_id,provider,mode,reference,expected_amount_vnd) values($1,$2,'sepay','TEST',$3,$4)`,
    [payment, order.id, order.reference, order.amount],
  );
  await db.query(
    `insert into public.payment_events(provider,mode,transaction_id,payment_id,order_id,reference,amount_vnd,direction,signature_verified,beneficiary_verified,state)
    values('sepay','TEST',$1,$2,$3,$4,$5,'IN',true,true,'APPLIED')`,
    [transaction, payment, order.id, order.reference, order.amount],
  );
  await db.query(
    `update public.payments set transaction_id=$2,received_amount_vnd=expected_amount_vnd,status='CONFIRMED',confirmed_at=clock_timestamp() where id=$1`,
    [payment, transaction],
  );
  await db.query("update public.orders set status='PAID',paid_at=clock_timestamp() where id=$1", [
    order.id,
  ]);
  await db.query("update public.seat_holds set state='CONSUMED' where order_id=$1", [order.id]);
  await db.query("update public.order_reservations set state='CONSUMED' where order_id=$1", [
    order.id,
  ]);
  await flush();
  const tickets: string[] = [];
  const items = await db.query<{ id: string }>(
    'select id from public.order_items where order_id=$1',
    [order.id],
  );
  for (const item of items.rows) {
    const id = crypto.randomUUID();
    await db.query(
      `insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash,event_id,category_id,seat_id,order_item_id,source)
      select $1,e.edition_id,e.round_id,$2,i.seat_label,$3,i.event_id,i.category_id,i.seat_id,i.id,'PAID' from public.order_items i join public.events e on e.id=i.event_id where i.id=$4`,
      [id, order.owner, id, item.id],
    );
    tickets.push(id);
  }
  return { payment, transaction, tickets };
}
async function makeVoting(
  round = f.round,
  edition = f.edition,
  candidate = f.candidate,
  admin = f.admin,
) {
  const session = crypto.randomUUID();
  const categories = [crypto.randomUUID(), crypto.randomUUID()];
  await db.query(
    `insert into public.vote_sessions(id,edition_id,round_id,title,open_at,close_at,published,updated_by)
    values($1,$2,$3,'TEST ONLY',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '9 minutes',true,$4)`,
    [session, edition, round, admin],
  );
  for (let i = 0; i < categories.length; i++) {
    await db.query(
      'insert into public.vote_categories(id,round_id,code,name) values($1,$2,$3,$4)',
      [categories[i], round, `test-${i}`, `TEST CATEGORY ${i}`],
    );
    await db.query('insert into public.vote_eligible_contestants values($1,$2,$3,$4)', [
      session,
      categories[i],
      round,
      candidate,
    ]);
  }
  await db.query("update public.vote_sessions set state='OPEN' where id=$1", [session]);
  return { session, categories, round, edition, candidate };
}
async function cast(
  voting: Awaited<ReturnType<typeof makeVoting>>,
  category: string,
  ticket = f.ticket,
  user = f.owner,
  candidate = voting.candidate,
) {
  return db.query<{ id: string }>(
    `insert into public.votes(edition_id,round_id,ticket_id,contestant_id,user_id,category_id,session_id,vote_format)
    values($1,$2,$3,$4,$5,$6,$7,'CATEGORY') returning id`,
    [voting.edition, voting.round, ticket, candidate, user, category, voting.session],
  );
}

async function legacyDatabase() {
  const db = new PGlite();
  await db.exec(
    "create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  );
  const migrations = (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations.slice(0, 3))
    await db.exec(
      (await readFile(`supabase/migrations/${name}`, 'utf8')).replace(
        'create extension if not exists pgcrypto;',
        '',
      ),
    );
  await db.query('insert into auth.users values($1),($2)', [legacy.user, legacy.admin]);
  await db.query("insert into public.user_roles values($1,'SUPER_ADMIN')", [legacy.admin]);
  await db.query(
    "insert into public.contest_editions(id,slug,title,year,published) values($1,'test-legacy','TEST LEGACY',2026,true)",
    [legacy.edition],
  );
  await db.query(
    "insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values($1,$2,'TEST LEGACY','final',0,10,true)",
    [legacy.round, legacy.edition],
  );
  await db.query(
    "insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,published) values($1,$2,$3,'legacy','TEST LEGACY','TEST','TEST',true)",
    [legacy.candidate, legacy.edition, legacy.admin],
  );
  await db.query('insert into public.round_entries values($1,$2,$3,true)', [
    legacy.edition,
    legacy.round,
    legacy.candidate,
  ]);
  await db.query(
    "insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash) values($1,$2,$3,$4,'L1','TEST-LEGACY-HASH')",
    [legacy.ticket, legacy.edition, legacy.round, legacy.user],
  );
  await db.query(
    'insert into public.votes(id,edition_id,round_id,ticket_id,contestant_id,user_id) values($1,$2,$3,$4,$5,$6)',
    [legacy.vote, legacy.edition, legacy.round, legacy.ticket, legacy.candidate, legacy.user],
  );
  return db;
}
beforeAll(async () => {
  db = await legacyDatabase();
  const migrations = (await readdir('supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations.slice(3))
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec('begin');
  f = {
    owner: crypto.randomUUID(),
    other: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    staff: crypto.randomUUID(),
    edition: crypto.randomUUID(),
    round: crypto.randomUUID(),
    candidate: crypto.randomUUID(),
    otherCandidate: crypto.randomUUID(),
    event: crypto.randomUUID(),
    categories: [crypto.randomUUID(), crypto.randomUUID()],
    seats: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
    ticket: crypto.randomUUID(),
  };
  for (const id of [f.owner, f.other, f.admin, f.staff])
    await db.query('insert into auth.users values($1)', [id]);
  await db.query("insert into public.user_roles values($1,'SUPER_ADMIN'),($2,'CHECKIN_STAFF')", [
    f.admin,
    f.staff,
  ]);
  await db.query(
    "insert into public.contest_editions(id,slug,title,year,published) values($1,$2,'TEST ONLY',2026,true)",
    [f.edition, f.edition],
  );
  await db.query(
    "insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values($1,$2,'TEST ONLY','final',0,10,true)",
    [f.round, f.edition],
  );
  for (const [id, user] of [
    [f.candidate, f.admin],
    [f.otherCandidate, f.other],
  ]) {
    await db.query(
      "insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,published) values($1,$2,$3,$4,'TEST ONLY','TEST','TEST',true)",
      [id, f.edition, user, id],
    );
    await db.query('insert into public.round_entries values($1,$2,$3,true)', [
      f.edition,
      f.round,
      id,
    ]);
  }
  // An existing manual ticket is mapped, never discarded or given an invented payment.
  await db.query(
    "insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash) values($1::uuid,$2,$3,$4,'A1',$1::uuid::text)",
    [f.ticket, f.edition, f.round, f.owner],
  );
  await db.query(
    "insert into public.events(id,edition_id,round_id,slug,title,venue,starts_at,sale_open_at,sale_close_at) values($1,$2,$3,$4,'TEST ONLY','TEST VENUE',clock_timestamp()+interval '2 hours',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')",
    [f.event, f.edition, f.round, f.event],
  );
  for (let i = 0; i < f.categories.length; i++)
    await db.query(
      'insert into public.ticket_categories(id,event_id,name,position) values($1,$2,$3,$4)',
      [f.categories[i], f.event, `TEST TIER ${i}`, i + 1],
    );
  for (let i = 0; i < f.seats.length; i++)
    await db.query(
      'insert into public.event_seats(id,event_id,category_id,row_label,seat_number,label) values($1,$2,$3,$4,$5,$6)',
      [
        f.seats[i],
        f.event,
        f.categories[i < 2 ? 0 : 1],
        i < 2 ? 'A' : 'B',
        i < 2 ? i + 1 : 1,
        ['A1', 'A2', 'B1'][i],
      ],
    );
  await db.query('update public.tickets set event_id=$2,category_id=$3,seat_id=$4 where id=$1', [
    f.ticket,
    f.event,
    f.categories[0],
    f.seats[0],
  ]);
  await db.query('update public.events set published=true where id=$1', [f.event]);
  await flush();
});
afterEach(async () => {
  await db.exec('rollback');
});

describe('Stage 02 sales and category-vote schema (isolated PostgreSQL/PGlite)', () => {
  it('preserves pre-migration ticket and unclassified vote identifiers and ownership', async () => {
    const row = (
      await db.query<{
        id: string;
        ticket_id: string;
        user_id: string;
        category_id: string | null;
        vote_format: string;
      }>('select id,ticket_id,user_id,category_id,vote_format from public.votes where id=$1', [
        legacy.vote,
      ])
    ).rows[0];
    expect(row).toMatchObject({
      id: legacy.vote,
      ticket_id: legacy.ticket,
      user_id: legacy.user,
      category_id: null,
      vote_format: 'LEGACY',
    });
  });
  it('enables RLS on every exposed table and revokes private helper execution', async () => {
    expect(
      (
        await db.query(
          "select relname from pg_class join pg_namespace on relnamespace=pg_namespace.oid where nspname='public' and relkind='r' and not relrowsecurity",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      attempt(() =>
        asRole('authenticated', f.owner, () => db.query('select ftu_sales_private.guard_order()')),
      ),
    ).rejects.toThrow();
  });
  it('public catalog excludes drafts and does not reveal private tables or token hashes', async () => {
    await db.query('update public.events set published=false where id=$1', [f.event]);
    await asRole('anon', null, async () => {
      expect(
        (await db.query('select id from public.events where id=$1', [f.event])).rows,
      ).toHaveLength(0);
    });
    for (const table of [
      'orders',
      'seat_holds',
      'payment_events',
      'checkins',
      'ticket_delivery_secrets',
      'vote_result_snapshots',
      'vote_incident_logs',
    ])
      await expect(
        attempt(() => asRole('anon', null, () => db.query(`select * from public.${table}`))),
      ).rejects.toThrow();
    await expect(
      attempt(() =>
        asRole('authenticated', f.owner, () => db.query('select token_hash from public.tickets')),
      ),
    ).rejects.toThrow();
  });
  it('stock counts mapped manual tickets once and cannot be edited independently', async () => {
    expect(
      (
        await db.query(
          'select capacity,held,sold,available from public.ticket_inventory where category_id=$1',
          [f.categories[0]],
        )
      ).rows[0],
    ).toEqual({ capacity: 2, held: 0, sold: 1, available: 1 });
    await expect(
      attempt(() =>
        asRole('service_role', null, () => db.query('update public.ticket_inventory set sold=-1')),
      ),
    ).rejects.toThrow();
  });
  it('checks composite foreign keys prevent cross-event seats and categories', async () => {
    await expect(
      attempt(() =>
        db.query(
          "insert into public.event_seats(event_id,category_id,row_label,seat_number,label) values($1,$2,'X',1,'X1')",
          [f.event, crypto.randomUUID()],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      attempt(() =>
        db.query('update public.tickets set round_id=$2 where id=$1', [f.ticket, legacy.round]),
      ),
    ).rejects.toThrow('IMMUTABLE_TICKET');
  });
  it('owner RLS exposes only their orders, items, reservations and payments', async () => {
    const order = await makeOrder();
    await asRole('authenticated', f.owner, async () => {
      expect((await db.query('select id from public.orders')).rows).toHaveLength(1);
      expect((await db.query('select id from public.order_items')).rows).toHaveLength(1);
    });
    await asRole('authenticated', f.other, async () => {
      expect((await db.query('select id from public.orders')).rows).toHaveLength(0);
      expect((await db.query('select id from public.order_reservations')).rows).toHaveLength(0);
    });
    await db.query(
      "insert into public.payments(order_id,provider,mode,reference,expected_amount_vnd) values($1,'sepay','TEST',$2,$3)",
      [order.id, order.reference, order.amount],
    );
    await asRole('authenticated', f.other, async () => {
      expect((await db.query('select id,status from public.payments')).rows).toHaveLength(0);
    });
    await expect(
      attempt(() =>
        asRole('authenticated', f.owner, () => db.query('select reference from public.payments')),
      ),
    ).rejects.toThrow();
  });
  it('authenticated users cannot write financial, hold or vote data directly', async () => {
    for (const table of [
      'orders',
      'order_items',
      'order_reservations',
      'seat_holds',
      'payments',
      'payment_events',
      'tickets',
      'votes',
    ])
      await expect(
        attempt(() =>
          asRole('authenticated', f.owner, () => db.query(`update public.${table} set id=id`)),
        ),
      ).rejects.toThrow();
  });
  it('enforces integer VND and 1-10 tickets without trusting client totals', async () => {
    await expect(
      attempt(() =>
        db.query('update public.ticket_categories set price_vnd=-1 where id=$1', [f.categories[0]]),
      ),
    ).rejects.toThrow();
    await expect(
      attempt(() =>
        db.query(
          "insert into public.orders(event_id,user_id,reference,idempotency_key,request_hash,quantity,total_vnd,created_at,expires_at) select $1,$2,'TEST-LIMIT',$3,$4,11,1100000,clock_timestamp(),clock_timestamp()+interval '5 minutes'",
          [f.event, f.owner, crypto.randomUUID(), 'a'.repeat(64)],
        ),
      ),
    ).rejects.toThrow();
    const order = await makeOrder();
    await expect(
      attempt(() => db.query('update public.orders set total_vnd=1 where id=$1', [order.id])),
    ).rejects.toThrow('IMMUTABLE_ORDER');
    await expect(
      attempt(() =>
        db.query('update public.order_items set unit_price_vnd=1 where order_id=$1', [order.id]),
      ),
    ).rejects.toThrow('IMMUTABLE_RECORD');
  });
  it('retains price snapshots when configured prices change later', async () => {
    const order = await makeOrder();
    await db.query('update public.ticket_categories set price_vnd=200000 where id=$1', [
      f.categories[0],
    ]);
    expect(
      (
        await db.query<{ unit_price_vnd: number }>(
          'select unit_price_vnd from public.order_items where order_id=$1',
          [order.id],
        )
      ).rows[0].unit_price_vnd,
    ).toBe(100000);
  });
  it('rejects two active claims for a seat and claims over an existing ticket', async () => {
    await makeOrder();
    await expect(attempt(() => makeOrder([f.seats[1]], f.other))).rejects.toThrow();
    await expect(attempt(() => makeOrder([f.seats[0]], f.other))).rejects.toThrow(
      'SEAT_UNAVAILABLE',
    );
    expect(
      (
        await db.query(
          'select capacity,held,sold,available from public.ticket_inventory where category_id=$1',
          [f.categories[0]],
        )
      ).rows[0],
    ).toEqual({ capacity: 2, held: 1, sold: 1, available: 0 });
  });
  it('requires complete order items and reservations at transaction boundaries', async () => {
    await expect(
      attempt(async () => {
        await db.query(
          "with tick as (select clock_timestamp() t) insert into public.orders(event_id,user_id,reference,idempotency_key,request_hash,quantity,total_vnd,created_at,expires_at) select $1,$2,'TEST-INCOMPLETE',$3,$4,1,100000,t,t+interval '5 minutes' from tick",
          [f.event, f.owner, crypto.randomUUID(), 'a'.repeat(64)],
        );
        await flush();
      }),
    ).rejects.toThrow('ORDER_TOTAL_MISMATCH');
  });
  it('releases a cancelled reservation once and keeps transaction history', async () => {
    const order = await makeOrder();
    await db.query("update public.orders set status='CANCELLED' where id=$1", [order.id]);
    await db.query("update public.seat_holds set state='RELEASED' where order_id=$1", [order.id]);
    await db.query("update public.order_reservations set state='RELEASED' where order_id=$1", [
      order.id,
    ]);
    await flush();
    await expect(
      attempt(() =>
        db.query("update public.seat_holds set state='HELD' where order_id=$1", [order.id]),
      ),
    ).rejects.toThrow('INVALID_HOLD_TRANSITION');
    await makeOrder([f.seats[1]], f.other);
    expect(
      (await db.query<{ n: number }>('select count(*)::integer n from public.orders')).rows[0].n,
    ).toBe(2);
  });
  it('does not extend a hold through retry or permit early expiry', async () => {
    const order = await makeOrder();
    await expect(
      attempt(() =>
        db.query("update public.orders set expires_at=expires_at+interval '1 minute' where id=$1", [
          order.id,
        ]),
      ),
    ).rejects.toThrow('IMMUTABLE_ORDER');
    await expect(
      attempt(() =>
        db.query(
          "update public.seat_holds set expires_at=expires_at+interval '1 minute' where order_id=$1",
          [order.id],
        ),
      ),
    ).rejects.toThrow('IMMUTABLE_HOLD');
    await expect(
      attempt(() => db.query("update public.orders set status='EXPIRED' where id=$1", [order.id])),
    ).rejects.toThrow('ORDER_NOT_EXPIRED');
  });
  it('does not issue a paid ticket for an unpaid order', async () => {
    const order = await makeOrder();
    await expect(
      attempt(() =>
        db.query(
          `insert into public.tickets(edition_id,round_id,user_id,seat_label,token_hash,event_id,category_id,seat_id,order_item_id,source)
      select $2,$3,$4,i.seat_label,'TEST-NO-PAYMENT',i.event_id,i.category_id,i.seat_id,i.id,'PAID' from public.order_items i where i.order_id=$1`,
          [order.id, f.edition, f.round, f.owner],
        ),
      ),
    ).rejects.toThrow('UNPAID_ORDER');
  });
  it('cannot mark paid without a verified, matching payment', async () => {
    const order = await makeOrder();
    await expect(
      attempt(async () => {
        await db.query(
          "update public.orders set status='PAID',paid_at=clock_timestamp() where id=$1",
          [order.id],
        );
        await db.query("update public.seat_holds set state='CONSUMED' where order_id=$1", [
          order.id,
        ]);
        await db.query("update public.order_reservations set state='CONSUMED' where order_id=$1", [
          order.id,
        ]);
        await flush();
      }),
    ).rejects.toThrow('PAYMENT_NOT_VERIFIED');
    expect(
      (
        await db.query<{ status: string }>('select status from public.orders where id=$1', [
          order.id,
        ])
      ).rows[0].status,
    ).toBe('PENDING_PAYMENT');
  });
  it('records wrong money for review without confirming or issuing additional tickets', async () => {
    const order = await makeOrder();
    await db.query(
      "insert into public.payment_events(provider,mode,transaction_id,order_id,reference,amount_vnd,direction,signature_verified,beneficiary_verified,state,reason_code) values('sepay','TEST','TEST-MISMATCH',$1,$2,90000,'IN',true,true,'REQUIRES_REVIEW','AMOUNT_MISMATCH')",
      [order.id, order.reference],
    );
    expect(
      (
        await db.query<{ status: string }>('select status from public.orders where id=$1', [
          order.id,
        ])
      ).rows[0].status,
    ).toBe('PENDING_PAYMENT');
    await expect(
      attempt(() =>
        db.query(
          "insert into public.payments(order_id,provider,mode,reference,transaction_id,expected_amount_vnd,received_amount_vnd,status,confirmed_at) values($1,'sepay','TEST',$2,'TEST-MISMATCH',100000,90000,'CONFIRMED',clock_timestamp())",
          [order.id, order.reference],
        ),
      ),
    ).rejects.toThrow();
  });
  it('confirmation and issuance are unique and cannot be reverted to pending', async () => {
    const order = await makeOrder();
    const paid = await payOrder(order);
    expect(paid.tickets).toHaveLength(1);
    await expect(
      attempt(() =>
        db.query("update public.orders set status='PENDING_PAYMENT',paid_at=null where id=$1", [
          order.id,
        ]),
      ),
    ).rejects.toThrow('INVALID_ORDER_TRANSITION');
    await expect(
      attempt(() =>
        db.query("update public.payments set status='PENDING' where id=$1", [paid.payment]),
      ),
    ).rejects.toThrow('IMMUTABLE_PAYMENT');
    await expect(
      attempt(() =>
        db.query('insert into public.tickets select * from public.tickets where id=$1', [
          paid.tickets[0],
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      attempt(() =>
        db.query(
          "insert into public.payment_events(provider,mode,transaction_id,reference,amount_vnd,direction) values('sepay','TEST',$1,$2,100000,'IN')",
          [paid.transaction, order.reference],
        ),
      ),
    ).rejects.toThrow();
  });
  it('test and live transaction identities are distinct and an unsigned event cannot be applied', async () => {
    await db.exec(
      "insert into public.payment_events(provider,mode,transaction_id,reference,amount_vnd,direction) values('sepay','TEST','TEST-SAME-ID','TEST-REF',100000,'IN'),('sepay','LIVE','TEST-SAME-ID','TEST-REF',100000,'IN')",
    );
    await expect(
      attempt(() =>
        db.exec(
          "update public.payment_events set state='APPLIED' where transaction_id='TEST-SAME-ID'",
        ),
      ),
    ).rejects.toThrow();
  });
  it('check-in has one immutable event-scoped record and cannot be repeated', async () => {
    await db.query('select public.check_in($1,$2,$3)', [f.staff, 'aal2', f.ticket]);
    expect(
      (
        await db.query('select event_id,actor_id from public.checkins where ticket_id=$1', [
          f.ticket,
        ])
      ).rows[0],
    ).toEqual({ event_id: f.event, actor_id: f.staff });
    await expect(
      attempt(() => db.query('select public.check_in($1,$2,$3)', [f.staff, 'aal2', f.ticket])),
    ).rejects.toThrow('ALREADY_CHECKED_IN');
    await expect(
      attempt(() =>
        db.query('update public.checkins set event_id=$2 where ticket_id=$1', [
          f.ticket,
          crypto.randomUUID(),
        ]),
      ),
    ).rejects.toThrow('IMMUTABLE_RECORD');
  });
  it('unmapped legacy tickets prevent publishing and manual issuance bypass', async () => {
    await expect(
      attempt(() =>
        db.query('select public.issue_ticket($1,$2,$3,$4,$5,$6)', [
          f.admin,
          'aal2',
          f.other,
          f.round,
          'FREE',
          'TEST-BYPASS',
        ]),
      ),
    ).rejects.toThrow('LEGACY_TICKET_MAPPING_REQUIRED');
    await expect(
      attempt(() =>
        db.query(
          "insert into public.tickets(edition_id,round_id,user_id,seat_label,token_hash,event_id,category_id,seat_id) values($1,$2,$3,'B1','TEST-MANUAL',$4,$5,$6)",
          [f.edition, f.round, f.other, f.event, f.categories[1], f.seats[2]],
        ),
      ),
    ).rejects.toThrow('MANUAL_ISSUE_DISABLED');
  });
  it('allows a mapped ticket to vote once in each category without check-in', async () => {
    const voting = await makeVoting();
    await cast(voting, voting.categories[0]);
    await cast(voting, voting.categories[1]);
    await expect(attempt(() => cast(voting, voting.categories[0]))).rejects.toThrow();
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::integer n from public.votes where ticket_id=$1',
          [f.ticket],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query<{ checked_in_at: Date | null }>(
          'select checked_in_at from public.tickets where id=$1',
          [f.ticket],
        )
      ).rows[0].checked_in_at,
    ).toBeNull();
  });
  it('rejects a different ticket owner, wrong round and an ineligible contestant', async () => {
    const voting = await makeVoting();
    await expect(
      attempt(() => cast(voting, voting.categories[0], f.ticket, f.other)),
    ).rejects.toThrow('TICKET_NOT_ELIGIBLE');
    await expect(
      attempt(() => cast(voting, voting.categories[0], legacy.ticket, legacy.user)),
    ).rejects.toThrow('TICKET_NOT_ELIGIBLE');
    await expect(
      attempt(() => cast(voting, voting.categories[0], f.ticket, f.owner, f.otherCandidate)),
    ).rejects.toThrow('CONTESTANT_NOT_ELIGIBLE');
  });
  it('closed windows reject new votes and existing votes cannot be altered or deleted', async () => {
    const voting = await makeVoting();
    const vote = (await cast(voting, voting.categories[0])).rows[0].id;
    await expect(
      attempt(() =>
        db.query('update public.votes set contestant_id=$2 where id=$1', [vote, f.otherCandidate]),
      ),
    ).rejects.toThrow('IMMUTABLE_VOTE');
    await expect(
      attempt(() => db.query('delete from public.votes where id=$1', [vote])),
    ).rejects.toThrow('IMMUTABLE_VOTE');
    await db.query("update public.vote_sessions set state='CLOSED' where id=$1", [voting.session]);
    await expect(attempt(() => cast(voting, voting.categories[1]))).rejects.toThrow('VOTE_CLOSED');
  });
  it('freezes categories and shared round entries from the first opening', async () => {
    const voting = await makeVoting();
    await expect(
      attempt(() =>
        db.query("update public.vote_categories set name='CHANGED' where id=$1", [
          voting.categories[0],
        ]),
      ),
    ).rejects.toThrow('VOTING_HAS_STARTED');
    await expect(
      attempt(() =>
        db.query('update public.round_entries set eligible=false where round_id=$1', [f.round]),
      ),
    ).rejects.toThrow('VOTING_HAS_STARTED');
  });
  it('reopening requires super-admin approval, records the incident and does not reset quota', async () => {
    const voting = await makeVoting();
    await cast(voting, voting.categories[0]);
    await db.query("update public.vote_sessions set state='CLOSED' where id=$1", [voting.session]);
    await expect(
      attempt(() =>
        db.query("update public.vote_sessions set state='OPEN' where id=$1", [voting.session]),
      ),
    ).rejects.toThrow('REOPEN_APPROVAL_REQUIRED');
    await db.query(
      "update public.vote_sessions set state='OPEN',reopen_approved_by=$2,reopen_reason='TEST INCIDENT' where id=$1",
      [voting.session, f.admin],
    );
    await expect(attempt(() => cast(voting, voting.categories[0]))).rejects.toThrow();
    await cast(voting, voting.categories[1]);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from public.vote_incident_logs where session_id=$1 and action='reopen'",
          [voting.session],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('unclassified historical votes block new category votes and finalization until reviewed', async () => {
    const voting = await makeVoting(legacy.round, legacy.edition, legacy.candidate, legacy.admin);
    await expect(
      attempt(() => cast(voting, voting.categories[0], legacy.ticket, legacy.user)),
    ).rejects.toThrow('LEGACY_VOTE_RECONCILIATION_REQUIRED');
    await db.query("update public.vote_sessions set state='CLOSED' where id=$1", [voting.session]);
    await expect(
      attempt(() =>
        db.query(
          "update public.vote_sessions set state='FINALIZED',finalized_at=clock_timestamp() where id=$1",
          [voting.session],
        ),
      ),
    ).rejects.toThrow('LEGACY_VOTE_RECONCILIATION_REQUIRED');
    await db.query(
      "update public.votes set vote_format='LEGACY_CLASSIFIED',category_id=$2,classified_by=$3,classified_at=clock_timestamp() where id=$1",
      [legacy.vote, voting.categories[0], legacy.admin],
    );
    await db.query(
      "update public.vote_sessions set state='OPEN',reopen_approved_by=$2,reopen_reason='TEST LEGACY REVIEW' where id=$1",
      [voting.session, legacy.admin],
    );
    await expect(
      attempt(() => cast(voting, voting.categories[0], legacy.ticket, legacy.user)),
    ).rejects.toThrow();
    await cast(voting, voting.categories[1], legacy.ticket, legacy.user);
  });
  it('a vote manager cannot reopen by supplying another super-admin as approver', async () => {
    const voting = await makeVoting();
    await db.query("insert into public.user_roles values($1,'VOTE_MANAGER')", [f.other]);
    await db.query("update public.vote_sessions set state='CLOSED',updated_by=$2 where id=$1", [
      voting.session,
      f.other,
    ]);
    await expect(
      attempt(() =>
        db.query(
          "update public.vote_sessions set state='OPEN',updated_by=$2,reopen_approved_by=$3,reopen_reason='TEST FORGED APPROVAL' where id=$1",
          [voting.session, f.other, f.admin],
        ),
      ),
    ).rejects.toThrow('REOPEN_APPROVAL_REQUIRED');
    expect(
      (
        await db.query<{ state: string }>('select state from public.vote_sessions where id=$1', [
          voting.session,
        ])
      ).rows[0].state,
    ).toBe('CLOSED');
  });
  it('finalized sessions cannot reopen and snapshots must match immutable database counts', async () => {
    const voting = await makeVoting();
    await cast(voting, voting.categories[0]);
    await db.query("update public.vote_sessions set state='CLOSED' where id=$1", [voting.session]);
    await db.query(
      "update public.vote_sessions set state='FINALIZED',finalized_at=clock_timestamp() where id=$1",
      [voting.session],
    );
    await expect(
      attempt(() =>
        db.query(
          "update public.vote_sessions set state='OPEN',finalized_at=null,reopen_approved_by=$2,reopen_reason='TEST' where id=$1",
          [voting.session, f.admin],
        ),
      ),
    ).rejects.toThrow('VOTING_FINALIZED');
    await expect(
      attempt(() =>
        db.query(
          'insert into public.vote_result_snapshots(session_id,round_id,category_id,results,created_by) values($1,$2,$3,$4,$5)',
          [
            voting.session,
            f.round,
            voting.categories[0],
            [{ contestant_id: f.candidate, votes: 99 }],
            f.admin,
          ],
        ),
      ),
    ).rejects.toThrow('SNAPSHOT_COUNT_MISMATCH');
    await db.query(
      'insert into public.vote_result_snapshots(session_id,round_id,category_id,results,created_by) values($1,$2,$3,$4,$5)',
      [
        voting.session,
        f.round,
        voting.categories[0],
        [{ contestant_id: f.candidate, votes: 1 }],
        f.admin,
      ],
    );
    await expect(
      attempt(() => db.query("update public.vote_result_snapshots set results='[]'::jsonb")),
    ).rejects.toThrow('IMMUTABLE_RECORD');
  });
  it('transaction rollback restores seats, order rows and stock exactly', async () => {
    const before = (await db.query('select * from public.ticket_inventory order by category_id'))
      .rows;
    await db.exec('savepoint aborted_checkout');
    await makeOrder([f.seats[1], f.seats[2]]);
    await db.exec('rollback to savepoint aborted_checkout; release savepoint aborted_checkout');
    expect(
      (await db.query('select * from public.ticket_inventory order by category_id')).rows,
    ).toEqual(before);
    expect((await db.query('select id from public.orders')).rows).toHaveLength(0);
  });
  it('a duplicate checkout key cannot create a second order or hold', async () => {
    const order = await makeOrder();
    const key = (
      await db.query<{ idempotency_key: string }>(
        'select idempotency_key from public.orders where id=$1',
        [order.id],
      )
    ).rows[0].idempotency_key;
    await expect(
      attempt(() =>
        db.query(
          "with tick as (select clock_timestamp() t) insert into public.orders(event_id,user_id,reference,idempotency_key,request_hash,quantity,total_vnd,created_at,expires_at) select $1,$2,'TEST-DUPLICATE',$3,$4,1,100000,t,t+interval '5 minutes' from tick",
          [f.event, f.owner, key, 'a'.repeat(64)],
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
      (await db.query<{ n: number }>('select count(*)::integer n from public.orders')).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from public.seat_holds where state='HELD'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('expired orders release seats, while late money goes to review without reviving the order', async () => {
    await db.query('update public.events set hold_ttl_seconds=1 where id=$1', [f.event]);
    const order = await makeOrder();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(attempt(() => payOrder(order))).rejects.toThrow('ORDER_EXPIRED');
    await db.query(
      "update public.orders set status='EXPIRED',reconciliation_status='REQUIRES_REVIEW' where id=$1",
      [order.id],
    );
    await db.query("update public.seat_holds set state='RELEASED' where order_id=$1", [order.id]);
    await db.query("update public.order_reservations set state='RELEASED' where order_id=$1", [
      order.id,
    ]);
    await db.query(
      "insert into public.payment_events(provider,mode,transaction_id,order_id,reference,amount_vnd,direction,signature_verified,beneficiary_verified,state,reason_code) values('sepay','TEST','TEST-LATE',$1,$2,$3,'IN',true,true,'REQUIRES_REVIEW','ORDER_EXPIRED')",
      [order.id, order.reference, order.amount],
    );
    await flush();
    expect(
      (
        await db.query<{ status: string }>('select status from public.orders where id=$1', [
          order.id,
        ])
      ).rows[0].status,
    ).toBe('EXPIRED');
    expect(
      (
        await db.query<{ available: number }>(
          'select available from public.ticket_inventory where category_id=$1',
          [f.categories[0]],
        )
      ).rows[0].available,
    ).toBe(1);
    expect((await db.query("select id from public.tickets where source='PAID'")).rows).toHaveLength(
      0,
    );
  });
  it('applied payment events preserve financial identity while allowing replay counters', async () => {
    const order = await makeOrder();
    const paid = await payOrder(order);
    await db.query(
      'update public.payment_events set replay_count=replay_count+1 where transaction_id=$1',
      [paid.transaction],
    );
    await expect(
      attempt(() =>
        db.query('update public.payment_events set amount_vnd=1 where transaction_id=$1', [
          paid.transaction,
        ]),
      ),
    ).rejects.toThrow('IMMUTABLE_PAYMENT_EVENT');
    await expect(
      attempt(() =>
        db.query(
          "update public.payment_events set state='REQUIRES_REVIEW' where transaction_id=$1",
          [paid.transaction],
        ),
      ),
    ).rejects.toThrow('IMMUTABLE_PAYMENT_EVENT');
  });
  it('check-in rejects cross-event foreign keys and a fabricated record without the ticket transition', async () => {
    await expect(
      attempt(() =>
        db.query(
          "insert into public.checkins(ticket_id,event_id,actor_id,checked_in_at,source) values($1,$2,$3,clock_timestamp(),'STAFF')",
          [f.ticket, crypto.randomUUID(), f.staff],
        ),
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      attempt(async () => {
        await db.query(
          "insert into public.checkins(ticket_id,event_id,actor_id,checked_in_at,source) values($1,$2,$3,clock_timestamp(),'STAFF')",
          [f.ticket, f.event, f.staff],
        );
        await flush();
      }),
    ).rejects.toThrow('CHECKIN_MISMATCH');
  });
  it('does not open an unconfigured session or allow the legacy RPC to bypass category voting', async () => {
    const empty = crypto.randomUUID();
    await db.query(
      "insert into public.vote_sessions(id,edition_id,round_id,title,updated_by,open_at,close_at,published) values($1,$2,$3,'TEST EMPTY',$4,clock_timestamp(),clock_timestamp()+interval '10 minutes',true)",
      [empty, f.edition, f.round, f.admin],
    );
    await expect(
      attempt(() => db.query("update public.vote_sessions set state='OPEN' where id=$1", [empty])),
    ).rejects.toThrow('VOTING_NOT_CONFIGURED');
    const voting = await makeVoting();
    await expect(
      attempt(() =>
        db.query('select public.cast_vote($1,$2,$3,$4)', [f.owner, f.round, f.ticket, f.candidate]),
      ),
    ).rejects.toThrow('VOTING_CATEGORY_REQUIRED');
    await expect(
      attempt(() => db.query('select public.open_voting($1,$2,$3)', [f.admin, 'aal2', f.round])),
    ).rejects.toThrow('VOTING_SESSION_REQUIRED');
    expect(voting.session).toBeTruthy();
  });
  it('private trigger functions have neither PUBLIC/client execution nor schema access', async () => {
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::integer n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ftu_sales_private' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))",
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_schema_privilege('authenticated','ftu_sales_private','USAGE') as allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it('guarded schema rollback refuses any populated sales or mapped history', async () => {
    const down = (
      await readFile('supabase/rollbacks/20261013122255_ftucharm_sales_voting.sql', 'utf8')
    )
      .replace(/^begin;\n/m, '')
      .replace(/commit;\s*$/, '');
    await expect(attempt(() => db.exec(down))).rejects.toThrow('ROLLBACK_HAS_DATA');
    expect(
      (await db.query('select id from public.events where id=$1', [f.event])).rows,
    ).toHaveLength(1);
  });
  it('an empty rollout can downgrade and reapply without losing pre-existing tickets, votes or RPC definitions', async () => {
    const isolated = await legacyDatabase();
    try {
      const before = (
        await isolated.query(
          "select relname from pg_class join pg_namespace on relnamespace=pg_namespace.oid where nspname='public' and relkind='r' order by relname",
        )
      ).rows;
      const rpc = (
        await isolated.query(
          "select replace(pg_get_functiondef('public.cast_vote(uuid,uuid,uuid,uuid)'::regprocedure),chr(13),'') as body",
        )
      ).rows;
      const migration = await readFile(
        'supabase/migrations/20261013122255_ftucharm_sales_voting.sql',
        'utf8',
      );
      await isolated.exec(migration);
      await isolated.exec(
        await readFile('supabase/rollbacks/20261013122255_ftucharm_sales_voting.sql', 'utf8'),
      );
      expect(
        (
          await isolated.query(
            "select relname from pg_class join pg_namespace on relnamespace=pg_namespace.oid where nspname='public' and relkind='r' order by relname",
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await isolated.query(
            "select replace(pg_get_functiondef('public.cast_vote(uuid,uuid,uuid,uuid)'::regprocedure),chr(13),'') as body",
          )
        ).rows,
      ).toEqual(rpc);
      expect(
        (await isolated.query('select id,user_id from public.tickets where id=$1', [legacy.ticket]))
          .rows[0],
      ).toEqual({ id: legacy.ticket, user_id: legacy.user });
      expect(
        (await isolated.query('select id,ticket_id from public.votes where id=$1', [legacy.vote]))
          .rows[0],
      ).toEqual({ id: legacy.vote, ticket_id: legacy.ticket });
      await isolated.exec(migration);
    } finally {
      await isolated.close();
    }
  });
  it('a failure before migration commit leaves the original schema and historical vote intact', async () => {
    const isolated = await legacyDatabase();
    try {
      const migration = (
        await readFile('supabase/migrations/20261013122255_ftucharm_sales_voting.sql', 'utf8')
      ).replace(/\ncommit;\s*$/, '\nselect 1 / 0;\ncommit;\n');
      await expect(isolated.exec(migration)).rejects.toThrow('division by zero');
      await isolated.exec('rollback');
      expect(
        (
          await isolated.query<{ table_name: string | null }>(
            "select to_regclass('public.events') as table_name",
          )
        ).rows[0].table_name,
      ).toBeNull();
      expect(
        (await isolated.query('select id from public.votes where id=$1', [legacy.vote])).rows,
      ).toHaveLength(1);
      expect(
        (
          await isolated.query(
            "select column_name from information_schema.columns where table_name='tickets' and column_name='event_id'",
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await isolated.close();
    }
  });
});
