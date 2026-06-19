-- Icona squadra sulla mappa (chiave condivisa con waypoint-icons.ts).
alter table squads
  add column if not exists map_icon_key text default 'squadre_a_piedi';

update squads
set map_icon_key = 'squadre_a_piedi'
where map_icon_key is null or trim(map_icon_key) = '';

create or replace view active_squad_summaries as
select
  ss.id as session_id,
  ss.event_id,
  ss.squad_id,
  s.squad_code,
  s.squad_name,
  s.map_color,
  s.map_icon_key,
  ss.is_online,
  ss.login_at,
  ss.last_latitude,
  ss.last_longitude,
  ss.last_accuracy,
  ss.last_fix_at
from squad_sessions ss
join squads s on s.id = ss.squad_id
where ss.is_online = true;
