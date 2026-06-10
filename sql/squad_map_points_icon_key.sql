-- Icona waypoint selezionabile (buche | croce_rossa | club_house)
alter table squad_map_points
  add column if not exists icon_key text not null default 'buche';

comment on column squad_map_points.icon_key is
  'Chiave icona: buche, croce_rossa, club_house, cancello_in, driving_range, villaggio_comm, welcome, media_center';

-- Opzionale: allinea waypoint già salvati con chiave legacy
update squad_map_points set icon_key = 'buche' where icon_key = 'buca_golf';
