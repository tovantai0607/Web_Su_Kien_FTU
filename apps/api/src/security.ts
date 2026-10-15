import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';
export type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_JWKS_URL: string;
  ALLOWED_ORIGIN: string;
  DEMO_MODE?: string;
  PUBLIC_EDITION_SLUG?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_HOSTNAME?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  ASSETS?: Fetcher;
  MEDIA?: R2Bucket;
  IMAGES?: ImagesBinding;
  RATE_LIMITER?: RateLimit;
};
export type Principal = { id: string; email: string; aal: string };
export function readClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function service(env: Env): SupabaseClient {
  if (!env.SUPABASE_SECRET_KEY)
    throw new HTTPException(503, { message: 'Dịch vụ chưa được cấu hình.' });
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticate(request: Request, env: Env): Promise<Principal> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ') || header.length > 8192)
    throw new HTTPException(401, { message: 'Vui lòng đăng nhập.' });
  const token = header.slice(7);
  try {
    // No arbitrary JWKS URL: it must belong to the configured Supabase project.
    const jwksURL = env.SUPABASE_URL + '/auth/v1/.well-known/jwks.json';
    if (env.SUPABASE_JWKS_URL !== jwksURL) throw new Error('Invalid issuer configuration');
    const auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The SDK verifies asymmetric signatures with project JWKS. For legacy
    // HS256 it verifies with the project's Auth server; no shared signing secret
    // is needed here, and decoded/unverified claims are never used for access.
    const verified = await auth.auth.getClaims(token);
    if (verified.error || !verified.data) throw new Error('Invalid claims');
    const { claims: payload, header: jwtHeader } = verified.data;
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (
      !['HS256', 'ES256', 'RS256'].includes(jwtHeader.alg) ||
      payload.iss !== env.SUPABASE_URL + '/auth/v1' ||
      !audience.includes('authenticated') ||
      typeof payload.exp !== 'number' ||
      payload.exp <= Date.now() / 1000 ||
      (typeof payload.nbf === 'number' && payload.nbf > Date.now() / 1000)
    )
      throw new Error('Invalid token scope');
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user?.email_confirmed_at || data.user.id !== payload.sub)
      throw new Error('Invalid user');
    return {
      id: data.user.id,
      email: data.user.email ?? '',
      aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
    };
  } catch {
    throw new HTTPException(401, {
      message: 'Phiên đăng nhập không hợp lệ hoặc email chưa xác minh.',
    });
  }
}
export async function authorize(principal: Principal, env: Env, roles: string[]) {
  if (principal.aal !== 'aal2') {
    const admin = await service(env).rpc('has_role', {
      p_user: principal.id,
      p_roles: ['SUPER_ADMIN'],
    });
    if (admin.error || !admin.data)
      throw new HTTPException(403, { message: 'Bạn không có quyền thực hiện thao tác này.' });
  }
  const { data, error } = await service(env).rpc('has_role', {
    p_user: principal.id,
    p_roles: roles,
  });
  if (error || !data)
    throw new HTTPException(403, { message: 'Bạn không có quyền thực hiện thao tác này.' });
}
export async function verifyTurnstile(token: string, env: Env, action: string, ip?: string) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_HOSTNAME)
    throw new HTTPException(503, { message: 'Xác minh chống spam chưa được cấu hình.' });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  const data = (await r.json()) as { success: boolean; hostname?: string; action?: string };
  if (!data.success || data.hostname !== env.TURNSTILE_HOSTNAME || data.action !== action)
    throw new HTTPException(400, {
      message: 'Xác minh chống spam không hợp lệ. Vui lòng thử lại.',
    });
}
export async function digest(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function imageSignature(b: Uint8Array) {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    ? 'image/jpeg'
    : b[0] === 137 &&
        b[1] === 80 &&
        b[2] === 78 &&
        b[3] === 71 &&
        b[4] === 13 &&
        b[5] === 10 &&
        b[6] === 26 &&
        b[7] === 10
      ? 'image/png'
      : null;
}
export function stripWebPMetadata(buffer: ArrayBuffer) {
  const b = new Uint8Array(buffer),
    v = new DataView(buffer),
    decode = new TextDecoder();
  if (
    b.length < 12 ||
    decode.decode(b.slice(0, 4)) !== 'RIFF' ||
    decode.decode(b.slice(8, 12)) !== 'WEBP' ||
    v.getUint32(4, true) !== b.length - 8
  )
    throw new HTTPException(400, { message: 'Không thể xử lý ảnh.' });
  const chunks: Uint8Array[] = [];
  let pixels = false;
  for (let p = 12; p < b.length;) {
    if (p + 8 > b.length) throw new HTTPException(400, { message: 'Ảnh không hợp lệ.' });
    const name = decode.decode(b.slice(p, p + 4));
    const size = v.getUint32(p + 4, true);
    const end = p + 8 + size + (size % 2);
    if (end > b.length) throw new HTTPException(400, { message: 'Ảnh không hợp lệ.' });
    if (['VP8 ', 'VP8L', 'VP8X', 'ALPH'].includes(name)) {
      const chunk = b.slice(p, end);
      if (name === 'VP8X' && size >= 10) chunk[8] &= ~(0x20 | 0x08 | 0x04);
      if (name === 'VP8 ' || name === 'VP8L') pixels = true;
      chunks.push(chunk);
    }
    p = end;
  }
  if (!pixels) throw new HTTPException(400, { message: 'Ảnh không hợp lệ.' });
  const result = new Uint8Array(12 + chunks.reduce((n, c) => n + c.length, 0));
  result.set(b.slice(0, 12));
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  let p = 12;
  for (const c of chunks) {
    result.set(c, p);
    p += c.length;
  }
  return result.buffer;
}
