-- Chiude tutte le sessioni squadra ancora "online" (es. dopo crash app o rinomina su Supabase).
-- Esegui in SQL Editor Supabase quando compare "squadra già loggata".

update squad_sessions
set
  is_online = false,
  logout_at = coalesce(logout_at, now())
where is_online = true;

-- Opzionale: disabilita tutte le squadre finché il TOC non le abilita (login bloccato se is_enabled = false)
-- update squads set is_enabled = false;
