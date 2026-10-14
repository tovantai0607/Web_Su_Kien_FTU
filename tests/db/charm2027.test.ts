import { beforeAll, afterAll, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

let db: PGlite;
const admin = crypto.randomUUID(),
  user = crypto.randomUUID(),
  other = crypto.randomUUID();
const edition = crypto.randomUUID(),
  round = crypto.randomUUID();
const male = crypto.randomUUID(),
  female = crypto.randomUUID(),
  ticket = crypto.randomUUID();
let maleCategory: string, femaleCategory: string, session: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
    create table auth.users(id uuid primary key);
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
  await db.query('insert into auth.users values($1),($2),($3)', [admin, user, other]);
  await db.query("insert into public.user_roles values($1,'SUPER_ADMIN')", [admin]);
  await db.query(
    "insert into public.contest_editions(id,slug,title,year,published) values($1,'test-2027','Test',2027,true)",
    [edition],
  );
  await db.query(
    "insert into public.contest_rounds(id,edition_id,title,kind,position,cutoff,published) values($1,$2,'Final','final',0,10,true)",
    [round, edition],
  );
  for (const [id, gender, owner] of [
    [male, 'male', admin],
    [female, 'female', other],
  ])
    await db.query(
      "insert into public.contestants(id,edition_id,user_id,slug,display_name,faculty,bio,gender,cohort,class_name,height_cm,published) values($1::uuid,$2,$3,$1::text,'Test','FTU','Test bio',$4,'K63','Anh 1',170,true)",
      [id, edition, owner, gender],
    );
  await db.query('insert into public.round_entries values($1,$2,$3,true),($1,$2,$4,true)', [
    edition,
    round,
    male,
    female,
  ]);
  await db.query(
    "insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash) values($1,$2,$3,$4,'A1','TEST')",
    [ticket, edition, round, user],
  );
});
afterAll(async () => {
  await db.close();
});

it('seeds both categories in a draft 2027 season without opening registrations or voting', async () => {
  const { rows } = await db.query<{ code: string; published: boolean; vote_open_at: null }>(
    `select c.code,r.published,r.vote_open_at from public.vote_categories c join public.contest_rounds r on r.id=c.round_id join public.contest_editions e on e.id=r.edition_id where e.slug='ftucharm-2027' order by c.code`,
  );
  expect(rows).toEqual([
    { code: 'female', published: false, vote_open_at: null },
    { code: 'male', published: false, vote_open_at: null },
  ]);
});
it('requires role before editing details or preparing voting', async () => {
  await expect(
    db.query('select public.prepare_gender_voting($1,$2,$3)', [user, 'aal1', round]),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    db.query('select public.prepare_gender_voting($1,$2,$3)', [user, 'aal2', round]),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    db.query('select public.update_contestant_details($1,$2,$3,$4)', [user, 'aal2', male, {}]),
  ).rejects.toThrow('FORBIDDEN');
});
it('validates public profile fields and preserves private contact restrictions', async () => {
  await expect(
    db.query('update public.contestants set height_cm=999 where id=$1', [male]),
  ).rejects.toThrow();
  await db.exec('set role anon');
  expect(
    (await db.query('select cohort,class_name,height_cm,gender from public.contestants')).rows,
  ).toHaveLength(2);
  await expect(db.query('select user_id from public.contestants')).rejects.toThrow();
  await expect(db.query('select * from public.news_posts')).rejects.toThrow();
  await expect(
    db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
      user,
      round,
      ticket,
      male,
      round,
      round,
    ]),
  ).rejects.toThrow();
  await db.exec('reset role');
});
it('operational rollback preserves profile data before voting starts', async () => {
  const sql = (
    await readFile('supabase/rollbacks/20261014100000_charm2027_profiles_categories.sql', 'utf8')
  )
    .replace(/^begin;$/m, '')
    .replace(/^commit;$/m, '');
  await db.exec('begin');
  try {
    await db.exec(sql);
    expect(
      (await db.query('select cohort from public.contestants where id=$1', [male])).rows,
    ).toEqual([{ cohort: 'K63' }]);
    expect(
      (await db.query('select id from public.vote_categories where gender is not null')).rows,
    ).toHaveLength(0);
  } finally {
    await db.exec('rollback');
  }
});
it('prepares categories idempotently and opens one session with correct gender assignments', async () => {
  for (let i = 0; i < 2; i++)
    await db.query('select public.prepare_gender_voting($1,$2,$3)', [admin, 'aal2', round]);
  const cats = (
    await db.query<{ id: string; gender: string }>(
      'select id,gender from public.vote_categories where round_id=$1',
      [round],
    )
  ).rows;
  expect(cats).toHaveLength(2);
  maleCategory = cats.find((c) => c.gender === 'male')!.id;
  femaleCategory = cats.find((c) => c.gender === 'female')!.id;
  await db.query('select public.open_voting($1,$2,$3)', [admin, 'aal2', round]);
  session = (
    await db.query<{ id: string }>('select id from public.vote_sessions where round_id=$1', [round])
  ).rows[0].id;
  const assignments = (
    await db.query(
      'select category_id,contestant_id from public.vote_eligible_contestants where session_id=$1',
      [session],
    )
  ).rows;
  expect(assignments).toEqual(
    expect.arrayContaining([
      { category_id: maleCategory, contestant_id: male },
      { category_id: femaleCategory, contestant_id: female },
    ]),
  );
  await expect(
    db.query('select public.open_voting($1,$2,$3)', [admin, 'aal2', round]),
  ).rejects.toThrow('VOTING_HAS_STARTED');
});
it('accepts valid tickets without check-in; rejects wrong owners and cross-category votes', async () => {
  await expect(
    db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
      user,
      round,
      ticket,
      male,
      maleCategory,
      session,
    ]),
  ).resolves.toBeDefined();
  await expect(
    db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
      other,
      round,
      ticket,
      male,
      maleCategory,
      session,
    ]),
  ).rejects.toThrow('TICKET_NOT_ELIGIBLE');
  await expect(
    db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
      user,
      round,
      ticket,
      female,
      maleCategory,
      session,
    ]),
  ).rejects.toThrow();
  await expect(
    db.query("update public.contestants set gender='female' where id=$1", [male]),
  ).rejects.toThrow('VOTING_HAS_STARTED');
});
it('records exactly one vote per gender and returns the same receipt on retry', async () => {
  const vote = () =>
    db.query<{ cast_category_vote: { id: string } }>(
      'select public.cast_category_vote($1,$2,$3,$4,$5,$6)',
      [user, round, ticket, male, maleCategory, session],
    );
  const results = await Promise.all(Array.from({ length: 12 }, vote));
  expect(new Set(results.map((r) => r.rows[0].cast_category_vote.id)).size).toBe(1);
  await db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
    user,
    round,
    ticket,
    female,
    femaleCategory,
    session,
  ]);
  expect(
    (await db.query('select id from public.votes where ticket_id=$1', [ticket])).rows,
  ).toHaveLength(2);
});
it('blocks new votes when the session is closed and keeps existing receipts immutable', async () => {
  const second = crypto.randomUUID();
  await db.query(
    "insert into public.tickets(id,edition_id,round_id,user_id,seat_label,token_hash,checked_in_at) values($1,$2,$3,$4,'A2','TEST2',now())",
    [second, edition, round, user],
  );
  await db.query("update public.vote_sessions set state='CLOSED' where id=$1", [session]);
  await expect(
    db.query('select public.cast_category_vote($1,$2,$3,$4,$5,$6)', [
      user,
      round,
      second,
      male,
      maleCategory,
      session,
    ]),
  ).rejects.toThrow('VOTE_CLOSED');
  await expect(db.query('delete from public.votes where ticket_id=$1', [ticket])).rejects.toThrow(
    'IMMUTABLE_VOTE',
  );
});

it('refuses operational rollback once gender ballots exist', async () => {
  const sql = await readFile(
    'supabase/rollbacks/20261014100000_charm2027_profiles_categories.sql',
    'utf8',
  );
  await expect(db.exec(sql)).rejects.toThrow('ROLLBACK_BLOCKED');
  await db.exec('rollback');
  expect(
    (await db.query('select id from public.votes where ticket_id=$1', [ticket])).rows,
  ).toHaveLength(2);
});
