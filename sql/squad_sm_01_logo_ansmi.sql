-- Icona mappa NV ANSMI per squadra SM_01 (eseguire su Supabase)
-- Dopo deploy backend con logo_ansmi in squad-icons.ts

update public.squads
set map_icon_key = 'logo_ansmi'
where upper(trim(squad_code)) = 'SM_01';
