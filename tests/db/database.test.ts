import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
let db: PGlite;
const edition = '11111111-1111-4111-8111-111111111111',
  otherEdition = '11111111-1111-4111-8111-111111111112',
  round = '22222222-2222-4222-8222-222222222222',
  user = '33333333-3333-4333-8333-333333333333',
  admin = '33333333-3333-4333-8333-333333333334',
  candidate = '44444444-4444-4444-8444-444444444444',
  ticket = '55555555-5555-4555-8555-555555555555';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create schema auth;create role anon;create role authenticated;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`,
  );
  await db.exec('alter default privileges grant execute on functions to anon, authenticated;');
  for (const file of (await readdir('supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    const sql = (await readFile('supabase/migrations/' + file, 'utf8')).replace(
      'create extension if not exists pgcrypto;',
      '',
    );
    await db.exec(sql);
  }
  await db.exec(
    `insert into auth.users values('${user}'),('${admin}');insert into public.user_roles values('${admin}','SUPER_ADMIN');insert into public.contest_editions(id,slug,title,year,published,registration_open_at,registration_close_at) values('${edition}','test','TEST ONLY',2026,true,now()-interval '1 hour',now()+interval '1 hour'),('${otherEdition}','other','TEST ONLY',2026,false,null,null);insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,published) values('${candidate}','${edition}','${admin}','test-candidate','TEST ONLY','FTU','Test bio',true);insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published,vote_open_at,vote_close_at) values('${round}','${edition}','Final','final',0,15,true,now()-interval '1 minute',now()+interval '9 minutes');insert into public.round_entries values('${edition}','${round}','${candidate}',true);insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash,checked_in_at) values('${ticket}','${edition}','${round}','${user}','A1','token-test',now());`,
  );
});
afterAll(async () => {
  await db.close();
});
describe('Postgres migrations & invariants (PGlite single-session)', () => {
  it('all tables are protected with RLS', async () => {
    const r = await db.query<{ relname: string }>(
      "select relname from pg_class join pg_namespace on relnamespace=pg_namespace.oid where nspname='public' and relkind='r' and not relrowsecurity",
    );
    expect(r.rows).toHaveLength(0);
  });
  it('anon cannot read private data, write votes, or invoke server-only RPC', async () => {
    await db.exec('set role anon;');
    await expect(db.query('select * from public.contestant_private')).rejects.toThrow();
    await expect(
      db.query(`select public.cast_vote('${user}','${round}','${ticket}','${candidate}')`),
    ).rejects.toThrow();
    await expect(db.query('select user_id from public.contestants')).rejects.toThrow();
    await expect(
      db.query(`select public.has_role('${admin}',array['SUPER_ADMIN'])`),
    ).rejects.toThrow();
    await db.exec('reset role;');
  });
  it('public data respects unpublished edition', async () => {
    await db.exec('set role anon;');
    const r = await db.query('select id from public.contest_editions');
    expect(r.rows).toHaveLength(1);
    await db.exec('reset role;');
  });
  it('unverified MFA cannot approve an application', async () => {
    await expect(
      db.query(
        `select public.review_application('${admin}','aal1','${candidate}','approved','Test note')`,
      ),
    ).rejects.toThrow('FORBIDDEN');
  });
  it('queued retries create only one legacy vote and replay returns its ID', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.query<{ cast_vote: { id: string } }>('select public.cast_vote($1,$2,$3,$4)', [
          user,
          round,
          ticket,
          candidate,
        ]),
      ),
    );
    expect(new Set(results.map((r) => r.rows[0].cast_vote.id)).size).toBe(1);
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from public.votes where ticket_id=$1',
          [ticket],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('wrong owner cannot use a checked-in ticket', async () => {
    await expect(
      db.query('select public.cast_vote($1,$2,$3,$4)', [admin, round, ticket, candidate]),
    ).rejects.toThrow('TICKET_NOT_ELIGIBLE');
  });
  it('400 checked-in tickets each create exactly one vote', async () => {
    const ids = Array.from({ length: 400 }, () => crypto.randomUUID());
    const voters = Array.from({ length: 400 }, () => crypto.randomUUID());
    for (let i = 0; i < ids.length; i++) {
      await db.query('insert into auth.users(id) values($1)', [voters[i]]);
      await db.query(
        'insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash,checked_in_at) values($1,$2,$3,$4,$5,$6,now())',
        [ids[i], edition, round, voters[i], `LOAD-${i}`, `load-hash-${i}`],
      );
    }
    const results = await Promise.all(
      ids.map((id, i) =>
        db.query('select public.cast_vote($1,$2,$3,$4)', [voters[i], round, id, candidate]),
      ),
    );
    expect(results).toHaveLength(400);
    expect(
      (await db.query<{ n: number }>('select count(*)::int n from public.votes')).rows[0].n,
    ).toBe(401);
  });
  it('vote after closing rejects even for unused checked-in ticket', async () => {
    const id = crypto.randomUUID();
    await db.query(
      'insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash,checked_in_at) values($1,$2,$3,$4,$5,$6,now())',
      [id, edition, round, user, 'LATE', 'late'],
    );
    await db.exec(
      `update public.contest_rounds set vote_open_at=now()-interval '11 minutes',vote_close_at=now()-interval '1 minute' where id='${round}';`,
    );
    await expect(
      db.query('select public.cast_vote($1,$2,$3,$4)', [user, round, id, candidate]),
    ).rejects.toThrow('VOTE_CLOSED');
  });
  it('check-in uses atomic one-time transition', async () => {
    const id = crypto.randomUUID();
    await db.query(
      'insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash) values($1,$2,$3,$4,$5,$6)',
      [id, edition, round, user, 'CHECK', 'check-hash'],
    );
    await db.query('select public.check_in($1,$2,$3)', [admin, 'aal2', 'check-hash']);
    await expect(
      db.query('select public.check_in($1,$2,$3)', [admin, 'aal2', 'check-hash']),
    ).rejects.toThrow('ALREADY_CHECKED_IN');
  });
  it('registration transaction saves private profile, consent and one outbox message; idempotent retry', async () => {
    const media = Array.from({ length: 3 }, () => crypto.randomUUID());
    const studentCard = crypto.randomUUID();
    await db.query(
      "insert into public.media_assets(id,edition_id,user_id,object_key,mime,bytes,purpose) values($1::uuid,$2,$3,$1::text,'image/webp',100,'student_card')",
      [studentCard, edition, user],
    );
    for (const id of media)
      await db.query(
        'insert into public.media_assets(id,edition_id,user_id,object_key,mime,bytes) values($1,$2,$3,$4,$5,100)',
        [id, edition, user, id, 'image/webp'],
      );
    const data = {
      edition_id: edition,
      full_name: 'TEST ONLY',
      email: 'test@example.test',
      phone: '0912345678',
      faculty: 'Test',
      bio: 'Test bio',
      talents: '',
      media_ids: media,
      student_card_media_id: studentCard,
      consent: true,
    };
    const key = crypto.randomUUID();
    await expect(
      db.query('select public.apply_contestant($1,$2,$3,$4)', [
        user,
        { ...data, student_card_media_id: null },
        key,
        'hash',
      ]),
    ).rejects.toThrow('INVALID_STUDENT_CARD');
    await expect(
      db.query('select public.apply_contestant($1,$2,$3,$4)', [
        user,
        { ...data, student_card_media_id: media[0] },
        key,
        'hash',
      ]),
    ).rejects.toThrow('INVALID_STUDENT_CARD');
    await db.query('update public.media_assets set user_id=$1 where id=$2', [admin, studentCard]);
    await expect(
      db.query('select public.apply_contestant($1,$2,$3,$4)', [user, data, key, 'hash']),
    ).rejects.toThrow('INVALID_STUDENT_CARD');
    await db.query('update public.media_assets set user_id=$1,purpose=$3 where id=$2', [
      user,
      studentCard,
      'portfolio',
    ]);
    await expect(
      db.query('select public.apply_contestant($1,$2,$3,$4)', [user, data, key, 'hash']),
    ).rejects.toThrow('INVALID_STUDENT_CARD');
    await db.query('update public.media_assets set purpose=$1 where id=$2', [
      'student_card',
      studentCard,
    ]);
    const r = await db.query<{ apply_contestant: { id: string } }>(
      'select public.apply_contestant($1,$2,$3,$4)',
      [user, data, key, 'hash'],
    );
    const again = await db.query('select public.apply_contestant($1,$2,$3,$4)', [
      user,
      data,
      key,
      'hash',
    ]);
    expect(again.rows).toEqual(r.rows);
    expect(
      (
        await db.query<{ university: string; student_card_media_id: string }>(
          'select university,student_card_media_id from public.contestant_private where id=$1',
          [r.rows[0].apply_contestant.id],
        )
      ).rows[0],
    ).toEqual({ university: 'Đại học Ngoại thương', student_card_media_id: studentCard });
    expect(
      (await db.query('select * from public.contestant_media where media_id=$1', [studentCard]))
        .rows,
    ).toHaveLength(0);
    await db.exec('set role anon;');
    await expect(
      db.query('select student_card_media_id from public.contestant_private'),
    ).rejects.toThrow();
    await db.exec('reset role;');
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.email_outbox where template='received'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query<{ published: boolean }>(
          'select published from public.contestants where id=$1',
          [r.rows[0].apply_contestant.id],
        )
      ).rows[0].published,
    ).toBe(false);
    await expect(
      db.query('select public.apply_contestant($1,$2,$3,$4)', [user, data, key, 'changed']),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('admin CMS save is atomic with audit record', async () => {
    const id = crypto.randomUUID();
    await db.query('select public.admin_save($1,$2,$3,$4,$5)', [
      admin,
      'aal2',
      'timeline_events',
      id,
      {
        edition_id: edition,
        title: 'Test title',
        description: 'Test timeline',
        position: 42,
        published: false,
      },
    ]);
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int n from public.audit_logs where target_id=$1',
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it('private ownership is enforced by RLS', async () => {
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`,
    );
    expect((await db.query('select * from public.contestant_private')).rows).toHaveLength(0);
    await db.exec('reset role;');
  });
  it('public eligible entries can be read without private contestant identifiers', async () => {
    await db.exec('set role anon;');
    const result = await db.query('select contestant_id from public.round_entries');
    expect(result.rows).toHaveLength(1);
    await db.exec('reset role;');
  });
  it('manager opens exactly ten minutes once using database time', async () => {
    const rid = crypto.randomUUID();
    await db.query(
      'insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values($1,$2,$3,$4,99,15,true)',
      [rid, edition, 'Test window', 'final'],
    );
    await db.query('insert into public.round_entries values($1,$2,$3,true)', [
      edition,
      rid,
      candidate,
    ]);
    const result = await db.query<{ open_voting: { vote_open_at: string; vote_close_at: string } }>(
      'select public.open_voting($1,$2,$3)',
      [admin, 'aal2', rid],
    );
    const window = result.rows[0].open_voting;
    expect(Date.parse(window.vote_close_at) - Date.parse(window.vote_open_at)).toBe(600000);
    await expect(
      db.query('select public.open_voting($1,$2,$3)', [admin, 'aal2', rid]),
    ).rejects.toThrow('VOTING_HAS_STARTED');
  });
});
