-- Log push TOC + ruolo campo golf + operatore GOLF_TORINO
-- Eseguire su Supabase (SQL Editor).

-- Log notifiche push inviate dal TOC alle squadre
create table if not exists toc_push_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  session_id uuid references squad_sessions(id) on delete set null,
  squad_id uuid references squads(id) on delete set null,
  squad_code text,
  squad_name text,
  admin_code text not null,
  title text not null,
  body text not null,
  is_alarm boolean not null default true,
  fcm_message_id text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists toc_push_logs_event_created_idx
  on toc_push_logs (event_id, created_at desc);

-- Ruolo "campo" per gestione waypoint (es. golf Torino)
alter table toc_admins drop constraint if exists toc_admins_role_check;
alter table toc_admins add constraint toc_admins_role_check
  check (role in ('admin', 'viewer', 'campo'));

insert into toc_admins (admin_code, admin_name, password_hash, role, is_enabled, golf_course_id)
select
  'GOLF_TORINO',
  'Campo Golf Torino',
  'gt1234',
  'campo',
  true,
  (select id from golf_courses where course_code = 'golf_torino' limit 1)
where not exists (select 1 from toc_admins where admin_code = 'GOLF_TORINO')
  and exists (select 1 from golf_courses where course_code = 'golf_torino');

alter table toc_push_logs enable row level security;

drop policy if exists "gest anon all toc_push_logs" on toc_push_logs;
create policy "gest anon all toc_push_logs"
  on toc_push_logs for all to anon using (true) with check (true);
