import { test as base, expect } from '@playwright/test';

// Every browser context is disposable. External Auth is fulfilled by individual
// tests; unhandled requests must never reach Google, email, or the real project.
export const test = base.extend<{ networkIsolation: void }>({
  networkIsolation: [
    async ({ context }, use) => {
      const blocked: string[] = [];
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
        blocked.push(url.origin);
        await route.abort('blockedbyclient');
      });
      await use();
      expect(blocked, 'Unexpected external requests during isolated E2E').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
export type { Page } from '@playwright/test';
