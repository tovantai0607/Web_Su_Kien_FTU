import sharp from 'sharp';
import { readdir, readFile, writeFile } from 'node:fs/promises';
await sharp('apps/web/public/images/silk-bloom.png')
  .resize({ width: 1536, withoutEnlargement: true })
  .webp({ quality: 85 })
  .toFile('apps/web/public/images/silk-bloom.webp');
async function update(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = path + '/' + entry.name;
    if (entry.isDirectory()) await update(file);
    else if (/\.(tsx|css)$/.test(file)) {
      const s = await readFile(file, 'utf8');
      if (s.includes('/images/silk-bloom.png'))
        await writeFile(file, s.replaceAll('/images/silk-bloom.png', '/images/silk-bloom.webp'));
    }
  }
}
await update('apps/web/src');
