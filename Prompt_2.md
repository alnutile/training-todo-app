Follow CLAUDE.md in this repo. This is Step 2 — make the to-do list REAL with
a database, but keep auth simple for now (anonymous). No login screen yet.

Replace the localStorage to-do list with Supabase:
- Use Supabase ANONYMOUS authentication so I get a session automatically (no
  login UI yet).
- Create a `todos` table per CLAUDE.md (id, user_id default auth.uid(), title,
  notes, status enum [backlog|next|in_progress|done], position, created_at,
  updated_at).
- Turn RLS ON for the table now, with policies gated on user_id = auth.uid()
  for select/insert/update/delete — even at the anonymous stage.
- Build the board UI: four lanes — Backlog, Next, In Progress, Done.
- Add a task into a lane; drag a card between lanes and it PERSISTS immediately
  (updates status + position in the database).
- Use Supabase Realtime (websockets) on the todos table so if I have a second
  tab open and move a card, it updates there too.
- Env discipline: only the Supabase URL + anon/publishable key go in VITE_ vars;
  never the service_role key. Update .env.example with placeholders.

Then redeploy to Railway (set the VITE_ env vars in the Railway project) and
confirm it still works live over HTTPS.

Stop here. Do NOT add real accounts / magic links / login yet — that's the
next step. Keep anonymous auth for now.