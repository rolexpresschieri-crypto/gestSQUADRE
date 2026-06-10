-- Campo golf_torino: waypoint e squadre legati al campo.
-- Il login TOC01 (dashboard mappa/push/allarmi) NON viene rimosso.
-- Eseguire su Supabase se hai già il DB attivo.

insert into golf_courses (course_code, course_name)
select 'golf_torino', 'Campo Golf Torino'
where not exists (select 1 from golf_courses where course_code = 'golf_torino');

update squad_map_points
set golf_course_id = (select id from golf_courses where course_code = 'golf_torino' limit 1)
where golf_course_id is null;

update squads
set golf_course_id = (select id from golf_courses where course_code = 'golf_torino' limit 1)
where golf_course_id is null;

update toc_admins
set
  role = 'campo',
  password_hash = 'gt1234',
  is_enabled = true,
  golf_course_id = (select id from golf_courses where course_code = 'golf_torino' limit 1)
where admin_code = 'GOLF_TORINO';

insert into toc_admins (admin_code, admin_name, password_hash, role, is_enabled, golf_course_id)
select
  'GOLF_TORINO',
  'Campo Golf Torino',
  'gt1234',
  'campo',
  true,
  (select id from golf_courses where course_code = 'golf_torino' limit 1)
where not exists (select 1 from toc_admins where admin_code = 'GOLF_TORINO');

insert into toc_admins (admin_code, admin_name, password_hash, role, is_enabled)
select 'TOC01', 'Operatore TOC', 'toc123', 'admin', true
where not exists (select 1 from toc_admins where admin_code = 'TOC01');
