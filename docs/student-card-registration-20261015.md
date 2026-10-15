# Student-card-only registration — 15/10/2026

## Change

- Registration step three now requests one private FTU student card only. Portrait, half-body and full-body inputs are removed; public rules match.
- Local selection/preview works before registration opens and before login. This does not upload bytes. The input resets to allow retrying the same file, and an explicit retry button appears when upload fails.
- Upload and submission still require verified identity, the official edition and server/database registration window (07–21/03/2027). No production schedule was changed.
- The DEMO ticket fence now passes only the exact official apply route and student-card upload purpose to their own authorization/window checks. DEMO purchase/vote access remains admin-only.
- Account changes clear selected card state and ignore stale upload responses. Preview object URLs are revoked. Card images stay outside public contestant media.
- apply_contestant accepts no portfolio images (missing or empty array); legacy complete sets of three retain purpose/owner/edition/state/uniqueness checks.

## Validation

- TypeScript, ESLint, production build and online-test Wrangler dry-run passed.
- Local PGlite: card-only apply, idempotent retry, card purpose/ownership, private visibility, no public portfolio records, and untouched legacy images passed.
- Local HTTP with real isolated database/image codec/object adapter: anonymous 401; closed registration 409; non-admin portfolio fenced 403; open student-card upload succeeds as private WebP, owned by the ordinary user. No application created by upload alone.
- Full Vitest run: 280 passed, one skipped; one previous expectation that all registration requests were DEMO-fenced was updated for the new policy, and its whole file (5 tests) passed again (281 passing tests in aggregate).
- Browser tests: 53 public cases passed in aggregate, three skipped; 32 auth/official-program cases passed. Updated heading expectations were rerun on desktop and mobile. Closed-window local selection creates a preview and sends no writes.

## Database rollout

- Project ifgtyslifgegwcguysbb identified and old function compared before update.
- Migration created through Supabase CLI, applied with Supabase connector, filename aligned to server-assigned history version 20261015143425.
- Verified zero applicants/private profiles before and after, new optional-portfolio function present; anon/authenticated cannot execute privileged apply function, service_role can.
- No LIVE fixtures, application submissions, email sends or real student-card uploads were performed.

## Rollback

- Restore previous apply function with docs/rollback/student-card-only-registration.sql, then restore web/API commit e4125d1. Existing application rows/media must remain intact. Migration is compatible with old clients sending three portfolio images.
- Use the previous successful Cloudflare deployment for application rollback; keep R2/Images bindings, private bucket, existing Supabase proof storage, email disabled and empty scheduled triggers unchanged.

## Online verification

- Commit ffe7db3 pushed to codex/student-card-registration-20261015 and main. Cloudflare Workers Builds succeeded and deployed version 540ecd9e-78f9-48a2-90fd-82e17c9a7643 at 21:38:03 (UTC+7), 100% traffic.
- Real Chrome session on /dang-ky confirms one enabled student-card input, removed three portfolio inputs, explicit schedule note, and disabled submit outside window. Fake form-only data was never submitted; test tab closed afterward.
- Screenshot: output/r2-activation/student-card-only-online.png (ignored artifact).
