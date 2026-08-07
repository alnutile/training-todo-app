# Training To-Do App

[![CI](https://github.com/alnutile/training-todo-app/actions/workflows/ci.yml/badge.svg)](https://github.com/alnutile/training-todo-app/actions/workflows/ci.yml)
[![Database](https://github.com/alnutile/training-todo-app/actions/workflows/database.yml/badge.svg)](https://github.com/alnutile/training-todo-app/actions/workflows/database.yml)

A small to-do app, built step by step, as a companion to the **Vibe Coding With
Confidence** posts and videos.

A real board — four lanes, drag to move, per-user data behind a login, live
across tabs — plus a server-side agent that syncs Google Tasks in through the
Zapier SDK.

| Step | What landed |
|---|---|
| 1 | Static Vite + React + TypeScript board |
| 2 | Supabase database, RLS, drag-to-move, realtime |
| 3 | Real accounts (email + password, magic links) |
| 4 | Design pass |
| 5 | Google Tasks sync agent (Zapier SDK) |
| **6** | **CI/CD, mocking, and a disposable database — [docs/ci-cd.md](docs/ci-cd.md)** |

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

The app needs a Supabase to talk to. The quickest one is local — no cloud
project, no keys to copy:

```bash
supabase start   # Postgres + Auth + Realtime in Docker
npm run dev      # .env already points here
supabase stop    # when you're done
```

Other scripts:

```bash
npm run build      # type-check + production build into dist/
npm start          # serve the built dist/ on $PORT (used by Railway)
npm test           # unit + component tests
npm run test:e2e   # real Chrome, real build (needs: npx playwright install chromium)
npm run typecheck
```

## Which version am I looking at?

The footer shows the commit the running build came from and links straight to it
on GitHub. Push a change, wait for the deploy, refresh — the hash changes. That
turns "did my change actually ship?" into something you read off the page instead
of guess.

The sha is baked in at build time by [`vite.config.ts`](vite.config.ts), which
takes it from `VITE_COMMIT_SHA`, then Railway's `RAILWAY_GIT_COMMIT_SHA`, then
GitHub's `GITHUB_SHA`, then `git rev-parse` — and says `dev` when there's no
commit behind the build, because that's the honest answer.

## Tests and CI/CD

Every push runs four jobs: the web app, the sync agent, the edge function, and a
real browser. Nothing in them touches Zapier, Google, a Supabase project, or your
wallet — the network is faked at every layer. Migrations get their own workflow,
which boots a **throwaway Supabase inside the GitHub runner**, applies every
migration from scratch, and proves Row Level Security actually isolates users.

- **[docs/ci-cd.md](docs/ci-cd.md)** — how it all works, what each workflow does,
  which secrets to add, and how to run everything locally.
- **[docs/video-run-of-show.md](docs/video-run-of-show.md)** — the walkthrough,
  in order, with the commands.

```bash
npm test                                        # web
(cd agents/google-tasks-sync && npm test)       # agent, with Zapier faked
(cd supabase/functions && deno test)            # edge function
npm run test:e2e                                # browser
```

## Authentication (Step 3 — real accounts)

The app gates the board behind a Supabase session. Logged-out visitors (incl.
incognito) see the login screen; logged-in users see only their own todos.
Sign-in options: **email + password** and **passwordless magic link**.

### Auth settings live in `supabase/config.toml`

They're not dashboard clicks anybody has to remember — they're in git, reviewable
in a pull request, and applied with:

```bash
supabase config push
```

That covers: email sign-up on, **email confirmation off** (sign-up returns a
session immediately), anonymous sign-ins off, the redirect URLs magic links are
allowed to return to, and the password minimum that matches
[`src/lib/validation.ts`](src/lib/validation.ts).

> **Watch out:** `config push` fills in anything you *don't* state with the
> CLI's own defaults, and some of those are looser than what a new project
> ships with (it will happily turn off MFA enrolment and drop the email rate
> limit to one per second). So the strict settings have to be written down too —
> they are, and the command prints a diff before it applies. Read the diff.

Running locally with `supabase start`? Email and magic links already work, and
the mail lands in Mailpit at http://127.0.0.1:54324 instead of a real inbox.

**Still a dashboard step:** once the app is deployed, add its URL to
`site_url` / `additional_redirect_urls` in `config.toml` and push again —
Supabase rejects a redirect to any origin not on that list.

> **Note — email confirmation is off on purpose** for a simple demo: anyone can
> register and is signed in immediately. You can tighten this later — set
> `enable_confirmations = true`, or go invite-only — without code changes.

### Why both dev and prod redirect URLs?

Magic links and the post-login redirect send the user back to
`window.location.origin`. That origin **must** be in
`additional_redirect_urls` or Supabase rejects the redirect. Listing both
`localhost` and the Railway domain means the same build works in both places.

## Database & migrations

The Supabase schema lives in [`supabase/migrations/`](supabase/migrations/).

- **On a branch or PR:** [`database.yml`](.github/workflows/database.yml) starts a
  disposable Supabase in the runner, applies every migration from scratch, lints
  the schema, and runs [`supabase/tests/rls_test.sql`](supabase/tests/rls_test.sql).
  Production is never touched.
- **On `main`:** [`deploy-production.yml`](.github/workflows/deploy-production.yml)
  runs `supabase db push` against the real project, then deploys the edge
  functions. `db push` only applies versions the project hasn't recorded yet, so
  re-runs are safe.

Add these in **GitHub → repo Settings → Secrets and variables → Actions**:

| Name                    | Kind     | Where to get it                                                                 |
|-------------------------|----------|---------------------------------------------------------------------------------|
| `SUPABASE_PROJECT_REF`  | Variable | The project ref — the subdomain of its API URL. Public, so not a secret.        |
| `SUPABASE_ACCESS_TOKEN` | Secret   | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)        |
| `SUPABASE_DB_PASSWORD`  | Secret   | Project → Settings → Database → the database password you set at project create |

Until they're set, the deploy jobs skip themselves with a note rather than
failing. Full details in [docs/ci-cd.md](docs/ci-cd.md).

## Edge functions

[`supabase/functions/todo-stats/`](supabase/functions/todo-stats/) is a Deno
edge function: send it your `Authorization: Bearer <jwt>` and it answers with
your board summary. It calls the database **as you**, with the public anon key,
so Row Level Security decides what it can see — it holds no `service_role` key
and cannot read anyone else's board.

```bash
cd supabase/functions && deno test    # 13 tests, no deploy, no network
```

## Frontend env vars (Railway + local)

Only `VITE_`-prefixed, **public** values:

| Var                     | Value                                                  |
|-------------------------|--------------------------------------------------------|
| `VITE_SUPABASE_URL`     | `https://<your-project-ref>.supabase.co` (or `http://127.0.0.1:54321` locally) |
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

[`agents/google-tasks-sync/`](agents/google-tasks-sync/) is a **separate,
server-side deployable** that pulls the target user's **Google Tasks** into the
`todos` table via the Zapier SDK, so a task made on your phone shows up on the
board. It's a per-user agent — it reads one Google Tasks connection and writes
rows for one target account. Each agent lives in its own folder under
[`agents/`](agents/) (one folder = one Railway service); see
[agents/README.md](agents/README.md) for the convention.

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
  to the target account on every row.
- **Multi-user = one agent per person:** each person runs their own agent with
  their own target account and their own Google Tasks connection. There
  is no shared multi-tenant bot.

**Tested without ever calling Zapier**

```bash
cd agents/google-tasks-sync && npm test
```

The suite runs the **real** Zapier SDK and the **real** Supabase client — their
HTTP requests are answered by [MSW](https://mswjs.io) instead of the internet
(see [tests/mocks/zapier.ts](agents/google-tasks-sync/tests/mocks/zapier.ts)).
Any request the tests haven't faked fails the run, so it can't quietly reach a
real service, spend a Zapier task, or touch your Google account.

### Run it manually (the demo)

One command from the repo root:

```bash
npm run sync
```

It reads your Google Tasks, upserts them, and prints how many rows changed.
Keep the board open in a browser while it runs — **realtime means the cards
appear without a refresh.**

First time, set it up:

```bash
cd agents/google-tasks-sync
cp .env.example .env      # fill in the values below; .env is gitignored
npm install
```

> **Why a CLI command and not a button in the app?** The agent holds the
> `service_role` key, which bypasses RLS completely. A button in the browser
> that triggers a `service_role` job is exactly what
> [CLAUDE.md](CLAUDE.md) says not to build. It stays server-side.

The Zapier CLI isn't a project dependency — run one-off setup commands via its
scoped package (a bare `npx zapier-sdk` won't resolve):

```bash
npx -p @zapier/zapier-sdk-cli zapier-sdk login
npx -p @zapier/zapier-sdk-cli zapier-sdk create-client-credentials "todo-sync-agent" --json
```

`agents/google-tasks-sync/.env` for the demo:

| Var | Value |
|---|---|
| `SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project → Settings → API → `service_role` (secret) |
| `SYNC_TARGET_EMAIL` | the address you sign in with — the agent looks up the UUID |
| `SYNC_TARGET_USER_ID` | *(optional)* the UUID directly; wins if both are set |
| `GOOGLE_TASKS_CONNECTION_ID` | `024e9bf2-04cf-8cb5-b385-aad1f55376d2` |

**You need `ZAPIER_CREDENTIALS_*` even locally.** The token from `zapier-sdk
login` is gated behind per-action approval, so any run without a human sitting
there — a script, a cron job, this agent — is denied with:

```
ZapierApprovalError: Request denied by policy: can_execute on action/...
```

Client credentials are not approval-gated. Create them once:

```bash
npx -p @zapier/zapier-sdk-cli zapier-sdk create-client-credentials \
  "todo-sync-agent" --allowed-scopes external --json
```

and put the id and secret in `.env` (the same pair goes in the Railway service).
The secret is shown only at creation — save it then, or make a new one. Then reload the board — your Google Tasks appear
(and thanks to realtime, they pop in live).

### Deploy as a second Railway service (hourly cron)

The agent is its own service, separate from the web app:

1. In your Railway **project** → **New** → **GitHub Repo** → same repo.
2. Open the new service → **Settings** → **Root Directory** =
   `agents/google-tasks-sync`. It picks up
   [`agents/google-tasks-sync/railway.json`](agents/google-tasks-sync/railway.json):
   build with Nixpacks, start with `npm start`, **cron `0 * * * *`** (hourly),
   restart policy `NEVER` (a cron job runs once and exits).
3. Set the service's **Variables** — the four above **plus** the Zapier server
   credentials (no CLI token on Railway):
   - `ZAPIER_CREDENTIALS_CLIENT_ID`, `ZAPIER_CREDENTIALS_CLIENT_SECRET` — create
     with `npx -p @zapier/zapier-sdk-cli zapier-sdk create-client-credentials`.
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
