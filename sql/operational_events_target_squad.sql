-- Evento operativo: squadra target (lampeggio mappa TOC)
-- Eseguire su Supabase dopo operational_events.sql

alter table operational_events
  add column if not exists target_squad_id uuid references squads(id) on delete set null,
  add column if not exists target_session_id uuid references squad_sessions(id) on delete set null;

create index if not exists operational_events_target_session_idx
  on operational_events (target_session_id)
  where target_session_id is not null and status = 'aperto';

comment on column operational_events.target_squad_id is
  'Squadra su cui pesa l''evento (anagrafica).';
comment on column operational_events.target_session_id is
  'Sessione online target al momento dell''apertura (lampeggio mappa).';
