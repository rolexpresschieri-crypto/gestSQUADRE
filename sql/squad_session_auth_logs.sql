-- Log login / logout squadra (app mobile -> Supabase -> TOC Log evento)
-- Eseguire su Supabase dopo schema_v1.sql

create table if not exists squad_session_auth_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  session_id uuid not null references squad_sessions(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete cascade,
  squad_code text not null,
  squad_name text not null,
  action text not null check (action in ('login', 'logout')),
  created_at timestamptz not null default now()
);

create index if not exists squad_session_auth_logs_event_created_idx
  on squad_session_auth_logs (event_id, created_at desc);

alter table squad_session_auth_logs enable row level security;

drop policy if exists "gest anon all squad_session_auth_logs" on squad_session_auth_logs;
create policy "gest anon all squad_session_auth_logs"
  on squad_session_auth_logs for all to anon using (true) with check (true);
