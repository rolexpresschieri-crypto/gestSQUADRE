-- Fix vista active_squad_summaries + colonna map_icon_key
-- Se vedi errore 42P16: stai usando una versione vecchia dello script.
-- Esegui TUTTO questo file (o prima solo il DROP, poi il CREATE).

-- 1) Colonna su squads (idempotente)
alter table public.squads
  add column if not exists map_icon_key text default 'squadre_a_piedi';

update public.squads
set map_icon_key = 'squadre_a_piedi'
where map_icon_key is null or trim(map_icon_key) = '';

-- 2) Elimina la vista esistente (OBBLIGATORIO: non usare CREATE OR REPLACE)
drop view if exists public.active_squad_summaries cascade;

-- 3) Ricrea la vista (map_icon_key in fondo, non in mezzo)
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
