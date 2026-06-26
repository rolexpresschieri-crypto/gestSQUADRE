-- Eventi operativi: apertura da squadre attivatori (01_TOC, 01_RR) via allarme volontario
-- Eseguire su Supabase dopo operational_events.sql

alter table squad_alarms
  add column if not exists operational_event_id uuid references operational_events(id) on delete set null;

create index if not exists squad_alarms_operational_event_idx
  on squad_alarms (operational_event_id)
  where operational_event_id is not null;

comment on column squad_alarms.operational_event_id is
  'Evento operativo aperto automaticamente se la squadra è attivatore (01_TOC, 01_RR).';
