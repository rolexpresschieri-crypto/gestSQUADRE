import { normalizeWaypointIconKey, type WaypointIconKey } from "@/lib/waypoint-icons";

export type SquadWaypoint = {
  id: string;
  eventId: string;
  label: string | null;
  latitude: number;
  longitude: number;
  iconKey: WaypointIconKey;
  createdAt: string;
  createdByAdminCode: string | null;
  source: string;
};

function compareWaypointsAlphabetically(a: SquadWaypoint, b: SquadWaypoint): number {
  const la = (a.label?.trim() || "").toUpperCase();
  const lb = (b.label?.trim() || "").toUpperCase();
  if (!la && !lb) {
    return 0;
  }
  if (!la) {
    return 1;
  }
  if (!lb) {
    return -1;
  }
  return la.localeCompare(lb, "it");
}

export function sortWaypointsAlphabetically(
  waypoints: SquadWaypoint[],
): SquadWaypoint[] {
  return [...waypoints].sort(compareWaypointsAlphabetically);
}

export function waypointsFromRows(rows: Record<string, unknown>[]): SquadWaypoint[] {
  const parsed = rows
    .map((row) => {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      return {
        id: String(row.id),
        eventId: String(row.event_id),
        label: (row.label as string | null) ?? null,
        latitude: lat,
        longitude: lon,
        iconKey: normalizeWaypointIconKey(row.icon_key as string | null),
        createdAt: String(row.created_at),
        createdByAdminCode: (row.created_by_admin_code as string | null) ?? null,
        source: (row.source as string) ?? "toc_backend",
      };
    })
    .filter(
      (w) => w.id.length > 0 && Number.isFinite(w.latitude) && Number.isFinite(w.longitude),
    );

  return sortWaypointsAlphabetically(parsed);
}

export function waypointDisplayName(wp: SquadWaypoint): string {
  const name = wp.label?.trim();
  return name || "Buca";
}

export function waypointSourceLabel(source: string): string {
  switch (source) {
    case "toc_backend":
      return "TOC backoffice";
    case "toc_mobile":
      return "App mobile";
    case "golf_campo":
      return "Campo golf";
    default:
      return source;
  }
}

export function formatWaypointTimestamp(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString("it-IT");
}
