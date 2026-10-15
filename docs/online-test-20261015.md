# Online test — 15/10/2026

URL: https://ftucharm-test.bancotaima1235.workers.dev

Worker: `ftucharm-test`; Wrangler environment: `online-test`.
Uses the existing Supabase project, official season `ftucharm-2027`.
This is not an isolated database. Do not create test orders, contestants or votes.

## Deploy

Build with `VITE_PREVIEW_MODE=false`, the existing Supabase publishable URL/key,
and the Turnstile site key for this hostname. Never put server secrets in VITE variables.

```powershell
npm run typecheck
npm run build
npx wrangler deploy --config apps/api/wrangler.jsonc --env online-test --dry-run
npx wrangler deploy --config apps/api/wrangler.jsonc --env online-test
```

Runtime secrets are configured on Cloudflare: `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`. They are not stored in Git.
Two exact online callbacks were added to Supabase's redirect allowlist,
for `/tai-khoan/oauth-callback` and `/tai-khoan/dat-lai-mat-khau`.
Existing local Site URL and callback entries remain intact.

## Limits

- R2 subscription was not activated: the user requested an option without payment.
- No MEDIA/IMAGES binding. Upload endpoints fail closed; existing local media
  has not been copied online. Static assets bundled with the website work.
- No scheduled jobs: no queued email is sent, no scheduled database writes.
- No database migrations, sample orders or external emails were performed.
- Google Sheets activation remains separate and is not enabled by this deployment.
- A successful deploy does not prove authenticated user journeys or upload.

## Initial checks

Typecheck, build, generated Wrangler types and dry-run passed.
Remote health returns `ok` and `live`. Program returns the official season,
11 timeline entries, two offers and registration UPCOMING.
Initial deployment version: `1e0a0bd6-ac0d-4188-9b76-1fe3788b1736`.

## Rollback

For a later faulty update, use Cloudflare Deployments to restore the last verified
Worker version. This does not roll back Supabase data. To withdraw this initial
test site, disable its workers.dev route and set `workers_dev=false` in this
environment before any subsequent deployment. Preserve secrets and data.

## Git build settings

Connected Cloudflare Workers Builds to `tovantai0607/Web_Su_Kien_FTU`,
production branch `main`, on 15/10/2026. Every push/merge to `main` triggers a
build and deploy. Failed builds do not replace the currently deployed version.

Root `/`; build `npm run typecheck && npm run build`; deploy command
`npx wrangler deploy --config apps/api/wrangler.jsonc --env online-test`.
Disable automatic branch Preview builds for this environment.
Runtime secrets and build variables are separate settings.
Build variables: `VITE_PREVIEW_MODE=false`, Supabase URL and publishable key,
Turnstile site key, and `NODE_VERSION=22.20.0`. Backend secrets stay on the Worker.
Cloudflare build token `ftucharm-main-build` was created with the user's approval.
No database migrations are included in the build/deploy commands.
