create table if not exists app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

drop policy if exists "Authenticated staff can read shared app state" on app_state;
drop policy if exists "Authenticated staff can insert shared app state" on app_state;
drop policy if exists "Authenticated staff can update shared app state" on app_state;

create policy "Authenticated staff can read shared app state"
on app_state for select
to authenticated
using (true);

create policy "Authenticated staff can insert shared app state"
on app_state for insert
to authenticated
with check (true);

create policy "Authenticated staff can update shared app state"
on app_state for update
to authenticated
using (true)
with check (true);
