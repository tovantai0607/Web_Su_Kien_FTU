import { readFile, writeFile, access } from 'node:fs/promises';

// Read user-provided credentials without printing or embedding them in tracked files.
const raw = await readFile(new URL('../skill/database.md', import.meta.url), 'utf8');
const values = Object.fromEntries(
  ['SUPABASE_URL', 'SUPABASE_JWKS_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'].map(
    (key) => {
      const value = raw.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*([^\\r\\n]+)`))?.[1]?.trim();
      if (!value) throw new Error(`Thiếu cấu hình ${key}; không ghi file.`);
      return [key, value];
    },
  ),
);
if (values.SUPABASE_URL !== 'https://ifgtyslifgegwcguysbb.supabase.co')
  throw new Error('Project không đúng môi trường DEMO đã được duyệt.');
const origin = process.env.FTU_DEMO_ORIGIN ?? 'http://127.0.0.1:5173';
if (!['http://127.0.0.1:5173', 'http://127.0.0.1:8787'].includes(origin))
  throw new Error('Origin DEMO phải là loopback5173 hoặc8787.');

async function createOnce(path, content) {
  try {
    await access(path);
    if ((await readFile(path, 'utf8')) !== content)
      throw new Error(`File ${path} đã có cấu hình khác; không ghi đè.`);
    return;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await writeFile(path, content, { flag: 'wx', mode: 0o600 });
}
await createOnce(
  '.env.local',
  [
    `VITE_SUPABASE_URL=${values.SUPABASE_URL}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${values.SUPABASE_PUBLISHABLE_KEY}`,
    'VITE_PREVIEW_MODE=false',
    'VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA',
    '',
  ].join('\n'),
);
await createOnce(
  'apps/api/.dev.vars.demo-test',
  [
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
    `ALLOWED_ORIGIN=${origin}`,
    'DEMO_MODE=false',
    'TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA',
    'TURNSTILE_HOSTNAME=localhost',
    '',
  ].join('\n'),
);
console.log(
  'Đã cấu hình file môi trường local; không in khóa. Không thay secret trên Supabase/Cloudflare.',
);
