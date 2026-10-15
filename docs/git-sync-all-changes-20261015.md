# Merge and security review — 15/10/2026

## Outcome and scope

Source snapshot bcee818 preserves all remaining local tracked/untracked source, assets, tests and handover documents. It is merged with origin/main ffe7db3 using a real merge commit on codex/all-changes-sync-20261015; main will fast-forward to the validated result. Existing branch names remain intact. Every remote branch tip was already an ancestor of ffe7db3 before this merge. No force push, history reset, branch deletion, migration, credential change, email or live fixture is part of this task.

Merged conflicts explicitly preserve: both sets of AGENTS instructions; current canonical Wrangler bindings/environment; current student-card-only SQL; local session draft plus current upload handling; both Google draft and ticket phase admin tests. Contact footer, logo assets and mobile typography remain included. Final colors retain the GitHub palette requested by the user.

## Differential security review

Baseline: ffe7db3. Risk-focused review of five draft/auth files (draft storage, Auth provider, password/MFA form, Google callback, registration) plus their tests; remaining UI/config diff checked for accidental endpoint/config or data exposure. Five production files reference the draft store. No newly introduced server endpoint or database grant. Reviewed previous auth callback history/blame and current upload gates; authorization and server scheduling remain unchanged.

Findings after remediation: no unresolved critical/high findings in the reviewed diff. One draft lifecycle concern was corrected: a mounted registration form now clears/reset its draft when its known owner signs out, as well as when a different user signs in, preventing the form watcher from saving the old owner's contents again. This is a focused review, not a complete security audit of all existing code.

Checks: allowlisted text fields only; no media, passwords, bearer tokens, CAPTCHA, consent or service credentials in the draft. sessionStorage only, memory fallback when unavailable. Fixed internal callback destination prevents a draft return URL becoming an open redirect. Rendering uses React text/fields. Draft cleared on submission/signout/account switch; temporary selected-image state is also cleared. Existing PKCE exchange/verified user/server role checks preserved. Staged source scan checked private-key blocks, secret Supabase key prefixes, GitHub tokens and JWT-looking credentials; no hits. Ignored .env/.dev.vars, local backups and output artifacts remain excluded.

Coverage: draft store tests exercise rehydration, excluded fields, corrupt/versioned input, fixed return URL, account switching, storage denial and clearing. Browser tests exercise rules/reload/tab isolation, Google callback return and logout. Real Google/CAPTCHA/payment flows and online load are not exercised by the local test run. Production SQL tests remain isolated PGlite; no live application submitted.

## Rollback

Restore application commit ffe7db3 (previous successful deployment version 540ecd9e-78f9-48a2-90fd-82e17c9a7643) if this UI/draft merge needs rollback. Keep existing R2/Images bindings, private Supabase proofs, disabled email and empty online-test crons. Database changes are not needed for this merge or rollback. Saved source snapshot and original Git history remain recoverable.

## Validation result

Full local run output/full-qa/2026-10-15T14-45-45-923Z: TypeScript, lint, 285 unit/database/browser tests, 57 preview E2E and 34 Auth/official E2E passed (376 total), four conditional skips. Production build passed. Temporary test samples deleted and in-memory databases closed; zero LIVE fixtures. Local frontend 5173/API 8787 restarted after installing the exact current lockfile dependencies.
