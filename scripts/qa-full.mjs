// Local-only acceptance run. Never loads .dev.vars or runs migrations remotely.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, rm, rmdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = path.resolve(root, 'output', 'full-qa', runId);
await mkdir(reportDir, { recursive: true });
const tempRoot = await realpath(tmpdir());
const demoDir = await mkdtemp(path.join(tempRoot, 'ftucharm-qa-'));
const demoFiles = ['buyer.json', 'valid.png', 'invalid.txt'];
const env = {
  ...process.env,
  FTU_QA_DIR: reportDir,
  FTU_DEMO_DIR: demoDir,
  VITE_TURNSTILE_SITE_KEY: '',
};
for (const key of Object.keys(env)) {
  if (/^(SUPABASE_|CLOUDFLARE_|RESEND_|TURNSTILE_|VITE_SUPABASE_)/.test(key)) delete env[key];
}
delete env.FTU_TEST_DATABASE_URL;
delete env.FTU_RUN_LOCAL_LOAD;
const steps = [];
async function run(name, args) {
  console.log('Running ' + name);
  let output = '';
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (b) => {
      output += b;
    });
    child.stderr.on('data', (b) => {
      output += b;
    });
    child.on('error', (e) => {
      output += e.message;
      resolve(-1);
    });
    child.on('close', (code) => resolve(code ?? -1));
  });
  await writeFile(path.join(reportDir, name + '.log'), output);
  steps.push({ name, exit_code: result });
  console.log(name + ': ' + (result === 0 ? 'PASS' : 'FAIL — see report log'));
}
let cleanup;
try {
  await writeFile(
    path.join(demoDir, 'buyer.json'),
    JSON.stringify({
      'Họ tên': 'QA LOCAL ONLY',
      Trường: 'DEMO',
      'Khóa/lớp': 'QA-ONLY',
      MSSV: 'QA-ONLY',
      Email: 'qa@example.test',
      'Số điện thoại': '0000000000',
      Facebook: 'DEMO',
    }),
  );
  await sharp({ create: { width: 8, height: 8, channels: 3, background: '#aa0000' } })
    .png()
    .toFile(path.join(demoDir, 'valid.png'));
  await writeFile(path.join(demoDir, 'invalid.txt'), 'Not an image — LOCAL QA ONLY');
  await run('typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']);
  await run('lint', [
    'node_modules/eslint/bin/eslint.js',
    'apps',
    'packages',
    'tests',
    'playwright.config.ts',
    'playwright.auth.config.ts',
    'vitest.config.ts',
  ]);
  await run('unit-database-browser', [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--reporter=json',
    '--outputFile=' + path.join(reportDir, 'vitest.json'),
  ]);
  await run('e2e-preview', ['node_modules/@playwright/test/cli.js', 'test']);
  await run('e2e-official-auth', [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'playwright.auth.config.ts',
  ]);
  await run('build', [
    'node_modules/vite/bin/vite.js',
    'build',
    '--config',
    'apps/web/vite.config.ts',
  ]);
} finally {
  // Verify the absolute path is exactly this run's generated temp directory.
  const resolved = await realpath(demoDir);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('ftucharm-qa-'))
    throw new Error('Unsafe cleanup target');
  for (const file of demoFiles) await rm(path.join(resolved, file), { force: true });
  await rmdir(resolved);
  cleanup = {
    temporary_samples_deleted: true,
    test_database: 'PGlite memory; closed by test teardown',
    live_fixtures_created: 0,
    historical_demo_deleted: false,
  };
}
let tests;
try {
  const data = JSON.parse(await readFile(path.join(reportDir, 'vitest.json'), 'utf8'));
  tests = {
    passed: data.numPassedTests,
    failed: data.numFailedTests,
    skipped: data.numPendingTests,
  };
} catch {
  tests = { report_unavailable: true };
}
const summary = {
  run_id: runId,
  steps,
  tests,
  cleanup,
  native_postgres: 'not run by this command; dedicated loopback test required',
  external_oauth_email_storage_sheets: 'not exercised; local adapters only',
};
await writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2));
await writeFile(
  path.resolve(root, 'output/full-qa/latest.json'),
  JSON.stringify({ reportDir, ...summary }, null, 2),
);
console.log(JSON.stringify({ reportDir, ...summary }, null, 2));
process.exitCode = steps.every((s) => s.exit_code === 0) ? 0 : 1;
