-- ---------------------------------------------------------------------------
-- Row Level Security, proved.
--
-- CLAUDE.md's definition of done says "an incognito window / a second user
-- cannot see my data". This file checks that with SQL instead of trusting it,
-- and CI runs it against a throwaway Supabase that lives for the length of one
-- GitHub Actions job (see .github/workflows/database.yml).
--
-- Run locally:
--   supabase start
--   supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
--
-- Every check raises an exception on failure, so a red run is a failed job.
-- Everything happens inside a transaction that is rolled back at the end.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

begin;

-- Two people who have never met.
insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@example.com');

-- --------------------------------------------------------------------------
-- 0. The table is locked down at all.
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.todos'::regclass and relrowsecurity
  ) then
    raise exception 'FAIL: RLS is not enabled on public.todos';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'todos') < 4 then
    raise exception 'FAIL: expected select/insert/update/delete policies on public.todos';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 1. Alice writes two cards.
-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.todos (title, status, position) values ('Alice: buy milk', 'backlog', 1);
insert into public.todos (title, status, position) values ('Alice: ship video', 'done', 1);

do $$
declare visible int;
begin
  select count(*) into visible from public.todos;
  if visible <> 2 then
    raise exception 'FAIL: Alice should see her own 2 rows, saw %', visible;
  end if;
end $$;

-- She cannot write a row that belongs to Bob, even deliberately.
do $$
begin
  begin
    insert into public.todos (user_id, title, status, position)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'Planted in Bob''s board', 'backlog', 1);
    raise exception 'FAIL: the insert policy let Alice write a row for Bob';
  exception
    when insufficient_privilege then null;  -- expected: RLS refused it
  end;
end $$;

-- --------------------------------------------------------------------------
-- 2. Bob sees nothing of Alice's, and cannot touch it.
-- --------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare visible int;
begin
  select count(*) into visible from public.todos;
  if visible <> 0 then
    raise exception 'FAIL: Bob can see % of Alice''s rows', visible;
  end if;
end $$;

do $$
declare touched int;
begin
  -- RLS makes these no-ops rather than errors: rows he cannot see, he cannot
  -- change. Zero affected rows is the pass condition.
  update public.todos set title = 'Bob was here';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: Bob updated % of Alice''s rows', touched;
  end if;

  delete from public.todos;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: Bob deleted % of Alice''s rows', touched;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 3. A logged-out visitor (the incognito window) sees nothing.
-- --------------------------------------------------------------------------
reset role;
set local role anon;
set local request.jwt.claims = '';

do $$
declare visible int;
begin
  begin
    select count(*) into visible from public.todos;
  exception when insufficient_privilege then
    -- Even better than RLS hiding the rows: anon has no grant on the table at
    -- all (see the grant migration). Either outcome means "sees nothing".
    visible := 0;
  end;

  if visible <> 0 then
    raise exception 'FAIL: an anonymous visitor can see % rows', visible;
  end if;
end $$;

-- And the grants themselves are what we think they are.
do $$
begin
  if has_table_privilege('anon', 'public.todos', 'select') then
    raise exception 'FAIL: anon has SELECT on public.todos';
  end if;
  if not has_table_privilege('authenticated', 'public.todos', 'select') then
    raise exception 'FAIL: authenticated cannot SELECT public.todos — the app is broken';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 4. Alice's data is still there — RLS hid it, it did not eat it.
-- --------------------------------------------------------------------------
reset role;

do $$
declare total int;
begin
  select count(*) into total from public.todos;
  if total <> 2 then
    raise exception 'FAIL: expected Alice''s 2 rows to still exist, found %', total;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 5. The sync agent's RPC is service_role only.
--    It bypasses RLS by design, so a logged-in user must not be able to call it
--    and write rows onto somebody else's board.
-- --------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated', 'public.sync_external_todos(uuid, jsonb)', 'execute') then
    raise exception 'FAIL: authenticated can execute sync_external_todos';
  end if;
  if has_function_privilege('anon', 'public.sync_external_todos(uuid, jsonb)', 'execute') then
    raise exception 'FAIL: anon can execute sync_external_todos';
  end if;
  if not has_function_privilege('service_role', 'public.sync_external_todos(uuid, jsonb)', 'execute') then
    raise exception 'FAIL: service_role cannot execute sync_external_todos';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 6. Realtime is actually publishing todos (the two-tab requirement), and
--    DELETE payloads carry the old row so the other tab knows what vanished.
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todos'
  ) then
    raise exception 'FAIL: public.todos is not in the supabase_realtime publication';
  end if;

  if (select relreplident from pg_class where oid = 'public.todos'::regclass) <> 'f' then
    raise exception 'FAIL: public.todos needs REPLICA IDENTITY FULL for DELETE payloads';
  end if;
end $$;

rollback;

\echo '✓ RLS checks passed'
