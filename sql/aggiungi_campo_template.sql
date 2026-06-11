insert into golf_courses (course_code, course_name)
select '__COURSE_CODE__', '__COURSE_NAME__'
where not exists (
  select 1 from golf_courses where course_code = '__COURSE_CODE__'
);

update toc_admins
set
  role = '__ROLE__',
  is_enabled = true,
  password_hash = '__PASSWORD__',
  golf_course_id = (
    select id from golf_courses where course_code = '__COURSE_CODE__' limit 1
  )
where admin_code = '__ADMIN_CODE__';

insert into toc_admins (
  admin_code, admin_name, password_hash, role, is_enabled, golf_course_id
)
select
  '__ADMIN_CODE__',
  '__ADMIN_NAME__',
  '__PASSWORD__',
  '__ROLE__',
  true,
  (select id from golf_courses where course_code = '__COURSE_CODE__' limit 1)
where not exists (
  select 1 from toc_admins where admin_code = '__ADMIN_CODE__'
);
