# CLAUDE.md — {{APP_NAME}} ({{ONE_LINE_DESCRIPTION}})

The "opinion" you bring to a vibe-coded project so the AI builds things
*consistently* and *securely*. Drop this in the root of a new repo and start from
it. Fill in every `{{PLACEHOLDER}}` before you begin.

## What we're building

**{{APP_NAME}}** — {{WHAT_IT_IS. Be concrete: who the user is, what the core
object is, and the one interaction that must feel instant.}}

Grow into it in steps — static first, then a database, then auth, then (optional)
an agent. Don't build it all at once.

## Stack (defaults — change deliberately, not by accident)

- **Frontend:** Vite + React + TypeScript. (The `VITE_` env prefix matters — see
  Security.)
- **Database + auth + realtime:** Supabase.
- **Hosting:** {{HOST — default Railway}}, deploying from GitHub on every push.
  HTTPS is free.
- **Outside integrations (if any):** the Zapier SDK.

## Non-negotiable rules

### Security (start here, every time)

- **Nothing is unhackable.** Risk scales with complexity — keep each step as
  simple as it can be. Obscurity is never security.
- **Never roll your own auth.** Use Supabase Auth.
- **Row Level Security (RLS) is ON for every table that holds user data.**
  Default-deny, then policies so a user can only touch their **own** rows
  (`user_id = auth.uid()`). Never ship a user-data table with RLS off.
- **Env var discipline:**
  - Only `VITE_`-prefixed values reach the browser — treat them as **public**.
  - The Supabase **anon / publishable** key is fine client-side.
  - The Supabase **`service_role`** key is **server-only** — never in client code,
    never in a `VITE_` var, never committed.
  - `.env` is gitignored; ship a `.env.example` with placeholders only.
- **HTTPS only.**

### Testing & CI (a feature isn't done until it's checked)

- **Every feature arrives with its tests** — same prompt, same commit. If you
  skip them, say why.
- **Never let a test call a real outside service.** Fake it at the *network*
  layer (MSW in Node/jsdom, route interception in the browser) so our real code
  and the real SDK still run. Set `onUnhandledRequest: 'error'` so an un-faked
  call fails the run instead of quietly reaching the internet.
- **Build the fake from the real contract** — watch what the SDK actually
  requests. Don't invent a response shape.
- **Keep rules in pure functions** (validation, ordering, status mapping): input
  in, output out, no I/O. Those are the cheap, high-value tests.
- **Lots of unit tests, some component tests, a handful of end-to-end.**
- **Migrations run against a real, disposable database in CI** — never against
  production from a branch. Production migrations happen on the main branch only.
- **Security rules get tests too** — RLS isolation checked in SQL on every push.
- **Red before green:** when adding a test for a fix, show it failing first.
- **Nothing deploys unless CI is green**, and deploy steps skip cleanly with a
  note when their credentials aren't configured yet.

### Data model

`{{TABLE}}` table, minimum:

| column       | notes                                                        |
|--------------|--------------------------------------------------------------|
| `id`         | uuid, pk                                                     |
| `user_id`    | uuid, fk → `auth.users`, default `auth.uid()`                |
| `{{FIELD}}`  | {{your required field, e.g. title text not null}}            |
| `{{FIELD}}`  | {{optional fields}}                                          |
| `status`     | enum: {{`state_a \| state_b \| state_c`}} (if you have states)|
| `position`   | int/float, ordering within a group (if you sort/drag)        |
| `created_at` | timestamptz, default now()                                   |
| `updated_at` | timestamptz                                                  |

- RLS policies cover **select / insert / update / delete**, all gated on
  `user_id = auth.uid()`.

### Auth flow (two phases, on purpose)

1. **Phase 1 — anonymous auth.** Just a session, so we can build fast.
2. **Phase 2 — real accounts.** Open registration, **magic links**, no separate
   email-verification step (tighten later if you want). When you move to real
   accounts, **remove the anonymous auth**.

### Realtime

- Use **Supabase Realtime (websockets)** so a change in one tab shows up in the
  others. Subscribe filtered to the current user. Optimistic UI is fine, but
  reconcile from the realtime event so tabs converge.

## Hosting & deploy

- Code lives in **GitHub** so the host can grab it.
- **{{HOST}}** deploys on every push to `main`. First time: create project → pick
  the repo → deploy. Custom domain via Cloudflare is optional and comes later.

## Outside integrations — the agent (optional finale)

- A **small, separate service** (its own service) using the **Zapier SDK** to
  pull from a system you already own (e.g. {{SOURCE_SYSTEM}}) and upsert rows into
  `{{TABLE}}` for **your** user.
- **One agent per user, scoped to that user's access.** No shared multi-tenant
  bot. Runs server-side; credentials stay server-side; the `service_role` key
  never reaches the browser.

## How to work with me (the AI)

- Apply the rules above **by default**.
- Prefer the **simplest thing that is still secure**.
- On any security choice you're unsure about, pick the **safer** option and
  **flag it** rather than guessing quietly. Ask before deviating from a security
  rule.

## Definition of done (check before calling a feature finished)

- [ ] RLS verified: an incognito window / a second user **cannot** see my data.
- [ ] No secrets in the client bundle or in git (`service_role` is server-only).
- [ ] Works across two tabs (realtime sync).
- [ ] Tests added or updated, and **CI is green** — including migrations applied
      to a throwaway database.
- [ ] No test reaches a real outside service.
- [ ] Deploys clean over HTTPS.
