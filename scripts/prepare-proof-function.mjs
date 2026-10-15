import { copyFile } from 'node:fs/promises';
const source = import.meta.resolve('@imagemagick/magick-wasm/magick.wasm');
await copyFile(
  new URL(source),
  new URL('../supabase/functions/ftu-proof-transform/magick.wasm', import.meta.url),
);
console.log('Prepared pinned magick-wasm binary for the private DEMO proof processor.');
