import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
it('rolls back only an unused release and preserves common season data; reapplication works', async () => {
  const db = new PGlite();
  try {
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
    const before = (await db.query('select id,title,year from public.contest_editions order by id'))
      .rows;
    await db.exec(
      await readFile('supabase/rollbacks/20261014160311_google_sheets_purchase_edits.sql', 'utf8'),
    );
    await db.exec(
      await readFile('supabase/rollbacks/20261014120000_supplement_purchases.sql', 'utf8'),
    );
    expect(
      (await db.query('select id,title,year from public.contest_editions order by id')).rows,
    ).toEqual(before);
    await db.exec(
      await readFile('supabase/migrations/20261014120000_supplement_purchases.sql', 'utf8'),
    );
    await db.exec(
      await readFile('supabase/migrations/20261014160311_google_sheets_purchase_edits.sql', 'utf8'),
    );
    await db.exec(await readFile('tests/fixtures/purchases.sql', 'utf8'));
    await expect(
      db.exec(await readFile('supabase/rollbacks/20261014120000_supplement_purchases.sql', 'utf8')),
    ).rejects.toThrow('ROLLBACK_BLOCKED_RETAIN_PURCHASE_DATA');
    await db.exec('rollback');
    expect((await db.query('select * from public.purchase_offers')).rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});
