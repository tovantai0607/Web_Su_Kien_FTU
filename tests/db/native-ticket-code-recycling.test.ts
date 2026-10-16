import { it, expect } from 'vitest';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import {
  owner,
  other,
  admin,
  offerId,
  productId,
  selection,
} from '../helpers/purchase-runtime';
import type { Purchase } from '@ftu/shared';

it.skipIf(!process.env.FTU_TEST_DATABASE_URL)(
  'queues distinct PostgreSQL connections and recycles codes without sharing a ticket identity',
  async () => {
    const url = new URL(process.env.FTU_TEST_DATABASE_URL!);
    expect([url.hostname, url.port, url.username, url.pathname]).toEqual([
      '127.0.0.1',
      '55433',
      'codex_test',
      '/postgres',
    ]);
    const control = new pg.Client({ connectionString: url.href });
    await control.connect();
    const database = 'ftu_code_race_' + Date.now();
    if (!/^ftu_code_race_\d+$/.test(database)) throw new Error('Unsafe local database');
    await control.query(`create database ${database}`);
    url.pathname = '/' + database;
    const setup = new pg.Client({ connectionString: url.href });
    await setup.connect();
    const pool = new pg.Pool({
      connectionString: url.href,
      max: 20,
      application_name: 'ftu_code_race',
      options: '-c role=service_role -c statement_timeout=15000',
    });
    try {
      for (const role of ['anon', 'authenticated', 'service_role'])
        await control.query(
          `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${role === 'service_role' ? ' bypassrls' : ''};end if;end$$;`,
        );
      await setup.query(
        "create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
      );
      for (const f of (await readdir('supabase/migrations'))
        .filter((f) => f.endsWith('.sql'))
        .sort())
        await setup.query(await readFile('supabase/migrations/' + f, 'utf8'));
      await setup.query(await readFile('tests/fixtures/purchases.sql', 'utf8'));
      await setup.query('select public.configure_ticket_code_stock($1,$2,$3,$4)', [
        offerId,
        'DM',
        50,
        100,
      ]);
      await setup.query('update public.purchase_products set quota=41 where id=$1', [productId]);
      const orders = await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          const user = i % 2 ? owner : other,
            data = selection();
          data.lines[0].bundle_size = i < 10 ? 3 : 1;
          const purchase = (
            await pool.query<{ data: Purchase }>(
              'select public.reserve_purchase($1,$2,$3,$4) data',
              [user, data, crypto.randomUUID(), 'a'.repeat(64)],
            )
          ).rows[0].data;
          const proof = crypto.randomUUID();
          await pool.query('select public.attach_purchase_evidence($1,$2,$3,$4,$5)', [
            user,
            purchase.id,
            proof,
            `private/purchases/${user}/${purchase.id}/${proof}.webp`,
            100,
          ]);
          return { user, purchase, proof };
        }),
      );
      // Demonstrate actual lock waiting, not Promise.all around a single-session emulator.
      await setup.query('begin');
      await setup.query('select id from public.purchase_offers where id=$1 for update', [offerId]);
      const clients = await Promise.all(Array.from({ length: 20 }, () => pool.connect()));
      expect(
        new Set(
          (await Promise.all(clients.map((c) => c.query('select pg_backend_pid() pid')))).map(
            (r) => r.rows[0].pid,
          ),
        ).size,
      ).toBe(20);
      const calls = clients.map((c, i) =>
        c.query('select public.complete_purchase($1,$2,$3)', [
          orders[i].user,
          orders[i].purchase.id,
          orders[i].proof,
        ]),
      );
      let waiting = 0;
      for (let i = 0; i < 40 && waiting < 2; i++) {
        waiting = Number(
          (
            await setup.query(
              "select count(*) n from pg_stat_activity where application_name='ftu_code_race' and wait_event_type='Lock'",
            )
          ).rows[0].n,
        );
        if (waiting < 2) await new Promise((r) => setTimeout(r, 25));
      }
      await setup.query('commit');
      try {
        await Promise.all(calls);
      } finally {
        clients.forEach((c) => c.release());
      }
      expect(waiting).toBeGreaterThanOrEqual(2);
      const counts = (
        await setup.query(`select count(*)::int n,count(distinct ticket_id)::int unique_tickets,count(distinct code)::int unique_codes
      from ftu_sales_private.ticket_code_slots where ticket_id is not null`)
      ).rows[0];
      expect(counts).toEqual({ n: 40, unique_tickets: 40, unique_codes: 40 });
      const wrong = (
        await setup.query(
          'select count(*)::int n from public.tickets t join public.purchase_requests r on r.id=t.purchase_id where t.user_id<>r.user_id',
        )
      ).rows[0].n;
      expect(wrong).toBe(0);
      await Promise.all(
        orders.map((o) =>
          pool.query('select public.complete_purchase($1,$2,$3)', [o.user, o.purchase.id, o.proof]),
        ),
      );
      expect(Number((await setup.query('select count(*) n from public.tickets')).rows[0].n)).toBe(
        40,
      );
      const order = orders[0];
      const members = (
        await pool.query('select public.read_purchase_ticket_codes($1,$2,$3) data', [
          admin,
          'aal1',
          order.purchase.id,
        ])
      ).rows[0].data;
      const payload = {
        operation_id: crypto.randomUUID(),
        expected_revision: 0,
        codes: members.map((r: { code: string }) => r.code),
        ticket_ids: members.map((r: { ticket_id: string }) => r.ticket_id),
        buyer: Object.fromEntries(Object.keys(selection().buyer).map((k) => [k, ''])),
        evidence_id: null,
      };
      await Promise.all(
        Array.from({ length: 20 }, () =>
          pool.query('select public.edit_ticket_code_row($1,$2,$3,$4)', [
            admin,
            'aal1',
            order.purchase.id,
            payload,
          ]),
        ),
      );
      expect(
        Number(
          (
            await setup.query(
              'select count(*) n from ftu_sales_private.ticket_code_history where released_at is not null',
            )
          ).rows[0].n,
        ),
      ).toBe(3);
      // Four quota slots remain; twenty simultaneous attempts at a four-ticket order have one winner.
      const attempts = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          pool.query<{ data: Purchase }>('select public.reserve_purchase($1,$2,$3,$4) data', [
            other,
            selection(4),
            crypto.randomUUID(),
            'b'.repeat(64),
          ]),
        ),
      );
      expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of attempts)
        if (r.status === 'rejected') expect(r.reason.message).toContain('QUOTA_UNAVAILABLE');
      const winner = (
        attempts.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
          pg.QueryResult<{ data: Purchase }>
        >
      ).value.rows[0].data;
      const evidence = crypto.randomUUID();
      await pool.query('select public.attach_purchase_evidence($1,$2,$3,$4,$5)', [
        other,
        winner.id,
        evidence,
        `private/purchases/${other}/${winner.id}/${evidence}.webp`,
        100,
      ]);
      await Promise.all(
        Array.from({ length: 20 }, () =>
          pool.query('select public.complete_purchase($1,$2,$3)', [other, winner.id, evidence]),
        ),
      );
      const reused = (
        await setup.query(
          'select code,ticket_id from ftu_sales_private.ticket_code_slots where code=any($1)',
          [payload.codes],
        )
      ).rows;
      expect(reused).toHaveLength(3);
      expect(reused.every((r) => r.ticket_id && !payload.ticket_ids.includes(r.ticket_id))).toBe(
        true,
      );
      expect(
        Number(
          (await setup.query("select count(*) n from public.tickets where status='issued'")).rows[0]
            .n,
        ),
      ).toBe(41);
      console.log(
        'PASS 20 distinct connections: database lock queue, 40 unique codes, retry idempotency, release once, last-quota single winner, recycled codes with new UUIDs.',
      );
    } finally {
      await setup.query('rollback');
      await pool.end();
      await setup.end();
      await control.query(`drop database ${database} with (force)`);
      await control.end();
    }
  },
  120000,
);
