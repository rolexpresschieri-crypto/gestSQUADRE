-- Waypoint fissi sulla mappa TOC (lat/long, senza quota) — come tactical_map_points in TocAppBuild.

create table if not exists squad_map_points (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default now(),
  created_by_admin_code text,
  source text not null default 'toc_backend'
);

create index if not exists squad_map_points_event_idx on squad_map_points (event_id);

alter table squad_map_points enable row level security;

drop policy if exists "gest anon all squad_map_points" on squad_map_points;
create policy "gest anon all squad_map_points"
  on squad_map_points for all to anon using (true) with check (true);

-- Realtime (Dashboard → Replication): aggiungi squad_map_points se non presente
-- alter publication supabase_realtime add table squad_map_points;
