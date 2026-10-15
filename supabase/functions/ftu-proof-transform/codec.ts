import {
  ImageMagick,
  MagickFormat,
  MagickImageInfo,
  MagickReadSettings,
  ResourceLimits,
} from '@imagemagick/magick-wasm';

export function configureCodecLimits() {
  ResourceLimits.memory = 96n * 1024n * 1024n;
  ResourceLimits.maxMemoryRequest = 96n * 1024n * 1024n;
  ResourceLimits.disk = 0n;
  ResourceLimits.width = 12000000n;
  ResourceLimits.height = 12000000n;
  // ImageMagick also counts temporary caches used during resize/write.
  // Input frameCount remains one; this bound is not an animation allowance.
  ResourceLimits.listLength = 8n;
  ResourceLimits.maxProfileSize = 1024n * 1024n;
}

export function cleanProof(bytes: Uint8Array, mime: string): Uint8Array {
  if (!bytes.length || bytes.length > 5242880) throw new Error('INVALID_IMAGE');
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (!((mime === 'image/jpeg' && jpeg) || (mime === 'image/png' && png)))
    throw new Error('INVALID_IMAGE');
  // Force a raster decoder; filenames, SVG/PDF delegates and URLs are never interpreted.
  const settings = new MagickReadSettings({
    format: mime === 'image/jpeg' ? MagickFormat.Jpeg : MagickFormat.Png,
    frameIndex: 0,
    frameCount: 1,
  });
  const info = MagickImageInfo.create(bytes, settings);
  if (!info.width || !info.height || info.width * info.height > 12000000)
    throw new Error('INVALID_DIMENSIONS');
  return ImageMagick.read(bytes, settings, (image) => {
    if (image.width * image.height > 12000000) throw new Error('INVALID_DIMENSIONS');
    image.autoOrient();
    if (image.width > 1600)
      image.resize(1600, Math.max(1, Math.round((image.height * 1600) / image.width)));
    image.strip();
    image.quality = 85;
    return image.write(MagickFormat.WebP, (data) => {
      if (!data.length || data.length > 5242880) throw new Error('INVALID_IMAGE');
      return new Uint8Array(data);
    });
  });
}
