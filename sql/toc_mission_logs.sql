-- Log missioni TOC (invio squadra → target + via TRK) e chiusura «Fine evento»
-- Eseguire su Supabase dopo event_logs_and_campo.sql e map_routes.sql

alter table toc_push_logs
  add column if not exists route_code text,
  add column if not exists target_waypoint_label text;

create table if not exists toc_mission_close_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  session_id uuid references squad_sessions(id) on delete set null,
  squad_id uuid references squads(id) on delete set null,
  squad_code text,
  squad_name text,
  route_code text,
  target_waypoint_label text,
  admin_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists toc_mission_close_logs_event_created_idx
  on toc_mission_close_logs (event_id, created_at desc);

alter table toc_mission_close_logs enable row level security;

drop policy if exists "gest anon all toc_mission_close_logs" on toc_mission_close_logs;
create policy "gest anon all toc_mission_close_logs"
  on toc_mission_close_logs for all to anon using (true) with check (true);
