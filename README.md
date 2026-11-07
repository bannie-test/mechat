# iemanchat

A small, invite-only chat app for a group of friends. Vue 3 + TypeScript PWA, Supabase backend
(Postgres, Auth, Realtime, Storage, Edge Functions), with sandboxed **mini apps**.
Everything runs on free tiers.

```
apps/web/              Chat app (Vue 3, Pinia, vue-i18n, PWA + Web Push)
packages/miniapp-sdk/  postMessage protocol (host side lives here)
supabase/migrations/   Schema, RLS, RPCs, storage, realtime
supabase/functions/    `push` Edge Function (Web Push)
Dockerfile, docker/    nginx image for VPS hosting (runtime config)
.github/workflows/     CI, keep-alive ping
```

Mini apps (Little Garden, Lịch âm, …) live in a separate repo:
**[bannie-test/mechat-miniapps](https://github.com/bannie-test/mechat-miniapps)**.

## Architecture in one minute

- **No custom server.** The browser talks to Supabase directly; Row Level Security decides what
  each user can read/write. Privileged actions (create chat, add members, invites, mini app game
  rules) are `SECURITY DEFINER` Postgres functions.
- **Realtime:** one `postgres_changes` channel (messages, reactions, read receipts, profile changes —
  RLS-filtered per user) + one `lobby` channel for presence (online) and typing broadcasts.
- **Invite-only signup:** a trigger on `auth.users` rejects signups without a valid, unused invite
  code. The **first** user to sign up needs no code and becomes admin.
- **Login:** email OTP. The email contains both a 6-digit code and a magic link — the code is what
  works inside an installed PWA (links open in the browser, not the app).
- **Mini apps:** any static bundle at any URL, listed in the `mini_apps` table and opened in a
  sandboxed iframe. The host sends the user's Supabase access token (only to the app's registered
  origin) and refreshes it; the mini app uses the same database under the same RLS. See
  `packages/miniapp-sdk` here and the `mechat-miniapps` repo.
  A mini app can also post messages into the chat it was opened from (normal insert, same RLS).

## 1. Supabase setup (once)

1. Create a free project at supabase.com. Note the **Project URL**, **anon key**, **project ref**, DB password.
2. Apply the schema in the dashboard: **SQL Editor → New query**, paste each file from
   `supabase/migrations/` **in filename order**, click **Run**. Every future schema change is a new
   numbered file in that folder — run only the new ones, in order, and never edit an applied file.
   Applied so far: `20261107000000_init.sql`. (Mini apps keep their SQL in their own repo.)
3. **Auth → URL configuration:** Site URL = your app URL (e.g. `https://iemanchat.pages.dev`), add
   `http://localhost:5173` to redirect URLs.
4. **Auth → Email templates:** paste `supabase/templates/magic_link.html` into both **Magic Link**
   and **Confirm signup** (it shows `{{ .Token }}`, the 6-digit code).
5. **Auth → SMTP (important):** the built-in mailer only sends a couple of emails per hour.
   Configure free custom SMTP (e.g. Resend, Brevo) so friends can log in reliably.
6. **Push notifications** (optional but recommended):
   - Generate keys: `docker run --rm node:22-alpine npx -y web-push generate-vapid-keys`
     and a webhook secret: `openssl rand -hex 32`.
   - **Edge Functions → Secrets:** add `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
     `VAPID_SUBJECT` (`mailto:you@example.com`).
   - **Edge Functions → Deploy a new function → Via Editor**, name `push`, paste
     `supabase/functions/push/index.ts`, deploy, then turn **off** "Enforce JWT verification" in its settings.
   Then in the SQL editor, tell the database where to call (same secret as `PUSH_WEBHOOK_SECRET`):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<your PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');
   ```
   iPhone users must "Add to Home Screen" before they can enable notifications (iOS 16.4+).

## 2. Local development

Requires Node 20+ and pnpm (`corepack enable`).

```sh
cp .env.example .env      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_VAPID_PUBLIC_KEY
pnpm install
pnpm dev                  # chat app → http://localhost:5173
pnpm typecheck && pnpm build
```

Open the app, sign up (first account = admin, no invite needed), then **Settings → Invite friends**.

## 3. Deploy

### Cloudflare Pages (free, recommended now)
| Project | Build command | Output dir | Root dir |
|---|---|---|---|
| `iemanchat` | `pnpm --filter web build` | `apps/web/dist` | *(empty)* |

Environment variables: `NODE_VERSION=22`, `PNPM_VERSION=9.15.4`, plus the `VITE_*` values from
`.env.example`. Every `git push` to `main` deploys; other branches get preview URLs.
The mini apps are a second Pages project built from the `mechat-miniapps` repo (see its README).

### Docker on a VPS (later)
```sh
cp .env.example .env     # same file works: the container accepts NAME or VITE_NAME
docker compose up -d --build     # web → :8080 (mini apps: see mechat-miniapps)
```
Config is written to `env.js` when the container starts, so one image works for any environment.
Use HTTPS in front (see `docker/Caddyfile`); push notifications, the mic and service workers need it.

### GitHub Actions
- `ci.yml` — typecheck + build on every push/PR.
- `keepalive.yml` — free projects pause after 7 idle days; this pings daily.
  Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Adding a mini app

Done in the `mechat-miniapps` repo: add `apps/<name>/` (any framework, static output) with its SQL in
`apps/<name>/sql/`, then insert a row into `public.mini_apps` pointing at the deployed URL.
If you change `packages/miniapp-sdk/src/protocol.ts`, copy it to the other repo too.

## Free-tier limits to keep in mind
500 MB database · 1 GB file storage (photos are downscaled to 1920px JPEG before upload) ·
200 concurrent realtime connections · 50k monthly active users · 500k Edge Function calls/month.
