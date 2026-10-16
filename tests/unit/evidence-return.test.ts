// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  beginEvidenceLogin,
  evidenceId,
  evidenceLoginReturn,
} from '../../apps/web/src/lib/evidence-return';
const id = '34fb6f94-f308-470f-8e84-e7370c544ff9';
afterEach(() => {
  evidenceLoginReturn(true);
  sessionStorage.clear();
  vi.useRealTimers();
});
it('returns only a fixed local proof route, once, after authentication', () => {
  beginEvidenceLogin(id.toUpperCase());
  expect(evidenceLoginReturn()).toBe('/minh-chung/' + id);
  expect(evidenceLoginReturn(true)).toBe('/minh-chung/' + id);
  expect(evidenceLoginReturn()).toBeNull();
});
it('rejects arbitrary URLs and corrupt or expired storage', () => {
  for (const value of ['https://evil.test', '//evil.test', '../admin', id + '?token=secret']) {
    beginEvidenceLogin(value);
    expect(evidenceLoginReturn()).toBeNull();
    expect(evidenceId(value)).toBeNull();
  }
  sessionStorage.setItem(
    'ftu-evidence-login',
    JSON.stringify({ id: [id], expires: Date.now() + 1000 }),
  );
  expect(evidenceLoginReturn()).toBeNull();
  vi.useFakeTimers();
  beginEvidenceLogin(id);
  vi.advanceTimersByTime(31 * 60 * 1000);
  expect(evidenceLoginReturn()).toBeNull();
});
it('starting a normal login clears a previous proof destination', () => {
  beginEvidenceLogin(id);
  beginEvidenceLogin(null);
  expect(evidenceLoginReturn()).toBeNull();
});
