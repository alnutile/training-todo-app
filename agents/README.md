# agents/

Standalone, server-side sync agents — **separate from the web app**. Each agent
is its own self-contained deployable in its own subfolder:

```
agents/
  google-tasks-sync/   # Google Tasks -> todos (this one)
  <source>-sync/       # future: ms-todo-sync, anydo-sync, …
```

**Convention — one folder = one agent = one Railway service:**

- Named by its **source system** (`google-tasks-sync`), not the destination —
  every agent feeds the same `todos` table, so the source is what distinguishes
  them.
- Self-contained: its own `package.json`, `railway.json`, `tsconfig.json`, and
  `.env.example`. No shared dependencies with the web app or other agents.
- Per-user: an agent writes rows for a single `SYNC_TARGET_USER_ID` from its own
  source connection. Multi-user = each person runs their own instance. There is
  no shared multi-tenant bot (see CLAUDE.md).
- Server-only secrets: talks to Supabase with the `service_role` key from an env
  var — never a `VITE_` var, never committed.

Deploy each as a second/third/… Railway service with **Root Directory** set to
that agent's folder. See the agent's own README section for env vars and the
manual run.
