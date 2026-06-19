-- Tipologia allarme «Strutture» + routing automatico verso squadre FIG.
-- Eseguire su Supabase dopo alarm_auto_notify.sql.

alter table alarm_notify_routing
  drop constraint if exists alarm_notify_routing_alarm_type_check;

alter table alarm_notify_routing
  add constraint alarm_notify_routing_alarm_type_check
  check (alarm_type in ('sanitario', 'security', 'vvf', 'strutture', 'altro'));

insert into alarm_notify_routing (alarm_type, recipient_squad_code) values
  ('strutture', 'GT_01_AN'),
  ('strutture', 'GT_01_EN'),
  ('strutture', 'GT_01_LDP'),
  ('strutture', 'GT_01_UN')
on conflict (alarm_type, recipient_squad_code) do nothing;
