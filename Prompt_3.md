Follow CLAUDE.md in this repo. This is Step 3 — swap the anonymous auth from
Step 2 for REAL user accounts. Everything else (the four-lane board, drag-to-
persist, realtime) stays working.

Auth changes (Supabase):
- Turn ON email/password registration with sign-up OPEN to anyone.
- Also allow passwordless MAGIC LINK sign-in.
- Do NOT require email confirmation/verification (set this in Supabase Auth
  settings) — keep it simple; note in the README that I can tighten this later.
- REMOVE the anonymous auth feature entirely.

UI:
- Add a login / sign-up screen with: email+password, and a "send me a magic
  link" option.
- Gate the board behind a session: if I'm not logged in, I see the login screen,
  not the to-do board.
- Add a visible "Sign out" button once logged in.

Security (per CLAUDE.md — verify, don't assume):
- Confirm RLS is still ON for the todos table and the policies are user_id =
  auth.uid() for select/insert/update/delete, so a logged-in user only ever sees
  their own todos.
- Still only the Supabase URL + anon/publishable key in VITE_ vars. No
  service_role key anywhere client-side or in git.

Config gotcha — handle this explicitly:
- Set the Supabase Auth "Site URL" and "Redirect URLs" to BOTH my local dev URL
  and my deployed Railway/Cloudflare domain, so magic links and post-login
  redirects work in dev AND in production. Tell me exactly where to set these.

Then redeploy to Railway and confirm: I can register, log in (password AND magic
link), see only my own todos, sign out, and that an incognito window is bounced
to the login screen.

Note: todos created earlier under anonymous users won't belong to a new account
— that's expected for the demo.