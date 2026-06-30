-- Flag per squadre che possono aprire un evento operativo dal campo.
-- Gestito da TOC → Squadre campo (checkbox «Può aprire evento»).
-- Eseguire su Supabase dopo schema_v1.sql

alter table squads
  add column if not exists can_open_operational_event boolean not null default false;

comment on column squads.can_open_operational_event is
  'Se true, la squadra può aprire un evento operativo (flag in Squadre campo TOC).';

-- Backfill: squadre che erano attivatori con suffisso 01_AN / 01_EN / …
update squads
set can_open_operational_event = true
where can_open_operational_event = false
  and (
    upper(squad_code) in (
      '01_AN', '01_EN', '01_RR', '01_TOC', '01_UN',
      'GT_01_AN', 'GT_01_EN', 'GT_01_RR', 'GT_01_TOC', 'GT_01_UN'
    )
    or upper(squad_code) ~ '(_01_AN|_01_EN|_01_RR|_01_TOC|_01_UN)$'
  );
