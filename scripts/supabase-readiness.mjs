import { readFile, writeFile, mkdir } from 'node:fs/promises';
const values = Object.fromEntries(
  (await readFile('.env.local', 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const url = values.VITE_SUPABASE_URL;
const result = {
  checked_at: new Date().toISOString(),
  writes_performed: false,
  jwks_status: 0,
  jwks_keys: 0,
  schema_status: 0,
};
const jwks = await fetch(url + '/auth/v1/.well-known/jwks.json', {
  signal: AbortSignal.timeout(15000),
});
result.jwks_status = jwks.status;
if (jwks.ok) result.jwks_keys = (await jwks.json()).keys?.length ?? 0;
const schema = await fetch(url + '/rest/v1/contest_editions?select=id&limit=1', {
  headers: { apikey: values.VITE_SUPABASE_PUBLISHABLE_KEY },
  signal: AbortSignal.timeout(15000),
});
result.schema_status = schema.status;
await mkdir('output/qa', { recursive: true });
await writeFile('output/qa/supabase-readiness.json', JSON.stringify(result, null, 2));
console.log(result);
