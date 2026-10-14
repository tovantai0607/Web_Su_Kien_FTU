import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

if (!process.argv.includes('--run-approved-demo'))
  throw new Error('Chỉ chạy sau khi người dùng duyệt ghi dữ liệu DEMO vào Supabase.');
const env = Object.fromEntries(
  (await readFile('apps/api/.dev.vars.demo-test', 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
assert.equal(env.SUPABASE_URL, 'https://ifgtyslifgegwcguysbb.supabase.co');
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicAuth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await mkdir('output/demo-test', { recursive: true });
let account;
try {
  account = JSON.parse(await readFile('output/demo-test/account.secret', 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  account = {
    email: `ftu-ticket-demo-${randomUUID()}@example.test`,
    password: randomBytes(30).toString('base64url') + 'aA1!',
    project: 'ifgtyslifgegwcguysbb',
  };
  const { data, error } = await db.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    app_metadata: { fixture: 'ticket-demo-20261014' },
  });
  if (error) throw new Error('Không tạo được tài khoản DEMO: ' + (error.code ?? 'AUTH_ERROR'));
  account.id = data.user.id;
  await writeFile('output/demo-test/account.secret', JSON.stringify(account), {
    flag: 'wx',
    mode: 0o600,
  });
}
assert.equal(account.project, 'ifgtyslifgegwcguysbb');
const { data: auth, error: authError } = await publicAuth.auth.signInWithPassword({
  email: account.email,
  password: account.password,
});
if (authError || !auth.session) throw new Error('Không đăng nhập được tài khoản DEMO.');
const origin = 'http://127.0.0.1:8787';
const api = async (path, options = {}) => {
  const res = await fetch(origin + '/api' + path, {
    ...options,
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      Authorization: 'Bearer ' + auth.session.access_token,
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      `Bước ${path.replace(/[a-f0-9-]{36}/g, '<id>')} trả ${res.status}: ${body.error ?? 'API_ERROR'}`,
    );
  return body.data;
};
const catalog = await api('/purchase-catalog');
assert.equal(catalog.offers.length, 1);
const offer = catalog.offers[0];
assert.equal(offer.slug, 'test-giao-dich-demo');
assert.equal(offer.mode, 'DEMO');
const product = offer.products.find((p) => p.name === 'The Intro' && p.tier === 'EARLY');
assert.equal(product.price_vnd, 100000);
assert.equal(product.combo2_vnd, 200000);
let record;
try {
  record = JSON.parse(await readFile('output/demo-test/http-order.json', 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  record = { key: randomUUID(), offer_id: offer.id, product_id: product.id };
  await writeFile('output/demo-test/http-order.json', JSON.stringify(record), { flag: 'wx' });
}
const selection = {
  offer_id: record.offer_id,
  buyer: {
    name: 'DEMO TEST',
    school: 'DEMO',
    cohort_class: 'DEMO',
    student_id: 'DEMO',
    email: account.email,
    phone: '0000000000',
    facebook: 'DEMO',
  },
  lines: [{ product_id: record.product_id, bundle_size: 2, quantity: 1 }],
};
const held = await api('/purchases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': record.key },
  body: JSON.stringify(selection),
});
assert.equal(held.quantity, 2);
assert.equal(held.total_vnd, 200000);
assert.equal(held.payment.mode, 'DEMO');
assert.equal(Date.parse(held.expires_at) - Date.parse(held.created_at), 30 * 60 * 1000);
let evidence = held.evidence_id;
const image = await sharp({
  create: { width: 240, height: 160, channels: 3, background: '#1565c0' },
})
  .png()
  .toBuffer();
await writeFile('output/demo-test/proof-demo.png', image);
if (!evidence) {
  const result = await api(`/purchases/${held.id}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: image,
  });
  evidence = result.id;
}
const completed = await api(`/purchases/${held.id}/complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ evidence_id: evidence }),
});
assert.equal(completed.status, 'COMPLETED');
const retried = await api(`/purchases/${held.id}/complete`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ evidence_id: evidence }),
});
assert.equal(retried.id, completed.id);
const { data: row, error: readError } = await db
  .from('purchase_requests')
  .select('status,quantity,total_vnd,payment')
  .eq('id', completed.id)
  .single();
if (readError) throw new Error('Không đọc được đơn đã lưu.');
assert.equal(row.status, 'COMPLETED');
assert.equal(row.quantity, 2);
assert.equal(row.total_vnd, 200000);
const { count: ticketCount, error: ticketError } = await db
  .from('tickets')
  .select('id', { count: 'exact', head: true })
  .eq('purchase_id', held.id);
if (ticketError) throw new Error('Không đếm được vé DEMO.');
assert.equal(ticketCount, 2);
const proof = await fetch(origin + '/api/purchase-evidence/' + evidence, {
  headers: { Authorization: 'Bearer ' + auth.session.access_token },
});
assert.equal(proof.status, 200);
assert.match(proof.headers.get('Content-Type'), /image\/webp/);
assert.ok((await proof.arrayBuffer()).byteLength > 0);
const unauth = await fetch(origin + '/api/purchase-evidence/' + evidence);
assert.equal(unauth.status, 401);
const forbidden = await fetch(origin + '/api/admin/purchase-offers', {
  method: 'POST',
  headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json' },
  body: '{}',
});
assert.equal(forbidden.status, 403);
const report = {
  checked_at: new Date().toISOString(),
  project: account.project,
  mode: 'DEMO',
  request_id: held.id,
  code: held.code,
  evidence_id: evidence,
  status: row.status,
  quantity: row.quantity,
  total_vnd: row.total_vnd,
  tickets: ticketCount,
  hold_minutes: 30,
  retry_duplicates: false,
  image_storage: 'R2 local',
  image_private: true,
  non_demo_writes_blocked: true,
};
await writeFile('output/demo-test/http-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
