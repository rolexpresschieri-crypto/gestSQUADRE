-- Flusso eventi mobile ↔ TOC: inviato → notifica chiusa (reset squadra) → chiuso (TOC)
-- Eseguire su Supabase dopo event_logs_and_campo.sql e toc_mission_logs.sql

alter table toc_push_logs
  add column if not exists mobile_dismissed_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by text;

create table if not exists squad_mobile_dismiss_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  session_id uuid not null references squad_sessions(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete cascade,
  squad_code text not null,
  squad_name text not null,
  panel_message text,
  created_at timestamptz not null default now()
);

create index if not exists squad_mobile_dismiss_logs_event_created_idx
  on squad_mobile_dismiss_logs (event_id, created_at desc);

alter table squad_mobile_dismiss_logs enable row level security;

drop policy if exists "gest anon all squad_mobile_dismiss_logs" on squad_mobile_dismiss_logs;
create policy "gest anon all squad_mobile_dismiss_logs"
  on squad_mobile_dismiss_logs for all to anon using (true) with check (true);
