# Green Means Ship — CI/CD and mocking

The point of this setup: **you keep vibe coding, and the robots keep checking
that yesterday's feature still works.**

You add a field, change a button, let the AI refactor something — and before any
of it reaches production, a set of little Linux boxes runs every test in this
repo. Green, it merges. Red, it doesn't. You don't have to remember to check.

None of this requires you to *write* tests. It requires you to *ask* for them,
and to keep the checks honest.

---

## The one idea worth understanding: mocking

Your code talks to things you don't own — Zapier, Google Tasks, Supabase. Real
calls to those cost money, need credentials, change other people's data, and
break when someone else's server has a bad day.

But you're not testing Zapier. **You're testing that your code turns a given
input into the right output**, over and over, as you keep changing it.

So the tests take over the network.

```
  Your code  →  the real Zapier SDK  →  a real HTTP request  →  ✋ intercepted
                                                                 ↓
                                                          a fake answer you wrote
```

The SDK is real. The request it builds is real. It just never leaves the
machine. That's what
[`agents/google-tasks-sync/tests/mocks/zapier.ts`](../agents/google-tasks-sync/tests/mocks/zapier.ts)
is: a small stand-in for Zapier's five endpoints, written by watching what the
SDK actually asks for.

Two lines make it trustworthy:

```ts
server.listen({ onUnhandledRequest: 'error' })
```

Any HTTP call the tests haven't explicitly faked **fails the run**. So "these
tests never hit Zapier" is enforced by the machine, not promised in a README.

```ts
env: { ZAPIER_CREDENTIALS_CLIENT_ID: 'test-client-id', ... }
```

Fake credentials override the real ones, so even on a laptop that's logged into
Zapier, a test run can't authenticate against the real thing.

The same trick appears three times, one layer out each time:

| Layer | Tool | Faked how |
|---|---|---|
| Node (sync agent) | [MSW](https://mswjs.io) | Intercepts `fetch` in Node |
| jsdom (React components) | MSW | Same, in a browser-shaped environment |
| Chrome (end-to-end) | Playwright `page.route` | Intercepts the page's own network |

And one place we deliberately **don't** fake: the database. A migration that has
never run against a real Postgres hasn't been tested. So CI starts a whole
Supabase in Docker, uses it, and throws it away.

---

## What runs, and when

```
push to a branch ─┬─→ CI ──────────── web · agent · edge function · browser
                  └─→ Database ────── only if supabase/** changed

open a pull request ─→ both of the above, shown as checks on the PR

merge to main ────→ Deploy (production)
                     ├─ CI            ┐ the same workflows again — this is the gate
                     ├─ Database      ┘
                     ├─ Supabase      migrations, then edge functions
                     └─ Railway       the web app

by hand ──────────→ Deploy (staging)  run CI for a branch, then deploy it for QA
```

### [`ci.yml`](../.github/workflows/ci.yml) — the green check

Four jobs, in parallel, all hermetic — no secrets, no database, no accounts:

- **Web app** — type check, [Vitest](https://vitest.dev) unit + component tests, production build.
- **Sync agent** — type check, plus the real Zapier SDK driven over a fake network.
- **Edge function** — `deno check` and `deno test` on the Supabase function.
- **Browser** — Playwright drives a real Chromium against the real production build.

Because nothing here needs credentials, it runs on every push at zero cost and
can't damage anything.

### [`database.yml`](../.github/workflows/database.yml) — the throwaway Supabase

Triggered when anything under `supabase/` changes. The runner:

1. Starts a full Supabase stack in Docker.
2. Runs **every migration from scratch**, in order, against an empty database —
   which catches the migration that only works on top of last month's state.
3. Runs `supabase db lint`.
4. Runs [`supabase/tests/rls_test.sql`](../supabase/tests/rls_test.sql), which
   proves in SQL that a second user cannot see, change, or delete your rows, and
   that a logged-out visitor sees nothing.
5. Deletes the whole thing.

**This never touches production.** That's the part worth saying out loud: when
you're on a branch, the migration runs on a database that lives for two minutes
inside GitHub's runner. Production migrations only ever run from `main`.

### [`deploy-production.yml`](../.github/workflows/deploy-production.yml) — main only

Re-runs CI *and* the database checks, then deploys in dependency order:
migrations → edge functions → web app. If one test fails, nothing deploys.

Every deploy step is skipped with a friendly notice when its credentials aren't
configured, so the pipeline stays green while you're still setting things up.

### [`deploy-staging.yml`](../.github/workflows/deploy-staging.yml) — on demand

Actions → **Deploy (staging)** → Run workflow → pick a branch. Runs that
branch's CI, then deploys it to the `staging` environment so a human (or an AI
driving a browser) can click around before it's merged.

---

## Secrets and environments

**Secrets** are encrypted values GitHub hands to a workflow at run time. They
never appear in the repo, and they're masked in the logs.

**Variables** are the same idea for values that aren't secret — like a Supabase
project ref, which is already public in your API URL.

**Environments** (`production`, `staging`) are named buckets of secrets, plus
optional rules: required reviewers, wait timers, branch restrictions. A job that
declares `environment: production` can only see production's secrets. That's how
a staging deploy is structurally incapable of touching production.

### Add these to ship for real

**Settings → Secrets and variables → Actions**

| Name | Kind | Where to get it |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Variable | Your project's ref (the subdomain in its API URL) |
| `SUPABASE_ACCESS_TOKEN` | Secret | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Secret | Project → Settings → Database |
| `RAILWAY_TOKEN` | Secret | Railway → project → Settings → Tokens (optional — see below) |
| `RAILWAY_SERVICE_WEB` | Variable | The Railway service name (optional) |

Railway also redeploys on every push to `main` through its own GitHub
integration. The `RAILWAY_TOKEN` job only matters if you want the deploy gated
behind CI instead — which is the whole point of this exercise, so it's worth
setting up.

For staging, add the same names under **Settings → Environments → staging**
pointing at a *separate* Supabase project.

### What never goes in CI

The `service_role` key. It bypasses Row Level Security entirely. It belongs in
the sync agent's Railway service and nowhere else — not in a `VITE_` var, not in
a GitHub secret used by a browser build, not in git. The tests use a fake one.

---

## Running everything locally

```bash
npm install
npm test                  # web unit + component tests (fast, watch with npm run test:watch)
npm run typecheck
npm run build

cd agents/google-tasks-sync && npm install && npm test   # the mocked Zapier run

cd supabase/functions && deno test                       # the edge function

npx playwright install chromium                          # once
npm run test:e2e                                         # real Chrome

# the database checks (needs Docker)
supabase start
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
supabase stop
```

No `psql` installed? Run it inside the container instead:

```bash
docker exec -i supabase_db_training-todo-app psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/rls_test.sql
```

---

## Working this way with an AI

The habit that makes this pay off:

- **Ask for the test with the feature**, not afterwards. "Add a due date, and
  cover it in the tests" is one prompt.
- **Watch it go red first.** A test that has never failed hasn't been shown to
  work. Break the code on purpose once — it's the fastest way to trust the suite.
  (`docs/video-run-of-show.md` has a scripted version of exactly this.)
- **Never let a test reach a real paid service.** If a new dependency shows up,
  fake it at the network layer like the others.
- **When CI goes red, read the failure before changing code.** Half the time the
  test is right and the change was wrong.
- **Keep the fakes honest.** A mock that returns a shape the real API never
  returns is worse than no test. The Zapier fake in this repo was built by
  watching the real SDK's requests, not by guessing.
