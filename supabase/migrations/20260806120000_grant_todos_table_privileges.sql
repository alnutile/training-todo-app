-- Table privileges, written down instead of assumed.
--
-- Supabase hands `anon` and `authenticated` blanket grants on the public schema
-- by default, which means the app worked without anyone ever stating what it
-- needed. That default is not part of our migrations, so a fresh database (a
-- local `supabase start`, or the throwaway one CI spins up) doesn't have it, and
-- "it works in production" stops being something we can verify.
--
-- Two layers, both required, doing different jobs:
--   GRANT decides whether a role may touch the table at all.
--   RLS   decides which rows it sees once it may.
--
-- supabase/tests/rls_test.sql checks both on every push.

-- Signed-in users work with their own rows; RLS gates which ones those are.
grant select, insert, update, delete on public.todos to authenticated;

-- Logged-out visitors have no business in this table. RLS already returns them
-- nothing, but there's no reason to hand out the privilege in the first place —
-- default-deny, per CLAUDE.md.
revoke all on public.todos from anon;

-- The sync agent connects as service_role, which bypasses RLS by design. It
-- still needs the table grant, and it already has the EXECUTE grant on
-- sync_external_todos from the previous migration.
grant select, insert, update, delete on public.todos to service_role;
