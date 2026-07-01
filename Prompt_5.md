Follow CLAUDE.md. Two parts. Do PART 1 and then STOP; I'll hand you a connection
ID before PART 2.

=== PART 1 — Set up the Zapier SDK (keep this tight) ===
- Run `pwd` and confirm we're in the training-todo-app repo; set up here.
- Detect the package manager (pnpm-lock.yaml / yarn.lock / bun.lockb /
  package-lock.json; else npm) and use it for all installs.
- Confirm Node >= 20 (`node -v`); if not, tell me and stop.
- Install: @zapier/zapier-sdk
- Install dev deps: @zapier/zapier-sdk-cli @types/node typescript tsx
- Optional context: `npx skills add zapier/sdk -y` (skip if it fails).
- Authenticate: I already have a Zapier account. If we're in a remote environment,
  use `npx zapier-sdk login --non-interactive --headless` and show me the login
  URL / wait for the OAuth callback; otherwise `--non-interactive`.
- List my connections: `npx zapier-sdk list-connections --owner me --json`.
  Show them as a table (ID, App Key, Expired) and CONFIRM I have a Google Tasks
  connection. Report its connection ID.

Then STOP and show me the table. Wait for me to confirm the Google Tasks
connection ID before PART 2. (Skip the Slack test and the "ideas to explore" tail
entirely — I have a specific build.)

=== PART 2 — Build my Google Tasks sync agent ===
Goal: a per-user AGENT, separate from the web app, that pulls MY Google Tasks into
the todos table so a task I make on my phone shows up on the board.

- Make an `agents/` subfolder. Put the agent there as its own deployable I can push
  to Railway as a SECOND service (own start command), run on a cron every hour
  (schedule "0 * * * *"). I'll also run it manually for the demo.
- Discover the correct Google Tasks app key + action keys + input shape using the
  CLI (e.g. `npx zapier-sdk list-actions <googleTasksAppKey>`) — don't guess them.
  Use the SDK's runAction with my Google Tasks connection ID to read all my tasks.
- Upsert them into the todos table WITHOUT duplicates on repeat runs:
  - Add a nullable `external_id` (text) column to todos (existing rows stay null).
  - Add a partial unique index on (user_id, external_id) WHERE external_id IS NOT NULL.
  - Upsert each Google Task with external_id = the Google Task id; ON CONFLICT
    update title/status instead of inserting.
  - Status map: incomplete -> "backlog", completed -> "done". Add/update only —
    do NOT delete todos missing from Google (out of scope).

Security (per CLAUDE.md — server-side agent, verify):
- Agent auth to Supabase uses the SERVICE_ROLE key from a Railway env var
  (SUPABASE_SERVICE_ROLE_KEY). Server-only: never in the web app, never in a VITE_
  var, never committed. Add a placeholder to .env.example.
- service_role bypasses RLS, so the agent MUST set user_id explicitly to the
  target user on every row (take it from an env var = my account for the demo).
  Note in the README: multi-user = each person runs their own agent with their own
  user_id + their own Google connection.

Deliver: the SQL migration (external_id + index), the agent code, the Railway
second-service + cron setup, and how to run it manually for the demo.