-- Evidenza TOC «Missioni attive» per inoltri automatici + reset notifica mobile.
-- Eseguire su Supabase dopo alarm_auto_notify.sql (o alarm_notify_squad_routing.sql).

alter table alarm_auto_notify_logs
  add column if not exists recipient_session_id uuid references squad_sessions(id) on delete set null,
  add column if not exists push_title text,
  add column if not exists push_body text,
  add column if not exists mobile_dismissed_at timestamptz;

create index if not exists alarm_auto_notify_logs_active_idx
  on alarm_auto_notify_logs (event_id, created_at desc)
  where status = 'sent' and mobile_dismissed_at is null;

comment on column alarm_auto_notify_logs.recipient_session_id is
  'Sessione squadra destinataria (per presa in carico TOC e reset mobile).';

comment on column alarm_auto_notify_logs.mobile_dismissed_at is
  'Impostato quando il destinatario preme «Reset notifica» sull''app.';

-- Dashboard TOC (realtime): Database → Replication → aggiungi alarm_auto_notify_logs
