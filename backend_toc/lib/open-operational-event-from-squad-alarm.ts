import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapOperationalEventRow,
  operationalEventScopeKey,
  type OperationalEventSummary,
} from "@/lib/operational-events";
import { openOperationalEvent } from "@/lib/open-operational-event-core";
import { isSquadOperationalEventOpener } from "@/lib/operational-event-openers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpenOperationalEventFromSquadAlarmResult = {
  created: boolean;
  skipped: boolean;
  event: OperationalEventSummary | null;
  error: string | null;
};

/** @deprecated Gli eventi non si aprono più automaticamente dall'allarme. */
export async function openOperationalEventFromSquadAlarm(
  _admin: SupabaseClient,
  _alarm: { id: string; squad_id: string; squad_code: string },
): Promise<OpenOperationalEventFromSquadAlarmResult> {
  return { created: false, skipped: true, event: null, error: null };
}

export async function openOperationalEventFromFieldSession(
  admin: SupabaseClient,
  sessionId: string,
  requestTypes: string[],
  otherDetail?: string | null,
): Promise<OpenOperationalEventFromSquadAlarmResult> {
  if (!UUID_RE.test(sessionId)) {
    return { created: false, skipped: false, event: null, error: "Sessione non valida." };
  }

  const { data: row, error } = await admin
    .from("squad_sessions")
    .select(
      "id, is_online, squad_id, squads(squad_code, golf_course_id, can_open_operational_event)",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    return { created: false, skipped: false, event: null, error: error.message };
  }
  if (!row?.is_online) {
    return { created: false, skipped: false, event: null, error: "Sessione non online." };
  }

  const squadId = String(row.squad_id ?? "");
  const squad = row.squads as
    | {
        squad_code?: string;
        golf_course_id?: string | null;
        can_open_operational_event?: boolean;
      }
    | null
    | undefined;

  if (!squad?.can_open_operational_event) {
    return { created: false, skipped: true, event: null, error: null };
  }

  const canOpen = await isSquadOperationalEventOpener(admin, squadId);
  if (!canOpen) {
    return { created: false, skipped: true, event: null, error: null };
  }

  const openedByCode = String(squad.squad_code ?? "").trim().toUpperCase();
  const golfCourseId =
    typeof squad.golf_course_id === "string" ? squad.golf_course_id : null;

  const result = await openOperationalEvent(admin, {
    golfCourseId,
    openedByCode,
    targetSquadId: squadId,
    targetSessionId: sessionId,
    requestTypes,
    otherDetail,
  });

  if (result.error || !result.event) {
    return {
      created: false,
      skipped: false,
      event: null,
      error: result.error ?? "Apertura evento fallita.",
    };
  }

  return { created: true, skipped: false, event: result.event, error: null };
}
