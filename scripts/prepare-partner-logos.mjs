import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// User-authorized deterministic cleanup of image 2 (1897 × 245 screenshot).
// Never redraw logos: clear only near-white pixels connected to crop boundaries.
const source = process.argv[2];
if (!source)
  throw new Error('Pass the original 1897 × 245 partner-strip PNG as the first argument.');
const metadata = await sharp(source).metadata();
if (metadata.width !== 1897 || metadata.height !== 245)
  throw new Error('Expected the original 1897 × 245 screenshot; do not resize before cleanup.');
const regions = [
  ['organizers', { left: 140, top: 64, width: 350, height: 108 }],
  ['ftucharm', { left: 745, top: 64, width: 390, height: 108 }],
  ['supporters', { left: 1270, top: 64, width: 520, height: 108 }],
];
for (const [name, region] of regions) {
  const { data, info } = await sharp(source)
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const count = info.width * info.height;
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const add = (pixel) => {
    if (seen[pixel]) return;
    const i = pixel * 4;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    if (Math.min(...rgb) < 236 || Math.max(...rgb) - Math.min(...rgb) > 16) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < info.width; x++) {
    add(x);
    add((info.height - 1) * info.width + x);
  }
  for (let y = 0; y < info.height; y++) {
    add(y * info.width);
    add(y * info.width + info.width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width;
    data[pixel * 4 + 3] = 0;
    if (x) add(pixel - 1);
    if (x < info.width - 1) add(pixel + 1);
    if (pixel >= info.width) add(pixel - info.width);
    if (pixel < count - info.width) add(pixel + info.width);
  }
  const destination = fileURLToPath(
    new URL(`../apps/web/public/images/partner-${name}.webp`, import.meta.url),
  );
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true })
    .toFile(destination);
  console.log(`${name}: ${tail} exterior background pixels removed`);
}
