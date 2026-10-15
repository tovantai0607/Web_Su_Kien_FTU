import { beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { initializeImageMagick } from '@imagemagick/magick-wasm';
import {
  cleanProof,
  configureCodecLimits,
} from '../../supabase/functions/ftu-proof-transform/codec';
beforeAll(async () => {
  await initializeImageMagick(
    await readFile(new URL(import.meta.resolve('@imagemagick/magick-wasm/magick.wasm'))),
  );
  configureCodecLimits();
});
it('decodes real PNG/JPEG pixels, preserves proportions and removes metadata on WebP conversion', async () => {
  for (const format of ['png', 'jpeg'] as const) {
    const input = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: '#123456' },
    })
      .withExif({ IFD0: { Artist: 'PRIVATE TEST METADATA' } })
      .toFormat(format)
      .toBuffer();
    const output = cleanProof(input, `image/${format}`);
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 800 });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(Buffer.from(output).toString()).not.toContain('PRIVATE TEST METADATA');
  }
});
it('rejects forged, truncated and oversized images instead of saving original bytes', async () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array([255, 216, 255, 1]),
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    new Uint8Array(5242881),
  ])
    expect(() => cleanProof(bytes, 'image/png')).toThrow();
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  expect(() => cleanProof(png, 'image/jpeg')).toThrow();
  expect(() => cleanProof(new TextEncoder().encode('<svg/>'), 'image/png')).toThrow();
});
it('rejects a small compressed file with more than 12MP before decoding its pixel cache', async () => {
  const large = await sharp({
    create: { width: 4001, height: 3000, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  expect(large.length).toBeLessThan(5242880);
  expect(() => cleanProof(large, 'image/png')).toThrow('INVALID_DIMENSIONS');
});

it('accepts the configured 12MP boundary using bounded raster processing', async () => {
  const bytes = await sharp({
    create: { width: 4000, height: 3000, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  const result = cleanProof(bytes, 'image/png');
  expect(await sharp(result).metadata()).toMatchObject({
    width: 1600,
    height: 1200,
    format: 'webp',
  });
});
