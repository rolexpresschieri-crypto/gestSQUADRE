-- Vie percorribili (.trk Garmin / TwoNav) per campo golf
-- Eseguire su Supabase dopo golf_courses_campo.sql

create table if not exists map_routes (
  id uuid primary key default gen_random_uuid(),
  golf_course_id uuid not null references golf_courses(id) on delete cascade,
  route_code text not null,
  route_name text,
  color_hex text not null default '#079B42',
  points jsonb not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint map_routes_points_array check (jsonb_typeof(points) = 'array'),
  constraint map_routes_unique_code unique (golf_course_id, route_code)
);

create index if not exists map_routes_course_idx on map_routes (golf_course_id, route_code);

-- Assegnazione via attiva per sessione squadra (invii indipendenti)
create table if not exists squad_route_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references squad_sessions(id) on delete cascade,
  route_id uuid not null references map_routes(id) on delete restrict,
  target_waypoint_id uuid references squad_map_points(id) on delete set null,
  assigned_by_admin_code text not null,
  assigned_at timestamptz not null default now(),
  cleared_at timestamptz
);

create index if not exists squad_route_assignments_session_idx
  on squad_route_assignments (session_id, assigned_at desc);

create unique index if not exists squad_route_assignments_one_active
  on squad_route_assignments (session_id)
  where cleared_at is null;

alter table map_routes enable row level security;
alter table squad_route_assignments enable row level security;

drop policy if exists "gest anon all map_routes" on map_routes;
create policy "gest anon all map_routes"
  on map_routes for all to anon using (true) with check (true);

drop policy if exists "gest anon all squad_route_assignments" on squad_route_assignments;
create policy "gest anon all squad_route_assignments"
  on squad_route_assignments for all to anon using (true) with check (true);
