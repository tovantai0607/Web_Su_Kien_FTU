// Opt-in isolated local PostgreSQL test. Refuses remote, standard ports and other users.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const connection = new URL(process.env.FTU_TEST_DATABASE_URL ?? 'http://missing');
assert.equal(
  connection.hostname,
  '127.0.0.1',
  'Only the explicitly provisioned loopback test server',
);
assert.equal(connection.port, '55433');
assert.equal(connection.username, 'codex_test');
assert.equal(connection.pathname, '/postgres');
const admin = new pg.Client({ connectionString: connection.href });
await admin.connect();
const database = `ftu_stage03_${Date.now()}`;
await admin.query(`create database ${database}`);
connection.pathname = '/' + database;
const setup = new pg.Client({ connectionString: connection.href });
await setup.connect();
const fixtureId = (n) => `99010000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = fixtureId(1),
  other = fixtureId(2),
  event = fixtureId(40),
  seats = [60, 61, 62, 63].map(fixtureId);
let pool;
let server;
let browser;
const leased = new Set();
try {
  for (const role of ['anon', 'authenticated', 'service_role'])
    await admin.query(
      `do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}${role === 'service_role' ? ' bypassrls' : ''};end if;end$$;`,
    );
  await setup.query(
    "create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  );
  for (const file of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort())
    await setup.query(await readFile('supabase/migrations/' + file, 'utf8'));
  await setup.query(await readFile('tests/fixtures/sales-inventory.sql', 'utf8'));
  pool = new pg.Pool({ connectionString: connection.href, max: 20 });
  const clients = await Promise.all(Array.from({ length: 20 }, () => pool.connect()));
  for (const client of clients) leased.add(client);
  for (const client of clients) await client.query('set role service_role');
  const pids = await Promise.all(
    clients.map((client) => client.query('select pg_backend_pid() pid')),
  );
  assert.equal(new Set(pids.map((r) => r.rows[0].pid)).size, 20);
  const reserve = async (client, selected, user = owner, key = crypto.randomUUID()) =>
    (
      await client.query('select public.reserve_sales_seats($1,$2,$3,$4,$5) data', [
        user,
        event,
        selected,
        key,
        'a'.repeat(64),
      ])
    ).rows[0].data;
  const release = async (id, user = owner) =>
    (await setup.query('select public.release_sales_hold($1,$2) data', [user, id])).rows[0].data;
  const stock = async () =>
    (await setup.query('select public.sales_catalog(null,$1,null) data', [event])).rows[0].data
      .events[0];
  const checkRace = (results) => {
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    for (const result of results.filter((r) => r.status === 'rejected'))
      assert.match(result.reason.message, /SEAT_UNAVAILABLE/);
  };
  const first = await reserve(clients[0], [seats[1], seats[2]]);
  assert.equal((await stock()).available, 1);
  const last = await Promise.allSettled(
    clients.map((client) => reserve(client, [seats[3]], other)),
  );
  checkRace(last);
  assert.equal((await stock()).available, 0);
  await release(first.id);
  await release(last.find((r) => r.status === 'fulfilled').value.id, other);
  console.log(
    'PASS 20 distinct PostgreSQL connections contend for the last seat: one winner, no oversell.',
  );
  const key = crypto.randomUUID();
  const retries = await Promise.all(
    clients.map((client) => reserve(client, [seats[1]], owner, key)),
  );
  assert.equal(new Set(retries.map((r) => r.id)).size, 1);
  assert.equal(new Set(retries.map((r) => r.expires_at)).size, 1);
  await release(retries[0].id);
  console.log('PASS 20 simultaneous same-key retries: one order and unchanged expiry.');
  const reversed = await Promise.allSettled([
    reserve(clients[0], [seats[1], seats[2]]),
    reserve(clients[1], [seats[2], seats[1]], other),
  ]);
  checkRace(reversed);
  const winner = reversed.find((r) => r.status === 'fulfilled').value;
  await release(winner.id, reversed[0].status === 'fulfilled' ? owner : other);
  console.log('PASS reversed multi-seat requests: deterministic locking, no deadlock.');
  await setup.query('update public.events set hold_ttl_seconds=1 where id=$1', [event]);
  const expiring = await reserve(clients[0], [seats[2]]);
  await new Promise((r) => setTimeout(r, 1150));
  const replacement = await Promise.allSettled(
    clients.map((client) => reserve(client, [seats[2]], other)),
  );
  checkRace(replacement);
  assert.equal(
    (await setup.query('select status from public.orders where id=$1', [expiring.id])).rows[0]
      .status,
    'EXPIRED',
  );
  const next = replacement.find((r) => r.status === 'fulfilled').value;
  await new Promise((r) => setTimeout(r, 1150));
  const finishes = await Promise.all(
    clients.map((client, i) =>
      i % 2
        ? client.query('select public.expire_sales_holds()')
        : client.query('select public.release_sales_hold($1,$2)', [other, next.id]),
    ),
  );
  assert.equal(finishes.length, 20);
  assert.equal((await stock()).available, 3);
  console.log(
    'PASS expiry/reacquire and concurrent cancel/expiry: stock restored once, no resurrected hold.',
  );
  for (const client of clients) {
    client.release();
    leased.delete(client);
  }
  const lock = await pool.connect();
  leased.add(lock);
  await lock.query('begin');
  await lock.query('select id from public.event_seats where id=$1 for update', [seats[1]]);
  await setup.query(
    "update public.events set sale_close_at=clock_timestamp()+interval '600 milliseconds' where id=$1",
    [event],
  );
  const waitingClient = await pool.connect();
  leased.add(waitingClient);
  const waiting = reserve(waitingClient, [seats[1]]).then(
    () => ({ ok: true }),
    (error) => ({ error: error.message }),
  );
  await new Promise((r) => setTimeout(r, 750));
  await lock.query('commit');
  lock.release();
  leased.delete(lock);
  assert.match((await waiting).error, /SALE_CLOSED/);
  waitingClient.release();
  leased.delete(waitingClient);
  console.log('PASS request queued on a seat lock cannot reserve after sale closes.');
  await setup.query(
    "update public.events set sale_close_at=clock_timestamp()+interval '1 hour',hold_ttl_seconds=300 where id=$1",
    [event],
  );

  if (process.argv.includes('--browser')) {
    const root = resolve('dist');
    await readFile(resolve(root, 'index.html'));
    let apiFailures = 0;
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, 'http://127.0.0.1');
        if (url.pathname.startsWith('/api/events')) {
          if (apiFailures > 0) {
            apiFailures--;
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: 'Local test simulated network failure' }));
            return;
          }
          const slug = url.pathname.split('/')[3] ?? null;
          const result = await setup.query('select public.sales_catalog(null,null,$1) data', [
            slug,
          ]);
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({ data: result.rows[0].data }));
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          response.writeHead(401, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: 'Test browser has no signed-in user' }));
          return;
        }
        const path = resolve(root, '.' + decodeURIComponent(url.pathname));
        assert.ok(path === root || path.startsWith(root + '/') || path.startsWith(root + '\\'));
        const asset = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/images/');
        const filename = asset ? path : resolve(root, 'index.html');
        const mime =
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.webp': 'image/webp',
          }[extname(filename)] ?? 'application/octet-stream';
        response.setHeader('Content-Type', mime);
        response.end(await readFile(filename));
      } catch {
        response.writeHead(500);
        response.end('Local test failure');
      }
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const failures = [];
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.on('pageerror', (error) => failures.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
    );
    await page.goto(origin + '/ve');
    await page.getByRole('link', { name: 'Xem chi tiết' }).click();
    await page.getByRole('heading', { name: 'TEST SALES EVENT', exact: true, level: 1 }).waitFor();
    await page.getByRole('button', { name: 'Ghế A2, TEST TIER 1, Còn trống', exact: true }).click();
    assert.equal(await page.getByText('1/10 ghế: A2', { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('link', { name: 'Đăng nhập để giữ ghế' }).isVisible(), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    const held = await reserve(setup, [seats[1]], other);
    await page.getByRole('button', { name: 'Cập nhật tình trạng ghế' }).click();
    await page
      .getByRole('button', { name: 'Ghế A2, TEST TIER 1, Đang được giữ, bạn chọn', exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Ghế A2, TEST TIER 1, Đang được giữ, bạn chọn', exact: true })
        .isDisabled(),
      true,
    );
    await page.getByRole('button', { name: 'Xóa lựa chọn', exact: true }).click();
    assert.equal(await page.getByText('Bạn chưa chọn ghế.', { exact: true }).isVisible(), true);
    await release(held.id, other);
    await setup.query(
      "update public.events set sale_open_at=clock_timestamp()+interval '1 hour',sale_close_at=clock_timestamp()+interval '2 hours' where id=$1",
      [event],
    );
    await page.reload();
    await page.getByText('Sắp mở bán', { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Ghế A2, TEST TIER 1, Còn trống', exact: true })
        .isDisabled(),
      true,
    );
    if (process.env.FTU_TEST_SCREENSHOT_DIR)
      await page.screenshot({
        path: resolve(process.env.FTU_TEST_SCREENSHOT_DIR, 'database-backed-tickets-mobile.png'),
        fullPage: true,
      });
    await setup.query(
      "update public.events set sale_open_at=clock_timestamp()-interval '1 hour',sale_close_at=clock_timestamp()+interval '1 hour' where id=$1",
      [event],
    );
    const full = await reserve(setup, [seats[1], seats[2], seats[3]], other);
    await page.reload();
    await page.getByText('Hết ghế có thể đặt', { exact: true }).waitFor();
    assert.equal(await page.locator('.sales-seat:enabled').count(), 0);
    await release(full.id, other);
    await setup.query(
      "update public.events set sale_open_at=clock_timestamp()-interval '2 hours',sale_close_at=clock_timestamp()-interval '1 hour' where id=$1",
      [event],
    );
    await page.reload();
    await page.getByText('Đã đóng bán', { exact: true }).waitFor();
    assert.equal(await page.locator('.sales-seat:enabled').count(), 0);
    apiFailures = 2;
    await page.reload();
    await page.getByRole('button', { name: 'Thử lại', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByText('Đã đóng bán', { exact: true }).waitFor();
    assert.deepEqual(failures, []);
    console.log(
      'PASS live-build mobile UI reads real test database: details before opening, seat selection, changed availability, no overflow/errors.',
    );
  }
  console.log(
    JSON.stringify({
      database,
      postgres: (await setup.query('show server_version')).rows[0].server_version,
      concurrency: 20,
      browser: process.argv.includes('--browser'),
      status: 'passed',
    }),
  );
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  for (const client of leased) client.release();
  if (pool) await pool.end();
  await setup.end();
  await admin.end();
}
