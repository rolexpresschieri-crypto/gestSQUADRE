-- Ripristina login TOC (se era stato cancellato da una migrazione precedente).
insert into toc_admins (admin_code, admin_name, password_hash, role, is_enabled)
select 'TOC01', 'Operatore TOC', 'toc123', 'admin', true
where not exists (select 1 from toc_admins where admin_code = 'TOC01');

update toc_admins
set password_hash = 'toc123', role = 'admin', is_enabled = true, golf_course_id = null
where admin_code = 'TOC01';
