-- External source id (e.g. Google Task id). Nullable so existing rows stay null.
alter table public.todos add column external_id text;

-- One row per (user, external source id). Partial so the many existing rows
-- with NULL external_id are unaffected.
create unique index todos_user_external_id_key
  on public.todos (user_id, external_id)
  where external_id is not null;

-- Bulk upsert used by the sync agent. PostgREST's .upsert() cannot infer a
-- partial unique index in its ON CONFLICT, so we do it here with the matching
-- predicate. SECURITY INVOKER (default): callers are still bound by RLS; only
-- the service_role (which bypasses RLS) is granted EXECUTE, so the agent can
-- write rows for the target user while nobody else can abuse it.
create or replace function public.sync_external_todos(
  p_user_id uuid,
  p_tasks jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  insert into public.todos (user_id, external_id, title, status)
  select
    p_user_id,
    elem->>'external_id',
    elem->>'title',
    (elem->>'status')::public.todo_status
  from jsonb_array_elements(p_tasks) as elem
  where coalesce(elem->>'external_id', '') <> ''
    and coalesce(elem->>'title', '') <> ''
  on conflict (user_id, external_id) where external_id is not null
  do update set
    title = excluded.title,
    status = excluded.status,
    updated_at = now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.sync_external_todos(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_external_todos(uuid, jsonb) to service_role;
