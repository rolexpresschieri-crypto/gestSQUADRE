-- Telefono di contatto squadra (anagrafica campo / export PDF)
-- Eseguire su Supabase dopo schema_v1.sql

alter table squads add column if not exists contact_phone text;
