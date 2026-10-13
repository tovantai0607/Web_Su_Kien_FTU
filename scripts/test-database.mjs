import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'tests/db/database.test.ts'],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
