-- Tipi di richiesta su allarme volontario → TOC (multi-selezione).
-- Eseguire su Supabase dopo schema_v1.sql.

alter table squad_alarms
  add column if not exists request_types jsonb not null default '[]'::jsonb;

alter table squad_alarms
  add column if not exists other_detail text;

comment on column squad_alarms.request_types is
  'Codici richiesta: sanitario, security, vvf, altro (array JSON). Legacy: ambulanza, medico, dae, forze_ordine.';

comment on column squad_alarms.other_detail is
  'Descrizione breve se è selezionato «altro».';
