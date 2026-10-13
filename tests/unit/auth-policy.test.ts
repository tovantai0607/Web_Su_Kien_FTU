import { describe, it, expect } from 'vitest';
import {
  createAuthStorage,
  normalizeEmail,
  passwordError,
  safeAuthError,
} from '../../apps/web/src/lib/auth-policy';

describe('account security boundaries', () => {
  it('rejects short passwords and bcrypt byte overflow, including Vietnamese characters', () => {
    expect(passwordError('short')).toBeDefined();
    expect(passwordError('a'.repeat(72))).toBeUndefined();
    expect(passwordError('a'.repeat(73))).toBeDefined();
    expect(passwordError('ệ'.repeat(25))).toBeDefined();
    expect(passwordError('Cụm từ đủ dài 2026')).toBeUndefined();
  });
  it('normalizes whitespace without silently modifying the password or email local part', () => {
    expect(normalizeEmail(' User@example.test ')).toBe('User@example.test');
    expect(() => normalizeEmail('bad')).toThrow();
  });
  it('keeps session tokens off disk while a PKCE verifier survives a new page', () => {
    const values = new Map<string, string>();
    const disk = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const first = createAuthStorage(disk, () => 1000);
    first.setItem('sb-test-auth-token', '{"access_token":"fake","refresh_token":"fake"}');
    first.setItem('sb-test-flow-123-code-verifier', 'verifier');
    expect(values.size).toBe(1);
    const nextPage = createAuthStorage(disk, () => 2000);
    expect(nextPage.getItem('sb-test-auth-token')).toBeNull();
    expect(nextPage.getItem('sb-test-flow-123-code-verifier')).toBe('verifier');
    expect(
      createAuthStorage(disk, () => 1_000_000).getItem('sb-test-flow-123-code-verifier'),
    ).toBeNull();
    expect(values.size).toBe(0);
  });
  it('removes consumed verifiers and tolerates disabled browser storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('disabled');
      },
      removeItem: () => {
        throw new Error('disabled');
      },
    };
    const storage = createAuthStorage(blocked);
    storage.setItem('flow-code-verifier', 'test');
    expect(storage.getItem('flow-code-verifier')).toBe('test');
    storage.removeItem('flow-code-verifier');
    expect(storage.getItem('flow-code-verifier')).toBeNull();
  });
  it('does not expose provider internals or identify registered email addresses', () => {
    expect(safeAuthError({ code: 'user_already_exists' }, 'Không thể đăng ký.')).toBe(
      'Không thể đăng ký.',
    );
    expect(safeAuthError({ status: 429 }, 'fallback')).toContain('chờ');
  });
});
