import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allocateOperationalEventNumber,
  mapOperationalEventRow,
  operationalEventScopeKey,
  type OperationalEventRow,
  type OperationalEventSummary,
} from "@/lib/operational-events";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpenOperationalEventParams = {
  golfCourseId: string | null;
  openedByCode: string;
  targetSquadId: string;
  targetSessionId: string | null;
};

export type OpenOperationalEventResult = {
  event: OperationalEventSummary | null;
  created: boolean;
  error: string | null;
};

export async function openOperationalEvent(
  admin: SupabaseClient,
  params: OpenOperationalEventParams,
): Promise<OpenOperationalEventResult> {
  const openedByCode = params.openedByCode.trim().toUpperCase();
  if (!openedByCode) {
    return { event: null, created: false, error: "Codice apertura assente." };
  }

  if (!UUID_RE.test(params.targetSquadId)) {
    return { event: null, created: false, error: "Squadra target non valida." };
  }

  const targetSessionId =
    params.targetSessionId && UUID_RE.test(params.targetSessionId)
      ? params.targetSessionId
      : null;

  const scopeKey = operationalEventScopeKey(params.golfCourseId);
  const { number, error: allocErr } = await allocateOperationalEventNumber(admin, scopeKey);
  if (allocErr) {
    return { event: null, created: false, error: allocErr };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("operational_events")
    .insert({
      display_number: number,
      status: "aperto",
      golf_course_id: params.golfCourseId,
      opened_by_admin_code: openedByCode,
      target_squad_id: params.targetSquadId,
      target_session_id: targetSessionId,
    })
    .select(
      "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code, target_squad_id, target_session_id",
    )
    .single();

  if (insertErr || !inserted) {
    return {
      event: null,
      created: false,
      error: insertErr?.message ?? "Inserimento evento operativo fallito.",
    };
  }

  return {
    event: mapOperationalEventRow(inserted as OperationalEventRow),
    created: true,
    error: null,
  };
}
