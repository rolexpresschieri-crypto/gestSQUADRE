-- Tipologia evento operativo (stesse categorie dell'app: sanitario, security, vvf, …)
-- Eseguire su Supabase dopo operational_events_target_squad.sql

alter table operational_events
  add column if not exists request_types text[] not null default '{}',
  add column if not exists other_detail text;

comment on column operational_events.request_types is
  'Tipologie richiesta (sanitario, security, vvf, strutture, altro) — stesso schema squad_alarms.';
comment on column operational_events.other_detail is
  'Dettaglio obbligatorio se request_types contiene altro.';
