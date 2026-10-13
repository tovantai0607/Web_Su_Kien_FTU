// Local public HTTP smoke only. Deliberately refuses remote hosts.
import { performance } from 'node:perf_hooks';
const url = process.env.LOCAL_LOAD_URL ?? 'http://127.0.0.1:5173/';
const target = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(target.hostname))
  throw new Error('Only local targets allowed');
const concurrency = 400;
const start = performance.now();
const results = await Promise.all(
  Array.from({ length: concurrency }, async () => {
    const time = performance.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      await r.arrayBuffer();
      return { ok: r.ok, ms: performance.now() - time };
    } catch {
      return { ok: false, ms: performance.now() - time };
    }
  }),
);
const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
const report = {
  scope: 'Local public HTTP GET smoke; not vote throughput or production capacity',
  requests: concurrency,
  failures: results.filter((r) => !r.ok).length,
  p95_ms: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
  p99_ms: Math.round(sorted[Math.floor(sorted.length * 0.99)]),
  elapsed_ms: Math.round(performance.now() - start),
};
console.log(report);
if (report.failures) process.exitCode = 1;
