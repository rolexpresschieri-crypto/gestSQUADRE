-- Log reset forzato missioni TOC (push / inoltro GT) dall'operatore in dashboard.
-- Distinto dal reset notifica premuto dalla squadra su app mobile.

create table if not exists toc_mission_force_dismiss_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  mission_kind text not null check (mission_kind in ('toc_push', 'gt_notify')),
  squad_code text not null,
  squad_name text,
  admin_code text not null,
  source_ref text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists toc_mission_force_dismiss_logs_event_created_idx
  on toc_mission_force_dismiss_logs (event_id, created_at desc);

alter table toc_mission_force_dismiss_logs enable row level security;

drop policy if exists "gest anon all toc_mission_force_dismiss_logs" on toc_mission_force_dismiss_logs;
create policy "gest anon all toc_mission_force_dismiss_logs"
  on toc_mission_force_dismiss_logs for all to anon using (true) with check (true);

comment on table toc_mission_force_dismiss_logs is
  'Reset forzato da operatore TOC su missioni attive (non reset mobile squadra).';
