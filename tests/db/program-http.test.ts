import { beforeAll, beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import {
  databaseAdapter,
  localEnvironment,
  testAuthenticate,
  testAuthorize,
  token,
  fixture,
  owner,
  other,
  admin,
} from '../helpers/purchase-runtime';
import { app } from '../../apps/api/src/index';

let db: PGlite;
vi.mock('../../apps/api/src/security', async (original) => ({
  ...(await original<typeof import('../../apps/api/src/security')>()),
  authenticate: testAuthenticate,
  authorize: (
    ...[principal, environment, roles]: Parameters<
      typeof import('../../apps/api/src/security').authorize
    >
  ) =>
    testAuthorize(
      (sql, params) => db.query(sql, params),
      principal.id === admin ? { ...principal, aal: 'aal2' } : principal,
      environment,
      roles,
    ),
  service: () => databaseAdapter((sql, params) => db.query(sql, params)),
}));
const { env, objects } = localEnvironment();
env.PUBLIC_EDITION_SLUG = 'supplement-test';
const edition = fixture(10),
  round = fixture(20),
  person = fixture(60),
  publication = fixture(80);
const request = (path: string, method = 'GET', body?: unknown, auth?: string, extra = {}) =>
  app.request(
    'http://localhost/api' + path,
    {
      method,
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
const data = async (r: Response) => ((await r.json()) as { data: unknown }).data;
const draft = {
  id: publication,
  edition_id: edition,
  contestant_id: person,
  round_id: round,
  award_name: '',
  photo_url: '/api/public-images/' + fixture(81) + '.webp',
  published: false,
};

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('External network forbidden in isolated program tests');
    }),
  );
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
  await db.query(
    "update public.contest_editions set registration_open_at='2027-03-06T17:00:00Z',registration_close_at='2027-03-21T17:00:00Z' where id=$1",
    [edition],
  );
  await db.query("insert into public.user_roles values($1,'CONTENT_EDITOR')", [other]);
  await db.query(
    "insert into public.timeline_events(id,edition_id,title,position,starts_at,published) values($1,$2,'QA timeline published',0,'2027-02-14T17:00:00Z',true),($3,$2,'QA draft must stay private',1,'2027-03-06T17:00:00Z',false)",
    [fixture(82), edition, fixture(83)],
  );
});
beforeEach(async () => {
  await db.exec('begin');
});
afterEach(async () => {
  await db.exec('rollback');
  objects.clear();
  expect(objects.size).toBe(0);
});
afterAll(async () => {
  await db.close();
  vi.unstubAllGlobals();
});

it('QA-PROGRAM exposes only published timeline and excludes DEMO offers', async () => {
  const response = await request('/program');
  expect(response.status).toBe(200);
  const result = (await data(response)) as {
    timeline: { title: string }[];
    offers: unknown[];
    edition: { id: string };
  };
  expect(result.edition.id).toBe(edition);
  expect(result.timeline.map((t) => t.title)).toEqual(['QA timeline published']);
  expect(result.offers).toEqual([]);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('QA-PROGRAM hides an unpublished edition, timeline and awards together', async () => {
  await db.query('update public.contest_editions set published=false where id=$1', [edition]);
  expect(await data(await request('/program'))).toMatchObject({
    edition: null,
    timeline: [],
    offers: [],
    registration_state: 'UNCONFIGURED',
  });
  expect(await data(await request('/awards'))).toEqual([]);
});
it('QA-PUBLISH draft is private, explicit publish exposes photo, eligibility revocation hides it', async () => {
  const saved = await request('/admin/publications', 'POST', draft, token(admin));
  expect(saved.status).toBe(200);
  expect(await data(await request('/rounds/' + round + '/contestants'))).toEqual([]);
  const path = draft.photo_url;
  objects.set('public-program/' + fixture(81) + '.webp', new ArrayBuffer(8));
  expect((await request(path.replace('/api', ''))).status).toBe(401);
  expect(
    (await request(path.replace('/api', ''), 'GET', undefined, token(other, 'aal2'))).status,
  ).toBe(200);
  expect(
    (
      await request(
        '/admin/publications',
        'POST',
        { ...draft, published: true },
        token(other, 'aal2'),
      )
    ).status,
  ).toBe(200);
  const visible = (await data(await request('/rounds/' + round + '/contestants'))) as Record<
    string,
    unknown
  >[];
  expect(visible).toHaveLength(1);
  expect(visible[0]).toMatchObject({ id: person, photo_url: path });
  expect(visible[0]).not.toHaveProperty('user_id');
  expect((await request(path.replace('/api', ''))).status).toBe(200);
  await db.query(
    'update public.round_entries set eligible=false where round_id=$1 and contestant_id=$2',
    [round, person],
  );
  expect(await data(await request('/rounds/' + round + '/contestants'))).toEqual([]);
  expect((await request(path.replace('/api', ''))).status).toBe(401);
});
it('QA-AWARDS publishes manual award without inferring winner and hides withdrawn contestant', async () => {
  expect(
    (
      await request(
        '/admin/publications',
        'POST',
        { ...draft, round_id: null, award_name: 'QA Hoa khôi', published: true },
        token(admin),
      )
    ).status,
  ).toBe(200);
  const awards = (await data(await request('/awards'))) as Record<string, unknown>[];
  expect(awards).toHaveLength(1);
  expect(awards[0]).toMatchObject({ award_name: 'QA Hoa khôi', contestant_id: person });
  await db.query('update public.contestants set published=false where id=$1', [person]);
  expect(await data(await request('/awards'))).toEqual([]);
});
it('QA-PERMISSIONS denies guests, ordinary users and editors without MFA before mutations', async () => {
  expect((await request('/admin/publications')).status).toBe(401);
  expect((await request('/admin/publications', 'POST', draft, token(owner))).status).toBe(403);
  expect((await request('/admin/publications', 'POST', draft, token(other))).status).toBe(403);
  expect((await db.query('select id from public.program_publications')).rows).toHaveLength(0);
});
it('QA-UPLOAD rejects absent online storage and invalid files; successful sanitized image stays draft', async () => {
  const oldImages = env.IMAGES;
  try {
    env.IMAGES = undefined;
    expect((await request('/admin/public-images', 'POST', {}, token(admin))).status).toBe(503);
  } finally {
    env.IMAGES = oldImages;
  }
  expect(
    (await request('/admin/public-images', 'POST', { forged: true }, token(admin))).status,
  ).toBe(400);
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#aa0000' } })
    .png()
    .toBuffer();
  const uploaded = await app.request(
    'http://localhost/api/admin/public-images',
    {
      method: 'POST',
      headers: {
        Origin: env.ALLOWED_ORIGIN,
        Authorization: token(admin),
        'Content-Type': 'image/png',
      },
      body: new Uint8Array(image).buffer,
    },
    env,
  );
  expect(uploaded.status).toBe(200);
  const result = (await data(uploaded)) as { photo_url: string };
  expect(objects.size).toBe(1);
  const stored = [...objects.values()][0];
  expect((await sharp(Buffer.from(stored)).metadata()).format).toBe('webp');
  expect((await request(result.photo_url.replace('/api', ''))).status).toBe(401);
});
it('QA-BOUNDARY enforces origin, throttle and strict publication input', async () => {
  expect(
    (
      await request('/admin/publications', 'POST', draft, token(admin), {
        Origin: 'https://evil.example.test',
      })
    ).status,
  ).toBe(403);
  expect(
    (await request('/admin/publications', 'POST', { ...draft, unexpected: 'admin' }, token(admin)))
      .status,
  ).toBe(400);
  const limiter = env.RATE_LIMITER;
  try {
    env.RATE_LIMITER = { limit: async () => ({ success: false }) } as unknown as typeof limiter;
    expect((await request('/admin/publications', 'POST', draft, token(admin))).status).toBe(429);
  } finally {
    env.RATE_LIMITER = limiter;
  }
});
