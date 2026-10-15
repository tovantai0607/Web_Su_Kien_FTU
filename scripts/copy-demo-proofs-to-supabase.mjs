import { createClient } from '@supabase/supabase-js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';

// Explicitly scoped copy: no purchase updates, no deletes and no Storage upserts.
const targetProject = 'ifgtyslifgegwcguysbb';
const bucketName = 'ftu-demo-proof-private';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
if (args[args.indexOf('--project-ref') + 1] !== targetProject || !args.includes('--project-ref'))
  throw new Error('Pass --project-ref to confirm the existing approved project.');
const config = { ...process.env };
for (const line of (await readFile('apps/api/.dev.vars.demo-test', 'utf8')).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !config[m[1]]) config[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
}
if (config.SUPABASE_URL !== `https://${targetProject}.supabase.co` || !config.SUPABASE_SECRET_KEY)
  throw new Error('Backend project/configuration mismatch.');
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = ({ data, error }) => {
  if (error) throw new Error('Supabase operation failed; no credentials logged.');
  return data;
};
const offer = checked(
  await db
    .from('purchase_offers')
    .select('id')
    .eq('slug', 'test-giao-dich-demo')
    .eq('mode', 'DEMO')
    .single(),
);
const orders = checked(
  await db
    .from('purchase_requests')
    .select('id,evidence_id')
    .eq('offer_id', offer.id)
    .eq('status', 'COMPLETED'),
);
const proofIds = orders.map((r) => r.evidence_id).filter(Boolean);
const proofs = proofIds.length
  ? checked(
      await db
        .from('purchase_evidence')
        .select('id,request_id,object_key,mime,bytes')
        .in('id', proofIds),
    )
  : [];
const folder = resolve('output/private-proof-copy');
await mkdir(folder, { recursive: true });
const staged = [];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const proof of proofs) {
  if (
    !orders.some((o) => o.id === proof.request_id && o.evidence_id === proof.id) ||
    !/^private\/purchases\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(
      proof.object_key,
    )
  )
    throw new Error('Unexpected proof scope/path.');
  const file = resolve(folder, `${proof.id}.webp`);
  const extracted = spawnSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'r2',
      'object',
      'get',
      `ftu-demo-proof-local/${proof.object_key}`,
      '--config',
      'apps/api/wrangler.jsonc',
      '--env',
      'demo-test',
      '--local',
      '--persist-to',
      resolve('.wrangler/state/demo-test'),
      '--file',
      file,
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  if (extracted.status !== 0)
    throw new Error('Could not extract a local proof; online copy not started.');
  const bytes = await readFile(file);
  const metadata = await sharp(bytes).metadata();
  // All legacy proofs must already satisfy the server's processed-image contract.
  if (
    metadata.format !== 'webp' ||
    metadata.width * metadata.height > 12000000 ||
    metadata.width > 1600 ||
    metadata.exif ||
    metadata.xmp ||
    metadata.icc ||
    bytes.length !== proof.bytes ||
    bytes.length > 5242880
  )
    throw new Error('Legacy proof needs review; no raw image copied.');
  staged.push({ proof, bytes, hash: sha(bytes) });
}
if (apply) {
  const buckets = checked(await db.storage.listBuckets());
  if (!buckets.some((b) => b.id === bucketName))
    checked(
      await db.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/webp'],
      }),
    );
  const bucket = checked(await db.storage.getBucket(bucketName));
  if (
    bucket.public ||
    Number(bucket.file_size_limit) !== 5242880 ||
    bucket.allowed_mime_types?.join(',') !== 'image/webp'
  )
    throw new Error('Unexpected bucket policy; refusing to change it.');
  for (const { proof, bytes, hash } of staged) {
    const upload = await db.storage.from(bucketName).upload(proof.object_key, bytes, {
      contentType: 'image/webp',
      upsert: false,
      cacheControl: '0',
    });
    if (upload.error && String(upload.error.statusCode) !== '409')
      throw new Error('Private copy failed. Existing data preserved.');
    const downloaded = checked(await db.storage.from(bucketName).download(proof.object_key));
    if (sha(Buffer.from(await downloaded.arrayBuffer())) !== hash)
      throw new Error('Stored bytes did not match the local proof.');
    const publicRead = await fetch(
      `${config.SUPABASE_URL}/storage/v1/object/public/${bucketName}/${proof.object_key}`,
    );
    await publicRead.body?.cancel();
    if (![400, 401, 403, 404].includes(publicRead.status))
      throw new Error('Could not verify denied public object access.');
    const anonymousRead = await fetch(
      `${config.SUPABASE_URL}/storage/v1/object/${bucketName}/${proof.object_key}`,
      {
        headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY },
      },
    );
    await anonymousRead.body?.cancel();
    if (![400, 401, 403, 404].includes(anonymousRead.status))
      throw new Error('Could not verify denied anonymous private object access.');
  }
}
const report = {
  scope: 'COMPLETED DEMO only',
  apply,
  bucket: bucketName,
  count: staged.length,
  files: staged.map(({ proof, hash, bytes }) => ({
    evidence_id: proof.id,
    sha256: hash,
    bytes: bytes.length,
  })),
  verifiedPrivateCopies: apply,
  localFilesPreserved: true,
  purchaseRowsModified: 0,
};
await writeFile(resolve(folder, 'report.json'), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    apply,
    copiedOrValidated: staged.length,
    privateAccessVerified: apply,
    purchaseRowsModified: 0,
  }),
);
