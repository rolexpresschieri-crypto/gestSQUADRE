-- Campo Cinofili NVANSMI + login K9_NVANSMI (dashboard vuota finché non crei squadre/waypoint su questo campo)
-- Eseguire su Supabase SQL Editor.

insert into golf_courses (course_code, course_name)
select 'k9_nvansmi', 'Cinofili NVANSMI'
where not exists (select 1 from golf_courses where course_code = 'k9_nvansmi');

update toc_admins
set
  role = 'admin',
  is_enabled = true,
  golf_course_id = (select id from golf_courses where course_code = 'k9_nvansmi' limit 1)
where admin_code = 'K9_NVANSMI';

-- Se l'admin non esiste ancora:
insert into toc_admins (admin_code, admin_name, password_hash, role, is_enabled, golf_course_id)
select
  'K9_NVANSMI',
  'Cinofili NVANSMI',
  '1234',
  'admin',
  true,
  (select id from golf_courses where course_code = 'k9_nvansmi' limit 1)
where not exists (select 1 from toc_admins where admin_code = 'K9_NVANSMI');
