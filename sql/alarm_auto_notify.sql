-- Inoltro automatico push su allarme volontario → squadre GT_* (FIG / Sanitari).
-- Eseguire su Supabase dopo schema_v1.sql e squad_alarms_request_types.sql.

-- Matrice tipologia allarme → squadra destinataria (codice in squads).
create table if not exists alarm_notify_routing (
  alarm_type text not null check (
    alarm_type in ('sanitario', 'security', 'vvf', 'strutture', 'altro')
  ),
  recipient_squad_code text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (alarm_type, recipient_squad_code)
);

create index if not exists alarm_notify_routing_squad_idx
  on alarm_notify_routing (recipient_squad_code);

-- Opzionale: token FCM per operatori TOC da campo senza account squadra.
create table if not exists toc_admin_fcm_tokens (
  admin_code text not null,
  fcm_token text not null,
  device_label text,
  updated_at timestamptz not null default now(),
  primary key (admin_code, fcm_token)
);

create index if not exists toc_admin_fcm_tokens_admin_idx
  on toc_admin_fcm_tokens (admin_code);

-- Log invii automatici per allarme volontario.
create table if not exists alarm_auto_notify_logs (
  id uuid primary key default gen_random_uuid(),
  alarm_id uuid not null references squad_alarms(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  squad_code text not null,
  squad_name text not null,
  recipient_squad_code text not null,
  recipient_session_id uuid references squad_sessions(id) on delete set null,
  fcm_token text,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  fcm_message_id text,
  error_message text,
  push_title text,
  push_body text,
  request_types jsonb not null default '[]'::jsonb,
  mobile_dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists alarm_auto_notify_logs_alarm_idx
  on alarm_auto_notify_logs (alarm_id, created_at desc);

create index if not exists alarm_auto_notify_logs_event_idx
  on alarm_auto_notify_logs (event_id, created_at desc);

create index if not exists alarm_auto_notify_logs_active_idx
  on alarm_auto_notify_logs (event_id, created_at desc)
  where status = 'sent' and mobile_dismissed_at is null;

-- Seed matrice (globale, tutti i campi). Le squadre GT_* devono esistere in squads.
insert into alarm_notify_routing (alarm_type, recipient_squad_code) values
  ('sanitario', 'GT_01_AN'),
  ('sanitario', 'GT_01_EN'),
  ('sanitario', 'GT_01_LDP'),
  ('sanitario', 'GT_01_UN'),
  ('sanitario', 'GT_COORD_CRI_01'),
  ('sanitario', 'GT_COORD_CRI_02'),
  ('security', 'GT_01_AN'),
  ('security', 'GT_01_EN'),
  ('security', 'GT_01_LDP'),
  ('security', 'GT_01_UN'),
  ('vvf', 'GT_01_AN'),
  ('vvf', 'GT_01_EN'),
  ('vvf', 'GT_01_LDP'),
  ('vvf', 'GT_01_UN'),
  ('altro', 'GT_01_AN'),
  ('altro', 'GT_01_EN'),
  ('altro', 'GT_01_LDP'),
  ('altro', 'GT_01_UN'),
  ('strutture', 'GT_01_AN'),
  ('strutture', 'GT_01_EN'),
  ('strutture', 'GT_01_LDP'),
  ('strutture', 'GT_01_UN')
on conflict (alarm_type, recipient_squad_code) do nothing;

alter table alarm_notify_routing enable row level security;
alter table toc_admin_fcm_tokens enable row level security;
alter table alarm_auto_notify_logs enable row level security;

drop policy if exists "gest anon all alarm_notify_routing" on alarm_notify_routing;
create policy "gest anon all alarm_notify_routing" on alarm_notify_routing
  for all to anon using (true) with check (true);

drop policy if exists "gest anon all toc_admin_fcm_tokens" on toc_admin_fcm_tokens;
create policy "gest anon all toc_admin_fcm_tokens" on toc_admin_fcm_tokens
  for all to anon using (true) with check (true);

drop policy if exists "gest anon all alarm_auto_notify_logs" on alarm_auto_notify_logs;
create policy "gest anon all alarm_auto_notify_logs" on alarm_auto_notify_logs
  for all to anon using (true) with check (true);

-- Webhook Supabase (Dashboard → Database → Webhooks):
--   Table: squad_alarms, Event: INSERT
--   URL: https://TUO-DOMINIO.vercel.app/api/on-squad-alarm
--   Header: Authorization: Bearer <SQUAD_ALARM_WEBHOOK_SECRET>
--   Payload: default (record = new row)
