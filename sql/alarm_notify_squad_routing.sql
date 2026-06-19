-- Allinea inoltro automatico: destinatari = squadre (GT_*), non toc_admins.
-- Eseguire su Supabase DOPO alarm_auto_notify.sql.

-- Rinomina colonne se create con admin_code
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alarm_notify_routing'
      and column_name = 'admin_code'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alarm_notify_routing'
      and column_name = 'recipient_squad_code'
  ) then
    alter table alarm_notify_routing
      rename column admin_code to recipient_squad_code;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alarm_auto_notify_logs'
      and column_name = 'admin_code'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'alarm_auto_notify_logs'
      and column_name = 'recipient_squad_code'
  ) then
    alter table alarm_auto_notify_logs
      rename column admin_code to recipient_squad_code;
  end if;
end $$;

comment on column alarm_notify_routing.recipient_squad_code is
  'Codice squadra destinataria push (es. GT_01_AN, GT_COORD_CRI_01) — deve esistere in squads.';

comment on column alarm_auto_notify_logs.recipient_squad_code is
  'Squadra destinataria push automatica (codice squads).';
