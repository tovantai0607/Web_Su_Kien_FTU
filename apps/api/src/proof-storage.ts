import { HTTPException } from 'hono/http-exception';
import { service, type Env } from './security';
import { hashBytes, proofSignature } from './proof-signature';

// Only the server accesses the private bucket. No public or signed URLs are returned.
export function proofStorage(env: Env) {
  if (env.PURCHASE_PROOF_BUCKET) {
    const bucket = service(env).storage.from(env.PURCHASE_PROOF_BUCKET);
    return {
      async put(key: string, bytes: ArrayBuffer, conditional = false) {
        const { error } = await bucket.upload(key, bytes, {
          contentType: 'image/webp',
          upsert: false,
          cacheControl: '0',
        });
        if (error && conditional && 'statusCode' in error && String(error.statusCode) === '409')
          return false;
        if (error)
          throw new HTTPException(503, {
            message: 'Chưa lưu được ảnh minh chứng. Vui lòng thử lại.',
          });
        return true;
      },
      async get(key: string) {
        const { data, error } = await bucket.download(key);
        if (error) {
          if (
            'statusCode' in error &&
            ['400', '404'].includes(String(error.statusCode)) &&
            /not found|does not exist/i.test(error.message)
          )
            return null;
          throw new HTTPException(503, { message: 'Chưa đọc được ảnh minh chứng.' });
        }
        return data;
      },
      async remove(key: string) {
        const { error } = await bucket.remove([key]);
        if (error) throw new HTTPException(503, { message: 'Chưa dọn được ảnh tải trùng.' });
      },
    };
  }
  if (!env.MEDIA)
    throw new HTTPException(503, { message: 'Lưu ảnh minh chứng chưa được cấu hình.' });
  const media = env.MEDIA;
  return {
    async put(key: string, bytes: ArrayBuffer, conditional = false) {
      const result = await media.put(key, bytes, {
        ...(conditional ? { onlyIf: { etagDoesNotMatch: '*' } } : {}),
        httpMetadata: { contentType: 'image/webp' },
      });
      return result !== null;
    },
    async get(key: string) {
      const object = await media.get(key);
      return object
        ? new Blob([await new Response(object.body).arrayBuffer()], { type: 'image/webp' })
        : null;
    },
    async remove(key: string) {
      await media.delete(key);
    },
  };
}

export async function remoteProofTransform(
  request: Request,
  env: Env,
  raw: ArrayBuffer,
  purchaseId: string,
  staff: boolean,
) {
  if (
    !env.SUPABASE_SECRET_KEY ||
    !env.PURCHASE_PROOF_FUNCTION ||
    !/^[a-z0-9-]+$/.test(env.PURCHASE_PROOF_FUNCTION)
  )
    throw new HTTPException(503, { message: 'Xử lý ảnh minh chứng chưa được cấu hình.' });
  const timestamp = String(Date.now());
  const bodyHash = await hashBytes(new Uint8Array(raw));
  const intent = staff ? 'staff' : 'owner';
  const signature = await proofSignature(
    env.SUPABASE_SECRET_KEY,
    request,
    purchaseId,
    intent,
    timestamp,
    bodyHash,
  );
  let result: Response;
  try {
    result = await fetch(`${env.SUPABASE_URL}/functions/v1/${env.PURCHASE_PROOF_FUNCTION}`, {
      method: 'POST',
      headers: {
        Authorization: request.headers.get('Authorization') ?? '',
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': request.headers.get('Content-Type')!,
        'X-FTU-Purchase': purchaseId,
        'X-FTU-Proof-Intent': intent,
        'X-FTU-Proof-Time': timestamp,
        'X-FTU-Proof-Hash': bodyHash,
        'X-FTU-Proof-Signature': signature,
      },
      body: raw,
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
  } catch {
    throw new HTTPException(503, { message: 'Dịch vụ xử lý ảnh chưa sẵn sàng. Vui lòng thử lại.' });
  }
  if (!result.ok) {
    await result.body?.cancel();
    throw new HTTPException(result.status === 400 || result.status === 413 ? 400 : 503, {
      message:
        result.status === 400 || result.status === 413
          ? 'Ảnh không đọc được, quá 5 MB hoặc quá 12 megapixel. Chọn JPG/PNG khác.'
          : 'Dịch vụ xử lý ảnh chưa sẵn sàng. Vui lòng thử lại.',
    });
  }
  if (result.headers.get('Content-Type')?.split(';')[0] !== 'image/webp') {
    await result.body?.cancel();
    throw new HTTPException(503, { message: 'Kết quả xử lý ảnh không hợp lệ.' });
  }
  // Bound the response even if the processor is misconfigured.
  const reader = result.body?.getReader();
  if (!reader) throw new HTTPException(503, { message: 'Kết quả xử lý ảnh trống.' });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 5242880) throw new HTTPException(400, { message: 'Ảnh quá lớn sau xử lý.' });
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}
