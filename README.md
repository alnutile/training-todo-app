# Training To-Do App

A small to-do app, built step by step. **Step 1 (current):** a static
Vite + React + TypeScript to-do list that persists in the browser via
`localStorage`. No backend, no database, no auth yet — those come in later steps
(see `CLAUDE.md`).

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build into dist/
npm start        # serve the built dist/ on $PORT (used by Railway)
```

## Authentication (Step 3 — real accounts)

The app gates the board behind a Supabase session. Logged-out visitors (incl.
incognito) see the login screen; logged-in users see only their own todos.
Sign-in options: **email + password** and **passwordless magic link**.

### One-time Supabase dashboard setup

These are auth settings (no API/migration for them) — set them once in the
[`training-todo-app` dashboard](https://supabase.com/dashboard/project/torocnrxwdepeceouzpe):

1. **Authentication → Sign In / Providers**
   - **Email**: enabled. Turn **"Confirm email" OFF** (no verification step — see
     note below). Magic links work automatically once Email is enabled.
   - **"Allow anonymous sign-ins": OFF** (Step 2 used this; Step 3 removes it).
2. **Authentication → URL Configuration**
   - **Site URL**: your production URL, e.g. `https://<app>.up.railway.app`
   - **Redirect URLs** — add BOTH so magic links + post-login redirects work in
     dev and prod:
     - `http://localhost:5173/**`
     - `https://<app>.up.railway.app/**` (and any custom domain, e.g.
       `https://todo.example.com/**`)

> **Note — email confirmation is off on purpose** for a simple demo: anyone can
> register and is signed in immediately. You can tighten this later — turn
> "Confirm email" back on, or go invite-only — without code changes.

### Why both dev and prod redirect URLs?

Magic links and the post-login redirect send the user back to
`window.location.origin`. That origin **must** be in the Redirect URLs list or
Supabase rejects the redirect. Listing both `localhost` and the Railway domain
means the same build works in both places.

## Database & migrations

The Supabase schema lives in [`supabase/migrations/`](supabase/migrations/) and
is applied by a GitHub Actions workflow
([`.github/workflows/supabase-migrations.yml`](.github/workflows/supabase-migrations.yml))
on every push to `main` that touches a migration. `supabase db push` only runs
versions the project hasn't recorded yet, so re-runs are safe.

Add these in **GitHub → repo Settings → Secrets and variables → Actions**:

| Secret                  | Where to get it                                                                 |
|-------------------------|---------------------------------------------------------------------------------|
| `SUPABASE_ACCESS_TOKEN` | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)        |
| `SUPABASE_DB_PASSWORD`  | Project → Settings → Database → the database password you set at project create |

The project ref (`torocnrxwdepeceouzpe`) is public and hardcoded in the workflow.

## Frontend env vars (Railway + local)

Only `VITE_`-prefixed, **public** values:

| Var                     | Value                                                  |
|-------------------------|--------------------------------------------------------|
| `VITE_SUPABASE_URL`     | `https://torocnrxwdepeceouzpe.supabase.co`             |
| `VITE_SUPABASE_ANON_KEY`| the project's anon/publishable key (`sb_publishable_…`)|

Never put the `service_role` key in a `VITE_` var or in git.

## Deploy to Railway (first-time, click-by-click)

**1. Create the GitHub repo and push**

```bash
# from this folder, after the first commit is made:
gh repo create training-todo-app --public --source=. --remote=origin --push
# (or create an empty repo at github.com/new, then:)
git remote add origin https://github.com/<you>/training-todo-app.git
git branch -M main
git push -u origin main
```

**2. Create the Railway project and point it at the repo**

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Authorize Railway for your account if prompted, then pick
   **`training-todo-app`**.
4. Railway reads `railway.json`: it runs `npm run build`, then `npm start`,
   which serves `dist/` on the `$PORT` Railway provides. No env vars needed yet.
5. Wait for the build to go green.

**3. Get a public HTTPS URL**

1. Open the service → **Settings** → **Networking**.
2. Click **Generate Domain**. You'll get a `*.up.railway.app` URL.
3. Open it — the to-do app loads. **HTTPS is on by default** (Railway terminates
   TLS on every generated and custom domain; there's nothing to configure).

Every push to `main` redeploys automatically.

---

## Google Tasks sync agent (Step 5)

[`agents/`](agents/) is a **separate, server-side deployable** that pulls the
target user's **Google Tasks** into the `todos` table via the Zapier SDK, so a
task made on your phone shows up on the board. It's a per-user agent — it reads
one Google Tasks connection and writes rows for one `SYNC_TARGET_USER_ID`.

**How it works**
- Reads every task list + task (incl. completed) via the Zapier SDK
  (`GoogleTasksCLIAPI` → `list_task_lists`, then `get_tasks_by_list` with
  `show_completed: true`).
- Status map: Google `needsAction` → `backlog`, `completed` → `done`.
- Syncs the **latest 50** tasks by default (`SYNC_LIMIT`, most-recently-updated
  first) to keep the demo board tidy; set `SYNC_LIMIT=0` to sync everything.
- Upserts by `external_id` (the Google Task id) via the
  `sync_external_todos` SQL function, so repeat runs **update** title/status
  instead of creating duplicates. It only adds/updates — tasks deleted in
  Google are left on the board (out of scope).

**Security (per CLAUDE.md)**
- The agent talks to Supabase with the **`service_role`** key
  (`SUPABASE_SERVICE_ROLE_KEY`) — server-only, never a `VITE_` var, never
  committed. `service_role` bypasses RLS, so the agent sets `user_id` explicitly
  to `SYNC_TARGET_USER_ID` on every row.
- **Multi-user = one agent per person:** each person runs their own agent with
  their own `SYNC_TARGET_USER_ID` and their own Google Tasks connection. There
  is no shared multi-tenant bot.

### Run it manually (the demo)

```bash
cd agents
cp .env.example .env      # fill in the real values (see below), .env is gitignored
npm install
npm start                 # reads Google Tasks, upserts, prints rows affected
```

`agents/.env` for the demo:

| Var | Value |
|---|---|
| `SUPABASE_URL` | `https://torocnrxwdepeceouzpe.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project → Settings → API → `service_role` (secret) |
| `SYNC_TARGET_USER_ID` | your account's `auth.users` UUID |
| `GOOGLE_TASKS_CONNECTION_ID` | `020d862a-636a-86a8-bfc3-14fe4795af8f` |

Locally the Zapier SDK uses the token from `zapier-sdk login`, so you don't need
the `ZAPIER_CREDENTIALS_*` vars. Then reload the board — your Google Tasks appear
(and thanks to realtime, they pop in live).

### Deploy as a second Railway service (hourly cron)

The agent is its own service, separate from the web app:

1. In your Railway **project** → **New** → **GitHub Repo** → same repo.
2. Open the new service → **Settings** → **Root Directory** = `agents`. It picks
   up [`agents/railway.json`](agents/railway.json): build with Nixpacks, start
   with `npm start`, **cron `0 * * * *`** (hourly), restart policy `NEVER` (a
   cron job runs once and exits).
3. Set the service's **Variables** — the four above **plus** the Zapier server
   credentials (no CLI token on Railway):
   - `ZAPIER_CREDENTIALS_CLIENT_ID`, `ZAPIER_CREDENTIALS_CLIENT_SECRET` — create
     with `npx zapier-sdk create-client-credentials`.
4. Deploy. It runs every hour, and you can hit **Deploy/Run** to trigger it
   on demand for the demo.

# Vibe Coding With Confidence — starter rules

These are the "opinion" files from the post **Vibe Coding With Confidence**. They
encode how I like an AI to build a small, real, secure app — so you get the
consistency Lovable/Replit bake in, but on your own terms.

## What's here

- **`CLAUDE.md`** — the main one. The opinionated rules for building the to-do
  system: stack, security defaults (RLS, env-var discipline, never roll your own
  auth), the data model, the two-phase auth flow, realtime, Railway hosting, and
  the Zapier SDK sync agent.

## How to use it

1. Start a **new repo** for your to-do app.
2. Copy **`CLAUDE.md`** into the root of that repo.
3. Open your AI tool (Claude Code, etc.) in that repo and start with something
   small — *"give me a static hello world"* — then let the AI follow `CLAUDE.md`
   as you grow it step by step.
4. Adjust the defaults (framework, provider, how open sign-up is) to taste — they
   are starting opinions, not laws. The **security** rules are the ones to keep.

The point isn't this exact stack — it's having your defaults written down so the
AI builds the same way every time.
