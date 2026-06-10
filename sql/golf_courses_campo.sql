-- Campi golf + legame login campo / squadre / waypoint
-- Eseguire su Supabase dopo schema_v1.sql (e event_logs_and_campo.sql se già fatto).

create table if not exists golf_courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  course_name text not null,
  created_at timestamptz not null default now()
);

insert into golf_courses (course_code, course_name)
select 'golf_torino', 'Campo Golf Torino'
where not exists (select 1 from golf_courses where course_code = 'golf_torino');

alter table toc_admins add column if not exists golf_course_id uuid references golf_courses(id) on delete set null;
alter table squads add column if not exists golf_course_id uuid references golf_courses(id) on delete set null;
alter table squad_map_points add column if not exists golf_course_id uuid references golf_courses(id) on delete set null;

create index if not exists squads_golf_course_idx on squads (golf_course_id);
create index if not exists squad_map_points_golf_course_idx on squad_map_points (golf_course_id);

-- Ruolo campo (se non già applicato)
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
where not exists (select 1 from toc_admins where admin_code = 'GOLF_TORINO');

update toc_admins
set
  role = 'campo',
  golf_course_id = (select id from golf_courses where course_code = 'golf_torino' limit 1)
where admin_code = 'GOLF_TORINO';

alter table golf_courses enable row level security;

drop policy if exists "gest anon all golf_courses" on golf_courses;
create policy "gest anon all golf_courses"
  on golf_courses for all to anon using (true) with check (true);
