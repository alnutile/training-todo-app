# CLAUDE.md — Vibe Coding With Confidence (To-Do build)

This file is the "opinion" you bring to a vibe coded project so the AI builds
things *consistently* and *securely* — the stuff Lovable/Replit bake in for you,
written down so you get it on your own terms. Drop this in the root of a new repo
and start from it.

Companion to the post **Vibe Coding With Confidence**, and to [**Green Means
Ship: CI/CD for Vibe Coders Who Are Sick of Things
Breaking**](https://chat.dailyai.studio/posts/green-means-ship-cicd-with-confidence)
for the testing and CI rules below.

## What we're building

A **real** to-do board — not a browser-session toy:

- Four lanes: **Backlog → Next → In Progress → Done**.
- Drag a card between lanes and it **persists immediately**.
- Open a second tab, move a card, and it updates there too (**realtime**).
- Data is **per user, behind a login**. My tasks are mine.

We grow into this in steps — static first, then a database, then auth, then an
agent. Don't build it all at once.

## Stack (these are defaults — change them deliberately, not by accident)

- **Frontend:** Vite + React + TypeScript. (The `VITE_` env prefix matters — see
  Security.)
- **Database + auth + realtime:** Supabase.
- **Hosting:** Railway, deploying from GitHub on every push. HTTPS is free.
- **Outside integrations:** the Zapier SDK (the sync agent at the end).

## Non-negotiable rules

### Security (start here, every time)

- **Nothing is unhackable.** Risk scales with complexity, so keep each step as
  simple as it can be. A static file is safe; a multi-user app needs care.
- **Never roll your own auth.** Use Supabase Auth.
- **Row Level Security (RLS) is ON for every table that holds user data.**
  Default-deny, then add policies so a user can only touch their **own** rows
  (`user_id = auth.uid()`). Never ship a user-data table with RLS off.
- **Env var discipline:**
  - Only `VITE_`-prefixed values reach the browser — treat them as **public**.
  - The Supabase **anon / publishable** key is fine client-side.
  - The Supabase **`service_role`** key is **server-only**. Never in client code,
    never in a `VITE_` var, never committed.
  - `.env` is gitignored; ship a `.env.example` with placeholder keys only.
- **HTTPS only** (Railway gives it to you — don't undo it).

### Testing & CI (a feature isn't done until it's checked)

- **Every feature arrives with its tests.** Same prompt, same commit — not "add
  tests later". If I ask for a change and you don't add or update a test, say why.
- **Never let a test call a real outside service.** Fake it at the *network*
  layer (MSW in Node/jsdom, Playwright routes in the browser) so our real code
  and the real SDK still run — we're testing our code, not theirs. Set
  `onUnhandledRequest: 'error'` so an un-faked call fails the run instead of
  quietly reaching the internet. This is a money and blast-radius rule as much
  as a speed one.
- **Build the fake from the real contract.** Watch what the SDK actually
  requests; don't invent a response shape. A mock that returns something the
  real API never returns is worse than no test.
- **Keep pure logic pure.** Rules (validation, ordering, status mapping,
  reconciliation) go in plain functions that take input and return output. Those
  are the cheap tests, and they're where most of the value is.
- **The pyramid:** lots of fast unit tests, some component tests, a handful of
  end-to-end. Don't reach for a browser test when a function test would do.
- **Migrations run against a real, disposable database in CI** — never against
  production from a branch. Production migrations happen on `main` only.
- **Security rules get tests too.** RLS isolation is checked in SQL on every
  push, not by opening an incognito window and hoping.
- **Red before green.** When you add a test for a fix, show it failing on the
  old code first.
- **CI must be green before anything deploys**, and deploy steps skip cleanly
  (with a note) when their credentials aren't configured yet.

Details and the workflow map: `docs/ci-cd.md`.

### Data model

`todos` table, minimum:

| column      | notes                                              |
|-------------|----------------------------------------------------|
| `id`        | uuid, pk                                           |
| `user_id`   | uuid, fk → `auth.users`, default `auth.uid()`      |
| `title`     | text, required                                     |
| `notes`     | text, optional                                     |
| `status`    | enum: `backlog \| next \| in_progress \| done`     |
| `position`  | int/float, ordering within a lane                  |
| `created_at`| timestamptz, default now()                         |
| `updated_at`| timestamptz                                        |

- `status` drives which lane a card is in; dragging changes `status` (and
  `position`).
- RLS policies cover **select / insert / update / delete**, all gated on
  `user_id = auth.uid()`.

### Auth flow (two phases, on purpose)

1. **Phase 1 — anonymous auth.** Just a session, so we can build the board fast.
2. **Phase 2 — real accounts.** Open registration, **magic links**, no separate
   email-verification step (tighten later — even invite-only — if you want). When
   you move to real accounts, **remove the anonymous auth** to keep it simple.

### Realtime

- Use **Supabase Realtime (websockets)** on the `todos` table so a move in one
  tab shows up in the others. Subscribe filtered to the current user.
- Optimistic UI is fine, but reconcile from the realtime event so tabs converge.

## Hosting & deploy

- Code lives in **GitHub** — that's just where the code sits so the host can grab
  it. The AI can do most of the Git steps; you don't need to be a Git wizard.
- **Railway** deploys on every push to `main`. First time: create project → pick
  the repo → deploy.
- Custom domain via **Cloudflare** is optional and comes later.

## The Zapier SDK agent (the finale)

- A **small, separate service** (its own Railway service) that uses the **Zapier
  SDK** to pull from a system *you already own* — e.g. **Google Tasks** — and
  upsert rows into `todos` for **your** user.
- **One agent per user, scoped to that user's access.** Do **not** build a shared
  multi-tenant bot — the whole point is each person wires their own agent to their
  own stuff.
- The agent runs server-side and keeps its credentials server-side. It writes with
  a server-side Supabase client or an authenticated user session — the
  `service_role` key never reaches the browser.

## How to work with me (the AI)

- Apply the rules above **by default**.
- Prefer the **simplest thing that is still secure**.
- On any security choice you're unsure about, pick the **safer** option and
  **flag it** rather than guessing quietly.
- Ask before deviating from the security rules.

## Definition of done (check before calling a feature finished)

- [ ] RLS verified: an incognito window / a second user **cannot** see my data.
      (`supabase/tests/rls_test.sql` proves this on every push.)
- [ ] No secrets in the client bundle or in git (`service_role` is server-only).
- [ ] Works across two tabs (realtime sync).
- [ ] Tests added or updated, and **CI is green** — including the migration run
      against a throwaway database.
- [ ] No test reaches a real outside service.
- [ ] Deploys clean on Railway over HTTPS.
