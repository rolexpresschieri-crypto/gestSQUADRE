-- Foto da campo (squadra loggata) → log eventi TOC + Storage privato.
-- Eseguire su Supabase dopo squad_event_flow.sql
--
-- Storage (Dashboard Supabase → Storage → New bucket):
--   Nome: squad-photos
--   Public: OFF (privato — download solo via API TOC autenticata)
--   File size limit: 3 MB consigliato
--   MIME: image/jpeg

create table if not exists squad_field_photo_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  session_id uuid not null references squad_sessions(id) on delete cascade,
  squad_id uuid not null references squads(id) on delete cascade,
  squad_code text not null,
  squad_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  note text,
  storage_path text,
  status text not null check (status in ('inviato', 'fallito')),
  error_message text,
  created_at timestamptz not null default now(),
  constraint squad_field_photo_note_len check (note is null or char_length(note) <= 200)
);

create index if not exists squad_field_photo_logs_event_created_idx
  on squad_field_photo_logs (event_id, created_at desc);

create index if not exists squad_field_photo_logs_session_created_idx
  on squad_field_photo_logs (session_id, created_at desc);

alter table squad_field_photo_logs enable row level security;

drop policy if exists "gest anon read squad_field_photo_logs" on squad_field_photo_logs;
create policy "gest anon read squad_field_photo_logs"
  on squad_field_photo_logs for select to anon using (true);

drop policy if exists "gest anon insert squad_field_photo_logs" on squad_field_photo_logs;
create policy "gest anon insert squad_field_photo_logs"
  on squad_field_photo_logs for insert to anon with check (true);

comment on table squad_field_photo_logs is
  'Foto inviate da app squadra. storage_path valorizzato solo se status=inviato.';
