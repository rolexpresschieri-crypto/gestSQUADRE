-- Ripristina il contatore N° evento se un record allocato viene eliminato (race allarme duplicato).
-- Eseguire su Supabase dopo operational_events.sql

create or replace function reclaim_operational_event_number(
  p_scope_key text,
  p_display_number int
)
returns void
language plpgsql
as $$
begin
  if p_display_number is null or p_display_number < 1 then
    return;
  end if;

  update operational_event_sequence
  set next_number = p_display_number
  where scope_key = p_scope_key
    and next_number > p_display_number;
end;
$$;
