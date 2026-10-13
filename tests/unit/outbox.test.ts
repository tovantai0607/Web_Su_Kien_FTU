import { describe, it, expect, vi, afterEach } from 'vitest';
const state = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[], attempts: 1 }));
vi.mock('../../apps/api/src/security', () => ({
  service: () => ({
    rpc: async () => ({
      data: [
        {
          id: 'email-test-id',
          to_email: 'test@example.test',
          template: 'received',
          payload: { code: 'FTC-TEST' },
          attempts: state.attempts,
        },
      ],
      error: null,
    }),
    from: () => ({
      update: (value: Record<string, unknown>) => {
        state.updates.push(value);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));
import { sendOutbox } from '../../apps/api/src/outbox';
import type { Env } from '../../apps/api/src/security';
const env = { RESEND_API_KEY: 'test-only', EMAIL_FROM: 'FTUCharm <test@example.test>' } as Env;
afterEach(() => {
  vi.unstubAllGlobals();
  state.updates = [];
  state.attempts = 1;
});
describe('email outbox retry', () => {
  it('does not claim or send when configuration missing', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await sendOutbox({} as Env);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses stable idempotency key and marks sent after provider success', async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      expect((options.headers as Record<string, string>)['Idempotency-Key']).toBe('email-test-id');
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetcher);
    await sendOutbox(env);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.updates[0]).toMatchObject({ status: 'sent', locked_at: null });
  });
  it('temporary failure retries with backoff and releases lease', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    await sendOutbox(env);
    expect(state.updates[0]).toMatchObject({ status: 'pending', locked_at: null });
    expect(Date.parse(String(state.updates[0].next_attempt_at))).toBeGreaterThan(Date.now());
  });
  it('six failures become failed instead of retrying forever', async () => {
    state.attempts = 6;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    await sendOutbox(env);
    expect(state.updates[0].status).toBe('failed');
  });
});
