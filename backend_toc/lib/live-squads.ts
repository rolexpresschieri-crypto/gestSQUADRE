import { normalizeSquadIconKey } from "@/lib/squad-icons";

export type LiveSquad = {
  sessionId: string;
  eventId: string;
  squadId: string;
  squadCode: string;
  squadName: string;
  isOnline: boolean;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastAccuracy: number | null;
  lastFixAt: string | null;
  mapColor: string;
  mapIconKey: string;
};

export function formatGpsAccuracyMeters(
  meters: number | null | undefined,
): string | null {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) {
    return null;
  }
  return `± ${Math.round(meters)} m`;
}

export function hasCoordinates(squad: LiveSquad): boolean {
  return (
    typeof squad.lastLatitude === "number" &&
    typeof squad.lastLongitude === "number" &&
    !Number.isNaN(squad.lastLatitude) &&
    !Number.isNaN(squad.lastLongitude)
  );
}

/** Firma posizioni GPS per aggiornamenti mappa senza re-render inutili. */
export function liveSquadsPollSig(squads: LiveSquad[]): string {
  return squads
    .filter(hasCoordinates)
    .map(
      (s) =>
        `${s.sessionId}:${s.lastLatitude!.toFixed(6)},${s.lastLongitude!.toFixed(6)}:${s.lastAccuracy ?? ""}`,
    )
    .sort()
    .join("|");
}

export function liveSquadsEqual(a: LiveSquad[], b: LiveSquad[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return liveSquadsPollSig(a) === liveSquadsPollSig(b);
}

export function normalizeMapColor(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    return v;
  }
  return "#079B42";
}

export function liveSquadsFromRows(rows: Record<string, unknown>[]): LiveSquad[] {
  return rows.map((row) => ({
    sessionId: row.session_id as string,
    eventId: row.event_id as string,
    squadId: row.squad_id as string,
    squadCode: row.squad_code as string,
    squadName: row.squad_name as string,
    isOnline: Boolean(row.is_online),
    lastLatitude: (row.last_latitude as number | null) ?? null,
    lastLongitude: (row.last_longitude as number | null) ?? null,
    lastAccuracy: (row.last_accuracy as number | null) ?? null,
    lastFixAt: (row.last_fix_at as string | null) ?? null,
    mapColor: normalizeMapColor((row.map_color as string | null) ?? null),
    mapIconKey: normalizeSquadIconKey((row.map_icon_key as string | null) ?? null),
  }));
}
