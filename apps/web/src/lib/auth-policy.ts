import { z } from 'zod';

// Provider must enforce the same minimum. UTF-8 byte limit avoids bcrypt truncation.
export function passwordError(password: string): string | undefined {
  if (password.length < 12) return 'Dùng ít nhất 12 ký tự.';
  if (new TextEncoder().encode(password).length > 72)
    return 'Mật khẩu vượt 72 byte. Hãy dùng một cụm từ ngắn hơn.';
  return undefined;
}
export function normalizeEmail(email: string) {
  const result = z.string().trim().email().max(254).safeParse(email);
  if (!result.success) throw new Error('Email chưa hợp lệ.');
  return result.data;
}
export function safeAuthError(error: { code?: string; status?: number }, fallback: string) {
  if (
    error.status === 429 ||
    error.code === 'over_request_rate_limit' ||
    error.code === 'over_email_send_rate_limit'
  )
    return 'Bạn thao tác quá nhanh. Vui lòng chờ rồi thử lại.';
  if (error.code === 'weak_password')
    return 'Mật khẩu chưa đủ an toàn. Hãy chọn một cụm từ dài hơn.';
  if (error.code === 'captcha_failed') return 'Xác minh hết hạn. Hãy xác minh lại.';
  if (error.code === 'same_password') return 'Chọn mật khẩu khác mật khẩu hiện tại.';
  return fallback;
}

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** Tokens stay in memory. Only short-lived PKCE verifiers survive email redirects. */
export function createAuthStorage(disk?: BrowserStorage, now = Date.now) {
  const memory = new Map<string, string>();
  const pkce = (key: string) => key.endsWith('-code-verifier');
  return {
    getItem(key: string): string | null {
      if (!pkce(key)) return memory.get(key) ?? null;
      try {
        const raw = disk?.getItem(key);
        if (raw) {
          const value = JSON.parse(raw) as { expires: number; value: string };
          if (value.expires > now() && typeof value.value === 'string') return value.value;
          disk?.removeItem(key);
          memory.delete(key);
          return null;
        }
      } catch {
        /* Storage disabled: stay in memory and require the same page. */
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      if (pkce(key)) {
        try {
          disk?.setItem(key, JSON.stringify({ expires: now() + 15 * 60_000, value }));
        } catch {
          /* Memory fallback. */
        }
      }
    },
    removeItem(key: string) {
      memory.delete(key);
      if (pkce(key)) {
        try {
          disk?.removeItem(key);
        } catch {
          /* Memory already cleared. */
        }
      }
    },
  };
}
