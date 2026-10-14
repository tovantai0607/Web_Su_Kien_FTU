import { it, expect, vi } from 'vitest';
import pg from 'pg';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as viteServer } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { HTTPException } from 'hono/http-exception';
import {
  databaseAdapter,
  localEnvironment,
  testAuthenticate,
  testAuthorize,
  token,
  selection,
  owner,
  admin,
  productId,
  fixture,
  type Query,
} from '../helpers/purchase-runtime';
import { app } from '../../apps/api/src/index';
import type { Purchase, Ticket } from '@ftu/shared';

let query: Query;
vi.mock('../../apps/api/src/security', async (original) => {
  const source = await original<typeof import('../../apps/api/src/security')>();
  return {
    ...source,
    authenticate: testAuthenticate,
    authorize: (...args: Parameters<typeof source.authorize>) => testAuthorize(query, ...args),
    service: () => databaseAdapter(query),
    readClient: () => databaseAdapter(query),
    verifyTurnstile: async (value: string) => {
      if (value !== 'LOCAL-TEST-VOTE')
        throw new HTTPException(400, { message: 'Test captcha invalid' });
    },
  };
});
it.skipIf(!process.env.FTU_TEST_DATABASE_URL)(
  'native concurrent purchase, browser checkout, and optional approved local workload',
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
    const database = 'ftu_supplement_' + Date.now();
    await control.query(`create database ${database}`);
    url.pathname = '/' + database;
    const setup = new pg.Client({ connectionString: url.href });
    await setup.connect();
    let pool: pg.Pool | undefined,
      server: ReturnType<typeof httpServer> | undefined,
      ui: Awaited<ReturnType<typeof viteServer>> | undefined;
    const { env, objects } = localEnvironment('http://127.0.0.1:5174');
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
      pool = new pg.Pool({ connectionString: url.href, max: 20, options: '-c role=service_role' });
      query = (sql, params) => pool!.query(sql, params);
      await setup.query('update public.purchase_products set quota=1 where id=$1', [productId]);
      const races = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          query('select public.reserve_purchase($1,$2,$3,$4) data', [
            owner,
            selection(),
            crypto.randomUUID(),
            'a'.repeat(64),
          ]),
        ),
      );
      expect(races.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const first = (
        races.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
          rows: { data: Purchase }[];
        }>
      ).value.rows[0].data;
      const evidenceId = crypto.randomUUID();
      await query('select public.attach_purchase_evidence($1,$2,$3,$4,$5)', [
        owner,
        first.id,
        evidenceId,
        `private/purchases/${owner}/${first.id}/${evidenceId}.webp`,
        100,
      ]);
      await Promise.all(
        Array.from({ length: 20 }, () =>
          query('select public.complete_purchase($1,$2,$3)', [owner, first.id, evidenceId]),
        ),
      );
      expect(
        Number(
          (await query('select count(*) n from public.tickets where purchase_id=$1', [first.id]))
            .rows[0].n,
        ),
      ).toBe(1);
      console.log(
        'PASS 20 concurrent connections: one last-quota winner; 20 completion retries issue one ticket.',
      );
      // Fixture expires while completion is blocked on the product lock. No clock/guard bypass.
      const expiringId = crypto.randomUUID(),
        expiringProof = crypto.randomUUID();
      await setup.query('update public.purchase_products set quota=2 where id=$1', [productId]);
      await setup.query(
        `with t as (select clock_timestamp()-interval '30 minutes'+interval '750 milliseconds' created)
      insert into public.purchase_requests(id,code,user_id,offer_id,edition_id,round_id,key,request_hash,buyer,lines,quantity,total_vnd,payment,created_at,expires_at)
      select $1::uuid,'EXPIRE-'||$1::text,user_id,offer_id,edition_id,round_id,$2,request_hash,buyer,lines,quantity,total_vnd,payment,t.created,t.created+interval '30 minutes' from public.purchase_requests cross join t where id=$3`,
        [expiringId, crypto.randomUUID(), first.id],
      );
      await setup.query(
        'insert into public.purchase_allocations select $1,product_id,quantity from public.purchase_allocations where request_id=$2',
        [expiringId, first.id],
      );
      await query('select public.attach_purchase_evidence($1,$2,$3,$4,$5)', [
        owner,
        expiringId,
        expiringProof,
        `private/purchases/${owner}/${expiringId}/${expiringProof}.webp`,
        100,
      ]);
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query('select id from public.purchase_products where id=$1 for update', [
          productId,
        ]);
        const late = query('select public.complete_purchase($1,$2,$3)', [
          owner,
          expiringId,
          expiringProof,
        ]).then(
          () => 'unexpected success',
          (e: Error) => e.message,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await blocker.query('commit');
        expect(await late).toContain('PURCHASE_EXPIRED');
        expect(
          Number(
            (
              await query('select count(*) n from public.tickets where purchase_id=$1', [
                expiringId,
              ])
            ).rows[0].n,
          ),
        ).toBe(0);
      } finally {
        blocker.release();
      }
      await setup.query('update public.purchase_products set quota=100000 where id=$1', [
        productId,
      ]);
      await setup.query('select public.prepare_gender_voting($1,$2,$3)', [
        admin,
        'aal2',
        fixture(20),
      ]);
      const sessionId = (
        await setup.query('select public.open_gender_voting($1,$2,$3) data', [
          admin,
          'aal2',
          fixture(20),
        ])
      ).rows[0].data.id as string;
      const categoryId = (
        await setup.query(
          "select id from public.vote_categories where round_id=$1 and gender='male'",
          [fixture(20)],
        )
      ).rows[0].id as string;
      const candidateId = fixture(60);
      const ticketId = (
        await query('select id from public.tickets where purchase_id=$1', [first.id])
      ).rows[0].id;
      const ballots = await Promise.all(
        Array.from({ length: 20 }, () =>
          query('select public.cast_category_vote($1,$2,$3,$4,$5,$6) data', [
            owner,
            fixture(20),
            ticketId,
            candidateId,
            categoryId,
            sessionId,
          ]),
        ),
      );
      expect(new Set(ballots.map((r) => (r.rows[0].data as { id: string }).id)).size).toBe(1);
      const http = httpServer(async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const body = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers))
            if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
          const response = await app.request(
            new Request('http://127.0.0.1:8788' + req.url, {
              method: req.method,
              headers,
              body: body.length ? body : undefined,
            }),
            undefined,
            env,
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.writeHead(500);
          res.end('Local test transport failed');
        }
      });
      server = http;
      await new Promise<void>((resolve) => http.listen(8788, '127.0.0.1', resolve));
      const call = async <T>(path: string, body?: unknown, user = owner) => {
        const started = performance.now();
        const response = await fetch('http://127.0.0.1:8788/api' + path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            Origin: env.ALLOWED_ORIGIN,
            Authorization: token(user),
            'Content-Type': body instanceof Uint8Array ? 'image/png' : 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body:
            body === undefined
              ? undefined
              : body instanceof Uint8Array
                ? new Uint8Array(body).buffer
                : JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        const result = (await response.json()) as { data: T; error?: string };
        if (!response.ok) throw new Error(response.status + ': ' + result.error);
        return { data: result.data, ms: performance.now() - started };
      };
      const png = new Uint8Array(
        await sharp({ create: { width: 80, height: 80, channels: 3, background: '#ffffff' } })
          .png()
          .toBuffer(),
      );
      const correctedPng = await sharp({
        create: { width: 80, height: 80, channels: 3, background: '#1250cf' },
      })
        .png()
        .toBuffer();
      // Fake Auth is injected only by this local Vite test plugin. Production source is untouched.
      ui = await viteServer({
        configFile: 'apps/web/vite.config.ts',
        define: { 'import.meta.env.VITE_PREVIEW_MODE': 'false' },
        server: {
          host: '127.0.0.1',
          port: 5174,
          strictPort: true,
          proxy: { '/api': 'http://127.0.0.1:8788' },
        },
        plugins: [
          {
            name: 'local-test-auth',
            enforce: 'pre',
            transform(code, file) {
              if (file.endsWith('/apps/web/src/components/Turnstile.tsx'))
                return `import {useEffect} from 'react'; export function Turnstile({onToken}) {useEffect(()=>onToken('LOCAL-TEST-VOTE'),[onToken]); return <p>Captcha DEMO local</p>;}`;
              if (!file.endsWith('/apps/web/src/lib/api.ts')) return;
              return code.replace(
                /export const supabase =[\s\S]*?\/\/ Preview/,
                `const qaAdmin=location.search.includes('qa-admin'); export const supabase = { auth: { getSession: async () => ({data: {session: {access_token: qaAdmin ? '${token(admin, 'aal2').replace('Bearer ', '')}' : '${token().replace('Bearer ', '')}', user: {id: qaAdmin ? '${admin}' : '${owner}'}}}}), onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) } };\n// Preview`,
              );
            },
          },
        ],
      });
      await ui.listen();
      const browser = await chromium.launch({ headless: true });
      try {
        for (const width of [1280, 390]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.goto('http://127.0.0.1:5174/ve/ban-ket-local');
          await page.getByLabel('Số lượng vé đơn The Intro EARLY').fill('2');
          await page.getByRole('button', { name: 'Xác nhận vé & combo', exact: true }).click();
          for (const [label, value] of Object.entries({
            'Họ tên': 'DEMO ONLY',
            Trường: 'DEMO',
            'Khóa/lớp': 'DEMO',
            MSSV: 'DEMO',
            Email: 'demo@example.test',
            'Số điện thoại': '0000000000',
            Facebook: 'DEMO',
          }))
            await page.getByLabel(label, { exact: true }).fill(value);
          await page.getByRole('button', { name: 'Xác nhận thông tin', exact: true }).click();
          await expect
            .poll(() => page.getByRole('heading', { name: 'Thanh toán chuyển khoản' }).count())
            .toBe(1);
          await page.getByRole('button', { name: 'Tiếp tục gửi minh chứng', exact: true }).click();
          await page
            .getByLabel('Ảnh minh chứng JPG/PNG (tối đa 5 MB)')
            .setInputFiles({ name: 'demo.png', mimeType: 'image/png', buffer: Buffer.from(png) });
          const chooserReady = page.waitForEvent('filechooser');
          await page.getByRole('button', { name: 'Đổi ảnh minh chứng', exact: true }).click();
          await (
            await chooserReady
          ).setFiles({ name: 'demo-dung.png', mimeType: 'image/png', buffer: correctedPng });
          await expect
            .poll(() => page.getByText('Ảnh đã chọn: demo-dung.png', { exact: true }).count())
            .toBe(1);
          if (width === 1280) {
            const before = Number((await query('select count(*) n from public.tickets')).rows[0].n);
            await page.route(
              '**/api/purchases/*/complete',
              (route) =>
                route.fulfill({
                  status: 503,
                  contentType: 'application/json',
                  body: JSON.stringify({ error: 'DEMO lỗi lưu; thử lại.' }),
                }),
              { times: 1 },
            );
            await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
            await expect
              .poll(() => page.getByText('DEMO lỗi lưu; thử lại.', { exact: true }).count())
              .toBeGreaterThan(0);
            expect(Number((await query('select count(*) n from public.tickets')).rows[0].n)).toBe(
              before,
            );
          }
          await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
          await expect
            .poll(() => page.getByRole('heading', { name: 'Đã lưu đơn thành công' }).count())
            .toBe(1);
          const requestId = new URL(page.url()).searchParams.get('don');
          const proofKey = (
            await query('select object_key from public.purchase_evidence where request_id=$1', [
              requestId,
            ])
          ).rows[0].object_key as string;
          const stored = objects.get(proofKey);
          expect(stored).toBeDefined();
          const pixels = await sharp(Buffer.from(stored!)).raw().toBuffer();
          expect(pixels[2]).toBeGreaterThan(150);
          expect(pixels[0]).toBeLessThan(60);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.evaluate(() => window.scrollTo(0, 0));
          if (process.env.FTU_QA_DIR)
            await page.screenshot({
              path: process.env.FTU_QA_DIR + `/checkout-${width}.png`,
              fullPage: true,
            });
          await page.getByRole('link', { name: 'Đến bình chọn', exact: true }).click();
          await page.getByLabel('Vé đủ điều kiện của vòng này').selectOption({ index: 1 });
          await page.getByRole('button', { name: 'Chọn thí sinh', exact: true }).click();
          await page.getByRole('button', { name: 'Xác nhận bình chọn', exact: true }).click();
          await expect
            .poll(() => page.getByText('Phiếu của bạn đã được ghi nhận.', { exact: true }).count())
            .toBe(1);
          await page.close();
        }
        const adminPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await adminPage.emulateMedia({ reducedMotion: 'reduce' });
        await adminPage.goto('http://127.0.0.1:5174/admin?qa-admin');
        await adminPage.getByRole('button', { name: 'Bán vé theo bổ sung', exact: true }).click();
        await expect.poll(() => adminPage.getByRole('columnheader').count()).toBe(6);
        await expect.poll(() => adminPage.getByText(/3 đơn Hoàn tất/).count()).toBe(1);
        await adminPage
          .getByRole('button', { name: 'Xem minh chứng', exact: true })
          .first()
          .click();
        await expect
          .poll(() => adminPage.getByAltText('Minh chứng chuyển khoản của đơn vé').count())
          .toBe(1);
        if (process.env.FTU_QA_DIR)
          await adminPage.screenshot({
            path: process.env.FTU_QA_DIR + '/admin-purchases.png',
            fullPage: true,
          });
        await adminPage.close();
      } finally {
        await browser.close();
      }
      console.log(
        'PASS real local HTTP + PostgreSQL + private image storage: desktop/mobile checkout completed.',
      );
      if (process.env.FTU_RUN_LOCAL_LOAD === 'true') {
        const reports = [];
        // A virtual user waits four seconds between journeys. Counts are users, not 1,000 DB connections.
        for (const concurrency of [500, 1000]) {
          const latencies: number[] = [],
            journeys: Record<string, number> = { read: 0, purchase: 0, vote: 0 };
          let errors = 0,
            requests = 0,
            maxPoolWaiting = 0;
          const duration = 120000;
          const errorSamples: string[] = [];
          const userIds = Array.from(
            { length: concurrency },
            (_, i) => `98020000-0000-4000-8000-${String(concurrency * 1000 + i).padStart(12, '0')}`,
          );
          await setup.query('insert into auth.users select unnest($1::uuid[])', [userIds]);
          const voterTickets = new Map<string, Ticket[]>();
          for (let i = 9; i < concurrency; i += 10) {
            const held = (await call<Purchase>('/purchases', selection(35), userIds[i])).data;
            const proof = (
              await call<{ id: string }>(`/purchases/${held.id}/evidence`, png, userIds[i])
            ).data;
            await call(`/purchases/${held.id}/complete`, { evidence_id: proof.id }, userIds[i]);
            voterTickets.set(
              userIds[i],
              (await call<Ticket[]>('/me/tickets', undefined, userIds[i])).data,
            );
          }
          const measured = async (path: string, body?: unknown, user = owner) => {
            requests++;
            maxPoolWaiting = Math.max(maxPoolWaiting, pool!.waitingCount);
            const started = performance.now();
            try {
              return (await call<Purchase & { id: string }>(path, body, user)).data;
            } finally {
              latencies.push(performance.now() - started);
            }
          };
          const start = performance.now();
          await Promise.all(
            userIds.map(async (user, i) => {
              await new Promise((resolve) => setTimeout(resolve, (i * 10000) / concurrency));
              let turn = 0;
              while (performance.now() - start < duration) {
                try {
                  if (i % 10 < 7) {
                    await measured('/purchase-catalog');
                    journeys.read++;
                  } else if (i % 10 < 9) {
                    const r = await measured('/purchases', selection(), user);
                    const e = await measured(`/purchases/${r.id}/evidence`, png, user);
                    await measured(`/purchases/${r.id}/complete`, { evidence_id: e.id }, user);
                    journeys.purchase++;
                  } else {
                    const tickets = voterTickets.get(user)!;
                    await measured(
                      '/votes',
                      {
                        round_id: fixture(20),
                        ticket_id: tickets[turn % tickets.length].id,
                        contestant_id: candidateId,
                        category_id: categoryId,
                        session_id: sessionId,
                        turnstile_token: 'LOCAL-TEST-VOTE',
                      },
                      user,
                    );
                    journeys.vote++;
                  }
                  turn++;
                } catch (e) {
                  errors++;
                  if (errorSamples.length < 5) errorSamples.push((e as Error).message);
                }
                await new Promise((resolve) => setTimeout(resolve, 4000));
              }
            }),
          );
          latencies.sort((a, b) => a - b);
          const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? Infinity,
            p99 = latencies[Math.floor(latencies.length * 0.99)] ?? Infinity;
          const report = {
            users: concurrency,
            duration_ms: performance.now() - start,
            think_ms: 4000,
            ramp_ms: 10000,
            journeys,
            requests,
            errors,
            errorSamples,
            error_rate: errors / requests,
            p95_ms: p95,
            p99_ms: p99,
            pool_max: 20,
            max_pool_waiting: maxPoolWaiting,
          };
          reports.push(report);
          console.log(JSON.stringify(report));
        }
        const violations = (
          await setup.query(`select
        (select count(*) from public.purchase_products p where p.quota < (select coalesce(sum(a.quantity),0) from public.purchase_allocations a join public.purchase_requests r on r.id=a.request_id where a.product_id=p.id and r.status='COMPLETED')) oversold,
        (select count(*) from (select ticket_code from public.tickets where ticket_code is not null group by ticket_code having count(*)>1) x) duplicate_codes,
        (select count(*) from (select ticket_id,category_id from public.votes group by ticket_id,category_id having count(*)>1) x) duplicate_votes,
        (select count(*) from public.purchase_requests r where r.status='COMPLETED' and r.quantity<>(select count(*) from public.tickets t where t.purchase_id=r.id)) mismatched_tickets`)
        ).rows[0];
        const result = {
          environment:
            'loopback-only PostgreSQL 16 + Hono; mocked test Auth/captcha; local sharp/R2 adapter; no online requests',
          database,
          reports,
          violations,
          objects: objects.size,
        };
        if (process.env.FTU_QA_DIR)
          await writeFile(
            process.env.FTU_QA_DIR + '/local-load.json',
            JSON.stringify(result, null, 2),
          );
        expect(Object.values(violations).every((v) => Number(v) === 0)).toBe(true);
        for (const r of reports) {
          expect(r.p95_ms).toBeLessThan(2000);
          expect(r.error_rate).toBeLessThan(0.01);
        }
      }
    } finally {
      await ui?.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      await pool?.end();
      await setup.end();
      await control.end();
    }
  },
  900000,
);
