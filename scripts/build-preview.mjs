import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'build',
    '--config',
    'apps/web/vite.config.ts',
    '--outDir',
    '../../dist-preview',
  ],
  { stdio: 'inherit', env: { ...process.env, VITE_PREVIEW_MODE: 'true' } },
);
process.exit(result.status ?? 1);
