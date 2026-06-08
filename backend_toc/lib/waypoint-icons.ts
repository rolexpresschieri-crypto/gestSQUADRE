export type WaypointIconKey = "buche" | "croce_rossa" | "club_house";

/** Valori legacy salvati in DB prima del rename. */
const LEGACY_ICON_ALIASES: Record<string, WaypointIconKey> = {
  buca_golf: "buche",
};

export type WaypointIconOption = {
  key: WaypointIconKey;
  label: string;
  mapUrl: string;
};

export const WAYPOINT_ICON_OPTIONS: WaypointIconOption[] = [
  { key: "buche", label: "Buche", mapUrl: "/map/buca_02.png" },
  { key: "croce_rossa", label: "Croce rossa", mapUrl: "/map/croce_rossa.png" },
  { key: "club_house", label: "Club house", mapUrl: "/map/club_house.png" },
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
