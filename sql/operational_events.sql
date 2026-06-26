-- Eventi operativi TOC (N° evento progressivo, N° intervento, apertura/chiusura)
-- Eseguire su Supabase dopo schema_v1.sql

create table if not exists operational_events (
  id uuid primary key default gen_random_uuid(),
  display_number int not null,
  intervention_ref varchar(20),
  status text not null default 'aperto' check (status in ('aperto', 'chiuso')),
  golf_course_id uuid references golf_courses(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by_admin_code text not null,
  closed_by_admin_code text,
  created_at timestamptz not null default now()
);

create index if not exists operational_events_status_idx
  on operational_events (status, golf_course_id);

create unique index if not exists operational_events_scope_number_idx
  on operational_events (coalesce(golf_course_id::text, '__global__'), display_number);

-- Contatore progressivo per scope (campo golf o globale)
create table if not exists operational_event_sequence (
  scope_key text primary key,
  next_number int not null default 1 check (next_number >= 1)
);

create or replace function allocate_operational_event_number(p_scope_key text)
returns integer
language plpgsql
as $$
declare
  allocated int;
begin
  insert into operational_event_sequence (scope_key, next_number)
  values (p_scope_key, 2)
  on conflict (scope_key) do update
    set next_number = operational_event_sequence.next_number + 1
  returning (operational_event_sequence.next_number - 1) into allocated;
  return allocated;
end;
$$;

create or replace function reset_operational_event_sequence(p_scope_key text)
returns void
language plpgsql
as $$
begin
  insert into operational_event_sequence (scope_key, next_number)
  values (p_scope_key, 1)
  on conflict (scope_key) do update
    set next_number = 1;
end;
$$;

alter table operational_events enable row level security;

drop policy if exists "gest anon all operational_events" on operational_events;
create policy "gest anon all operational_events"
  on operational_events for all to anon using (true) with check (true);

alter table operational_event_sequence enable row level security;

drop policy if exists "gest anon all operational_event_sequence" on operational_event_sequence;
create policy "gest anon all operational_event_sequence"
  on operational_event_sequence for all to anon using (true) with check (true);

-- Legame missioni / push TOC → evento operativo (null = «Nessuno»)
alter table toc_push_logs
  add column if not exists operational_event_id uuid references operational_events(id) on delete set null;

create index if not exists toc_push_logs_operational_event_idx
  on toc_push_logs (operational_event_id)
  where operational_event_id is not null;

alter table toc_mission_close_logs
  add column if not exists operational_event_id uuid references operational_events(id) on delete set null;

alter table toc_mission_force_dismiss_logs
  add column if not exists operational_event_id uuid references operational_events(id) on delete set null;

alter table squad_route_assignments
  add column if not exists operational_event_id uuid references operational_events(id) on delete set null;
