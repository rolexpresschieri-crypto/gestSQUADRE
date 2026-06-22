-- Icona mappa NV ANSMI per squadra SM_01 (eseguire su Supabase SQL Editor)

-- Verifica stato attuale
select squad_code, squad_name, map_icon_key
from public.squads
where upper(trim(squad_code)) = 'SM_01';

update public.squads
set map_icon_key = 'logo_ansmi'
where upper(trim(squad_code)) = 'SM_01';

-- Conferma
select squad_code, squad_name, map_icon_key
from public.squads
where upper(trim(squad_code)) = 'SM_01';
