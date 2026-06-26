import type { SupabaseClient } from "@supabase/supabase-js";

export const SQUAD_PHOTOS_BUCKET = "squad-photos";

export type SquadFieldPhotoLogRow = {
  id: string;
  event_id: string | null;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  note: string | null;
  storage_path: string | null;
  status: "inviato" | "fallito";
  error_message: string | null;
  created_at: string;
};

export function formatPhotoGpsDetail(
  latitude: number,
  longitude: number,
  accuracyM: number | null | undefined,
  note?: string | null,
): string {
  const acc =
    accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0
      ? ` (±${Math.round(accuracyM)} m)`
      : "";
  const pos = `Pos: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}${acc}`;
  const trimmed = note?.trim();
  if (!trimmed) {
    return pos;
  }
  return `${pos}\nNota: ${trimmed}`;
}

export function buildPhotoStoragePath(
  squadCode: string,
  photoId: string,
): string {
  const safeCode = squadCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return `${safeCode}/${photoId}.jpg`;
}

export async function insertFailedPhotoLog(
  admin: SupabaseClient,
  row: {
    eventId: string | null;
    sessionId: string;
    squadId: string;
    squadCode: string;
    squadName: string;
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    note: string | null;
    errorMessage: string;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("squad_field_photo_logs")
    .insert({
      event_id: row.eventId,
      session_id: row.sessionId,
      squad_id: row.squadId,
      squad_code: row.squadCode,
      squad_name: row.squadName,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy_m: row.accuracyM,
      note: row.note,
      storage_path: null,
      status: "fallito",
      error_message: row.errorMessage.slice(0, 500),
    })
    .select("id")
    .single();

  if (error) {
    console.error("squad_field_photo_logs fallito insert:", error.message);
    return null;
  }
  return data?.id ?? null;
}
