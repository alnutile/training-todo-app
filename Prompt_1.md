Follow CLAUDE.md in this repo.

This is Step 1 — the "static hello world" stage. Keep it simple. No database
and no auth yet.

Build a simple STATIC to-do list as a Vite + React + TypeScript app:
- A single page titled "To-Do".
- An input + "Add" button to add a task.
- A list of tasks; each has a checkbox to mark done (done = struck through)
  and a delete button.
- Persist tasks in the browser with localStorage so a refresh keeps them —
  that's fine for now; we move to a real database in a later step.
- Clean, minimal styling. No backend.

Then set it up to DEPLOY TO RAILWAY from GitHub:
- Init a git repo and make the first commit.
- Add a .gitignore (node_modules, dist, .env) and a .env.example placeholder
  for later.
- Add the config Railway needs to build the Vite app and serve the static
  dist/ output on the port Railway provides ($PORT). Simplest that works is
  fine — e.g. a start script like `vite preview --host 0.0.0.0 --port $PORT`,
  or a Dockerfile if you prefer.
- Give me the exact click-by-click for the first-time setup: create the
  GitHub repo and push, then create the Railway project, point it at the repo,
  and deploy.
- Confirm HTTPS is on by default.

Stop once it's deployed and reachable. Do NOT add a database, auth, the four
lanes, drag-and-drop, or realtime yet — those are later prompts.