// Complete browser -> Hono -> PostgreSQL engine in memory. No remote services.
import { it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer as httpServer } from 'node:http';
import { createServer as viteServer } from 'vite';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { HTTPException } from 'hono/http-exception';
import {
  databaseAdapter,
  localEnvironment,
  testAuthenticate,
  testAuthorize,
  token,
  owner,
  admin,
  fixture,
  type Query,
} from '../helpers/purchase-runtime';
import { app } from '../../apps/api/src/index';
let query: Query;
vi.mock('../../apps/api/src/security', async (original) => ({
  ...(await original<typeof import('../../apps/api/src/security')>()),
  authenticate: testAuthenticate,
  authorize: (...args: Parameters<typeof import('../../apps/api/src/security').authorize>) =>
    testAuthorize(query, ...args),
  service: () => databaseAdapter(query),
  readClient: () => databaseAdapter(query),
  verifyTurnstile: async (value: string) => {
    if (value !== 'LOCAL-TEST-VOTE') throw new HTTPException(400);
  },
}));
it('QA-JOURNEY desktop/mobile checkout, image correction, retry, vote and admin proof; fixtures destroyed', async () => {
  const db = new PGlite();
  query = (sql, params) => db.query(sql, params);
  const { env, objects } = localEnvironment('http://127.0.0.1:5174');
  env.DEMO_TEST_OFFER_SLUG = 'ban-ket-local';
  let ui: Awaited<ReturnType<typeof viteServer>> | undefined;
  let server: ReturnType<typeof httpServer> | undefined;
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
    await db.exec(await readFile('tests/fixtures/purchases.sql', 'utf8'));
    // The end-to-end DEMO buyer is an admin; ordinary-account denial is covered by HTTP tests.
    await db.query('insert into public.user_roles(user_id,role) values($1,$2)', [
      owner,
      'SUPER_ADMIN',
    ]);
    await db.query('select public.prepare_gender_voting($1,$2,$3)', [admin, 'aal2', fixture(20)]);
    await db.query('select public.open_gender_voting($1,$2,$3)', [admin, 'aal2', fixture(20)]);
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
    const png = new Uint8Array(
      process.env.FTU_DEMO_DIR
        ? await readFile(process.env.FTU_DEMO_DIR + '/valid.png')
        : await sharp({ create: { width: 80, height: 80, channels: 3, background: '#ffffff' } })
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
      cacheDir: 'output/qa-vite-cache',
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
              `const qaAdmin=location.search.includes('qa-admin'); export const supabase = { auth: { getSession: async () => ({data: {session: {access_token: qaAdmin ? '${token(admin, 'aal2').replace('Bearer ', '')}' : '${token(owner, 'aal2').replace('Bearer ', '')}', user: {id: qaAdmin ? '${admin}' : '${owner}'}}}}), onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) } };\n// Preview`,
            );
          },
        },
      ],
    });
    await ui.listen();
    const browser = await chromium.launch({ headless: true });
    try {
      const blocked: string[] = [];
      const context = await browser.newContext();
      await context.route('**/*', (route) => {
        if (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname))
          return route.continue();
        blocked.push(route.request().url());
        return route.abort();
      });
      for (const width of [1280, 390]) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('http://127.0.0.1:5174/ve/ban-ket-local');
        await page.getByLabel('Số lượng vé đơn The Intro EARLY').fill('2');
        await page.getByRole('button', { name: 'Xác nhận vé & combo', exact: true }).click();
        for (const [label, value] of Object.entries(
          process.env.FTU_DEMO_DIR
            ? (JSON.parse(
                await readFile(process.env.FTU_DEMO_DIR + '/buyer.json', 'utf8'),
              ) as Record<string, string>)
            : {
                'Họ tên': 'DEMO ONLY',
                Trường: 'DEMO',
                'Khóa/lớp': 'DEMO',
                MSSV: 'DEMO',
                Email: 'demo@example.test',
                'Số điện thoại': '0000000000',
                Facebook: 'DEMO',
              },
        ))
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
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
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
      const adminPage = await context.newPage();
      await adminPage.emulateMedia({ reducedMotion: 'reduce' });
      await adminPage.goto('http://127.0.0.1:5174/admin?qa-admin');
      await adminPage.getByRole('button', { name: 'Bán vé theo bổ sung', exact: true }).click();
      await expect.poll(() => adminPage.getByRole('columnheader').count()).toBe(6);
      await expect.poll(() => adminPage.getByText(/2 đơn Hoàn tất/).count()).toBe(1);
      await adminPage.getByRole('button', { name: 'Xem minh chứng', exact: true }).first().click();
      await expect
        .poll(() => adminPage.getByAltText('Minh chứng chuyển khoản của đơn vé').count())
        .toBe(1);
      if (process.env.FTU_QA_DIR)
        await adminPage.screenshot({
          path: process.env.FTU_QA_DIR + '/admin-purchases.png',
          fullPage: true,
        });
      await adminPage.close();
      expect(blocked).toEqual([]);
      await context.close();
    } finally {
      await browser.close();
    }

    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.purchase_requests where status='COMPLETED'",
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (await db.query<{ n: number }>('select count(*)::int n from public.votes')).rows[0].n,
    ).toBe(2);
  } finally {
    await ui?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    objects.clear();
    await db.close();
    expect(objects.size).toBe(0);
    expect(db.closed).toBe(true);
    if (process.env.FTU_QA_DIR)
      await writeFile(
        process.env.FTU_QA_DIR + '/cleanup-browser.json',
        JSON.stringify({
          database_closed: db.closed,
          media_objects_remaining: objects.size,
          remote_writes: 0,
        }),
      );
  }
}, 120000);
