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
