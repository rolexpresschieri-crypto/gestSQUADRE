-- gestSQUADRE — schema Supabase dedicato (progetto SEPARATO da TocAppBuild)
-- Eseguire su un nuovo progetto Supabase, non sul DB TOC produzione.

create extension if not exists pgcrypto;

-- Evento / esercitazione attiva (una sola is_active=true consigliata)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Anagrafica squadre (password_hash: stesso uso di TOC pin_hash, confronto lato app)
create table if not exists squads (
  id uuid primary key default gen_random_uuid(),
  squad_code text not null unique,
  squad_name text not null,
  password_hash text not null,
  map_color text default '#079B42',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Operatori TOC
create table if not exists toc_admins (
  id uuid primary key default gen_random_uuid(),
  admin_code text not null unique,
  admin_name text not null,
  password_hash text not null,
  role text not null default 'admin' check (role in ('admin', 'viewer')),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Sessione squadra online (solo ultima posizione GPS, no traccia)
create table if not exists squad_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete restrict,
  is_online boolean not null default true,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  last_latitude double precision,
  last_longitude double precision,
  last_accuracy double precision,
  last_fix_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists squad_sessions_one_online_per_squad
  on squad_sessions (event_id, squad_id)
  where (is_online = true);

create index if not exists squad_sessions_event_idx on squad_sessions (event_id);

-- Token FCM per push TOC → cellulare
create table if not exists squad_fcm_tokens (
  session_id uuid primary key references squad_sessions(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete cascade,
  fcm_token text not null,
  updated_at timestamptz not null default now()
);

-- Allarmi squadra → TOC (realtime + storico)
create table if not exists squad_alarms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  session_id uuid not null references squad_sessions(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete restrict,
  squad_code text not null,
  squad_name text not null,
  message text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text
);

create index if not exists squad_alarms_event_created_idx
  on squad_alarms (event_id, created_at desc);

-- Waypoint fissi mappa TOC (lat/long, senza quota)
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

-- Vista per mappa TOC
create or replace view active_squad_summaries as
select
  ss.id as session_id,
  ss.event_id,
  ss.squad_id,
  s.squad_code,
  s.squad_name,
  s.map_color,
  ss.is_online,
  ss.login_at,
  ss.last_latitude,
  ss.last_longitude,
  ss.last_accuracy,
  ss.last_fix_at
from squad_sessions ss
join squads s on s.id = ss.squad_id
where ss.is_online = true;

-- Stato login: NON è su squads ma su squad_sessions.is_online (true = loggata).
-- Per azzerare tutte le sessioni: sql/reset_squad_sessions_offline.sql
-- squads.is_enabled = false disabilita la squadra (nessun login finché non true).

-- Dati demo (cambiare password in produzione)
insert into events (title, description, is_active)
select 'Evento operativo gestSQUADRE', 'Evento demo', true
where not exists (select 1 from events where is_active = true);

insert into squads (squad_code, squad_name, password_hash, is_enabled)
select 'SQD001', 'Squadra Alpha', '1234', true
where not exists (select 1 from squads where squad_code = 'SQD001');

insert into squads (squad_code, squad_name, password_hash, is_enabled)
select 'SQD002', 'Squadra Bravo', '1234', true
where not exists (select 1 from squads where squad_code = 'SQD002');

insert into toc_admins (admin_code, admin_name, password_hash, role, is_enabled)
select 'TOC01', 'Operatore TOC', 'toc123', 'admin', true
where not exists (select 1 from toc_admins where admin_code = 'TOC01');

-- RLS permissiva per MVP (anon key app mobile + browser TOC)
alter table events enable row level security;
alter table squads enable row level security;
alter table toc_admins enable row level security;
alter table squad_sessions enable row level security;
alter table squad_fcm_tokens enable row level security;
alter table squad_alarms enable row level security;
alter table squad_map_points enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'events','squads','toc_admins','squad_sessions','squad_fcm_tokens','squad_alarms','squad_map_points'
  ] loop
    execute format('drop policy if exists "gest anon all %s" on %s', t, t);
    execute format(
      'create policy "gest anon all %s" on %s for all to anon using (true) with check (true)',
      t, t
    );
  end loop;
end $$;

-- Realtime: in Dashboard → Database → Replication aggiungi squad_sessions, squad_alarms, squad_map_points
-- (oppure esegui le righe sotto se non già presenti)
-- alter publication supabase_realtime add table squad_sessions;
-- alter publication supabase_realtime add table squad_alarms;
-- alter publication supabase_realtime add table squad_map_points;
