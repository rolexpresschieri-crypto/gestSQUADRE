-- Eseguire su Supabase dopo map_routes.sql

-- Import GT_V_01 da GT_V_01.trk (18 punti)
insert into map_routes (golf_course_id, route_code, route_name, color_hex, points)
select
  gc.id,
  'GT_V_01',
  'GT_V_01',
  '#FF0000',
  '[{"lat":45.20320667,"lng":7.54466621},{"lat":45.20310206,"lng":7.54468884},{"lat":45.20291431,"lng":7.54465448},{"lat":45.20275941,"lng":7.54462346},{"lat":45.20260535,"lng":7.54463436},{"lat":45.20245414,"lng":7.54462179},{"lat":45.2022865,"lng":7.54452858},{"lat":45.20213177,"lng":7.54442096},{"lat":45.20198911,"lng":7.54442431},{"lat":45.20177906,"lng":7.54434669},{"lat":45.20152358,"lng":7.54429406},{"lat":45.20133449,"lng":7.54428064},{"lat":45.20115897,"lng":7.5441182},{"lat":45.20088689,"lng":7.54405232},{"lat":45.20062957,"lng":7.54390698},{"lat":45.20044466,"lng":7.54376801},{"lat":45.20016488,"lng":7.54365133},{"lat":45.19994846,"lng":7.54358327}]'::jsonb
from golf_courses gc
where gc.course_code = 'golf_torino'
on conflict (golf_course_id, route_code) do update set
  route_name = excluded.route_name,
  color_hex = excluded.color_hex,
  points = excluded.points,
  is_enabled = true;

-- Import GT_V_02 da GT_V_02.trk (11 punti)
insert into map_routes (golf_course_id, route_code, route_name, color_hex, points)
select
  gc.id,
  'GT_V_02',
  'GT_V_02',
  '#00FFFF',
  '[{"lat":45.20200437,"lng":7.54445901},{"lat":45.20189557,"lng":7.54447125},{"lat":45.20178527,"lng":7.54446454},{"lat":45.20170899,"lng":7.54448483},{"lat":45.20167731,"lng":7.54457586},{"lat":45.20164629,"lng":7.54467074},{"lat":45.20153297,"lng":7.54470276},{"lat":45.20129912,"lng":7.54477417},{"lat":45.20111136,"lng":7.54486738},{"lat":45.20089243,"lng":7.54501557},{"lat":45.20075412,"lng":7.5451014}]'::jsonb
from golf_courses gc
where gc.course_code = 'golf_torino'
on conflict (golf_course_id, route_code) do update set
  route_name = excluded.route_name,
  color_hex = excluded.color_hex,
  points = excluded.points,
  is_enabled = true;

-- Import GT_V_03 da TG_V_03.trk (5 punti)
insert into map_routes (golf_course_id, route_code, route_name, color_hex, points)
select
  gc.id,
  'GT_V_03',
  'GT_V_03',
  '#FF8600',
  '[{"lat":45.202832,"lng":7.5463151},{"lat":45.20249806,"lng":7.54650604},{"lat":45.2021814,"lng":7.54670234},{"lat":45.20195475,"lng":7.54684601},{"lat":45.20167278,"lng":7.54704718}]'::jsonb
from golf_courses gc
where gc.course_code = 'golf_torino'
on conflict (golf_course_id, route_code) do update set
  route_name = excluded.route_name,
  color_hex = excluded.color_hex,
  points = excluded.points,
  is_enabled = true;

