-- Status enum drives which lane a card is in.
create type public.todo_status as enum ('backlog', 'next', 'in_progress', 'done');

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) > 0),
  notes text,
  status public.todo_status not null default 'backlog',
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index todos_user_status_position_idx
  on public.todos (user_id, status, position);

-- Default-deny: RLS on, then per-user policies. A user only ever touches their
-- own rows. This holds even at the anonymous-auth stage.
alter table public.todos enable row level security;

create policy "Users can select their own todos"
  on public.todos for select
  using (auth.uid() = user_id);

create policy "Users can insert their own todos"
  on public.todos for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own todos"
  on public.todos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own todos"
  on public.todos for delete
  using (auth.uid() = user_id);

-- Keep updated_at fresh on every change.
create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger todos_set_updated_at
  before update on public.todos
  for each row
  execute function public.set_updated_at();

-- Realtime over websockets for the todos table. REPLICA IDENTITY FULL so DELETE
-- payloads carry the old row (incl. user_id) for the client-side filter.
alter table public.todos replica identity full;
alter publication supabase_realtime add table public.todos;
