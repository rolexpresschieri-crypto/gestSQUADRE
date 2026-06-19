-- Solo ricreazione vista (se ALTER TABLE già eseguito).
-- Esegui queste 2 righe in sequenza nel SQL Editor Supabase.

drop view if exists public.active_squad_summaries cascade;

create view public.active_squad_summaries as
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
  ss.last_fix_at,
  s.map_icon_key
from public.squad_sessions ss
join public.squads s on s.id = ss.squad_id
where ss.is_online = true;
