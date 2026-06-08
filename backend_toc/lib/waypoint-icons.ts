export type WaypointIconKey =
  | "buche"
  | "croce_rossa"
  | "club_house"
  | "cancello_in"
  | "driving_range"
  | "villaggio_comm"
  | "welcome"
  | "media_center";

/** Valori legacy salvati in DB. */
const LEGACY_ICON_ALIASES: Record<string, WaypointIconKey> = {
  buca_golf: "buche",
};

export type WaypointIconOption = {
  key: WaypointIconKey;
  label: string;
  mapUrl: string;
};

export const WAYPOINT_ICON_OPTIONS: WaypointIconOption[] = [
  { key: "buche", label: "Buche", mapUrl: "/map/buca_03.png" },
  { key: "croce_rossa", label: "Croce rossa", mapUrl: "/map/croce_rossa.png" },
  { key: "club_house", label: "Club house", mapUrl: "/map/club_house.png" },
  { key: "cancello_in", label: "Cancello ingresso", mapUrl: "/map/cancello_in.png" },
  { key: "driving_range", label: "Driving range", mapUrl: "/map/driving_range.png" },
  { key: "villaggio_comm", label: "Villaggio commerciale", mapUrl: "/map/villaggio_comm.png" },
  { key: "welcome", label: "Welcome", mapUrl: "/map/welcome.png" },
  { key: "media_center", label: "Media center", mapUrl: "/map/media_center.png" },
];

const DEFAULT_KEY: WaypointIconKey = "buche";

const URL_BY_KEY = Object.fromEntries(
  WAYPOINT_ICON_OPTIONS.map((o) => [o.key, o.mapUrl]),
) as Record<WaypointIconKey, string>;

export function normalizeWaypointIconKey(raw: string | null | undefined): WaypointIconKey {
  const k = (raw ?? "").trim();
  if (k in URL_BY_KEY) {
    return k as WaypointIconKey;
  }
  if (k in LEGACY_ICON_ALIASES) {
    return LEGACY_ICON_ALIASES[k]!;
  }
  return DEFAULT_KEY;
}

export function waypointIconMapUrl(iconKey: string | null | undefined): string {
  return URL_BY_KEY[normalizeWaypointIconKey(iconKey)];
}
