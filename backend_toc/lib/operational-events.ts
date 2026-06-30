import type { SupabaseClient } from "@supabase/supabase-js";

export type OperationalEventStatus = "aperto" | "chiuso";

export type OperationalEventRow = {
  id: string;
  display_number: number;
  intervention_ref: string | null;
  status: OperationalEventStatus;
  golf_course_id: string | null;
  opened_at: string;
  closed_at: string | null;
  opened_by_admin_code: string;
  closed_by_admin_code: string | null;
  target_squad_id?: string | null;
  target_session_id?: string | null;
  request_types?: string[] | null;
  other_detail?: string | null;
};

export type OperationalEventSummary = {
  id: string;
  displayNumber: number;
  interventionRef: string | null;
  status: OperationalEventStatus;
  openedAt: string;
  closedAt: string | null;
  targetSquadId: string | null;
  targetSessionId: string | null;
  openedByCode: string;
  requestTypes: string[];
  otherDetail: string | null;
};

export const OPERATIONAL_EVENT_SELECT =
  "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code, target_squad_id, target_session_id, request_types, other_detail";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function operationalEventScopeKey(
  golfCourseId: string | null | undefined,
): string {
  const trimmed = golfCourseId?.trim();
  return trimmed || "__global__";
}

export function normalizeInterventionRef(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.length > 20) {
    throw new Error("N° intervento: massimo 20 caratteri.");
  }
  if (!/^[A-Za-z0-9]+$/.test(value)) {
    throw new Error("N° intervento: solo caratteri alfanumerici.");
  }
  return value;
}

export function mapOperationalEventRow(
  row: OperationalEventRow,
): OperationalEventSummary {
  return {
    id: row.id,
    displayNumber: row.display_number,
    interventionRef: row.intervention_ref?.trim() || null,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    targetSquadId:
      typeof row.target_squad_id === "string" ? row.target_squad_id.trim() || null : null,
    targetSessionId:
      typeof row.target_session_id === "string"
        ? row.target_session_id.trim() || null
        : null,
    openedByCode: row.opened_by_admin_code?.trim() || "",
    requestTypes: Array.isArray(row.request_types)
      ? row.request_types.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
      : [],
    otherDetail: row.other_detail?.trim() || null,
  };
}

export async function allocateOperationalEventNumber(
  admin: SupabaseClient,
  scopeKey: string,
): Promise<{ number: number; error: string | null }> {
  const { data, error } = await admin.rpc("allocate_operational_event_number", {
    p_scope_key: scopeKey,
  });
  if (error) {
    return { number: 0, error: error.message };
  }
  const n = Number(data);
  if (!Number.isFinite(n) || n < 1) {
    return { number: 0, error: "Contatore evento operativo non valido." };
  }
  return { number: Math.floor(n), error: null };
}

/** Ripristina il contatore se un evento allocato viene eliminato prima del collegamento allarme. */
export async function reclaimOperationalEventNumber(
  admin: SupabaseClient,
  scopeKey: string,
  displayNumber: number,
): Promise<void> {
  if (!Number.isFinite(displayNumber) || displayNumber < 1) {
    return;
  }
  const { error } = await admin.rpc("reclaim_operational_event_number", {
    p_scope_key: scopeKey,
    p_display_number: Math.floor(displayNumber),
  });
  if (error && !error.message.includes("reclaim_operational_event_number")) {
    console.error("reclaim_operational_event_number:", error.message);
  }
}

export async function fetchOpenOperationalEvents(
  admin: SupabaseClient,
  golfCourseId: string | null,
  includeGlobalForAdmin = false,
): Promise<{ rows: OperationalEventSummary[]; error: string | null }> {
  let query = admin
    .from("operational_events")
    .select(OPERATIONAL_EVENT_SELECT)
    .eq("status", "aperto")
    .order("display_number", { ascending: true });

  if (golfCourseId) {
    query = query.eq("golf_course_id", golfCourseId);
  } else if (!includeGlobalForAdmin) {
    query = query.is("golf_course_id", null);
  }

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("operational_events")) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }

  return {
    rows: ((data ?? []) as OperationalEventRow[]).map(mapOperationalEventRow),
    error: null,
  };
}

export async function fetchOperationalEventsByIds(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, OperationalEventSummary>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => UUID_RE.test(id)))];
  const out = new Map<string, OperationalEventSummary>();
  if (unique.length === 0) {
    return out;
  }

  const { data, error } = await admin
    .from("operational_events")
    .select(OPERATIONAL_EVENT_SELECT)
    .in("id", unique);

  if (error || !data) {
    return out;
  }

  for (const row of data as OperationalEventRow[]) {
    out.set(row.id, mapOperationalEventRow(row));
  }
  return out;
}

export async function validateOpenOperationalEvent(
  admin: SupabaseClient,
  operationalEventId: string,
  golfCourseId: string | null,
): Promise<{ row: OperationalEventSummary | null; error: string | null }> {
  if (!UUID_RE.test(operationalEventId)) {
    return { row: null, error: "Evento operativo non valido." };
  }

  const { data, error } = await admin
    .from("operational_events")
    .select(OPERATIONAL_EVENT_SELECT)
    .eq("id", operationalEventId)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }
  if (!data) {
    return { row: null, error: "Evento operativo non trovato." };
  }

  const row = mapOperationalEventRow(data as OperationalEventRow);
  if (row.status !== "aperto") {
    return { row: null, error: "L'evento operativo non è aperto." };
  }

  const eventCourseId = (data as OperationalEventRow).golf_course_id;
  if (golfCourseId && eventCourseId && eventCourseId !== golfCourseId) {
    return { row: null, error: "Evento operativo di un altro campo." };
  }

  return { row, error: null };
}

export async function countOpenMissionsForOperationalEvent(
  admin: SupabaseClient,
  operationalEventId: string,
): Promise<{ count: number; error: string | null }> {
  const [pushRes, routeRes, alarmsRes] = await Promise.all([
    admin
      .from("toc_push_logs")
      .select("id", { count: "exact", head: true })
      .eq("operational_event_id", operationalEventId)
      .eq("status", "sent")
      .is("mobile_dismissed_at", null)
      .is("closed_at", null),
    admin
      .from("squad_route_assignments")
      .select("id", { count: "exact", head: true })
      .eq("operational_event_id", operationalEventId)
      .is("cleared_at", null),
    admin
      .from("squad_alarms")
      .select("id")
      .eq("operational_event_id", operationalEventId)
      .is("acknowledged_at", null),
  ]);

  if (pushRes.error && !/operational_event_id|column/i.test(pushRes.error.message)) {
    return { count: 0, error: pushRes.error.message };
  }
  if (routeRes.error && !/operational_event_id|column/i.test(routeRes.error.message)) {
    return { count: 0, error: routeRes.error.message };
  }
  if (
    alarmsRes.error &&
    !/operational_event_id|column/i.test(alarmsRes.error.message)
  ) {
    return { count: 0, error: alarmsRes.error.message };
  }

  let autoNotifyCount = 0;
  const alarmIds = (alarmsRes.data ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  if (alarmIds.length > 0) {
    const { count, error: autoErr } = await admin
      .from("alarm_auto_notify_logs")
      .select("id", { count: "exact", head: true })
      .in("alarm_id", alarmIds)
      .eq("status", "sent")
      .is("mobile_dismissed_at", null);

    if (autoErr && !autoErr.message.includes("alarm_auto_notify_logs")) {
      if (!/mobile_dismissed_at|column/i.test(autoErr.message)) {
        return { count: 0, error: autoErr.message };
      }
      const { count: legacyCount, error: legacyErr } = await admin
        .from("alarm_auto_notify_logs")
        .select("id", { count: "exact", head: true })
        .in("alarm_id", alarmIds)
        .eq("status", "sent");
      if (legacyErr && !legacyErr.message.includes("alarm_auto_notify_logs")) {
        return { count: 0, error: legacyErr.message };
      }
      autoNotifyCount = legacyCount ?? 0;
    } else {
      autoNotifyCount = count ?? 0;
    }
  }

  return {
    count: (pushRes.count ?? 0) + (routeRes.count ?? 0) + autoNotifyCount,
    error: null,
  };
}

export async function resetOperationalEventsForScope(
  admin: SupabaseClient,
  scopeKey: string,
  golfCourseId: string | null,
): Promise<{ error: string | null }> {
  const { error: seqErr } = await admin.rpc("reset_operational_event_sequence", {
    p_scope_key: scopeKey,
  });
  if (seqErr && !seqErr.message.includes("reset_operational_event_sequence")) {
    return { error: seqErr.message };
  }

  let deleteQuery = admin.from("operational_events").delete();
  if (golfCourseId) {
    deleteQuery = deleteQuery.eq("golf_course_id", golfCourseId);
  } else if (scopeKey === "__global__") {
    deleteQuery = deleteQuery.is("golf_course_id", null);
  }

  const { error: delErr } = await deleteQuery;
  if (delErr && !delErr.message.includes("operational_events")) {
    return { error: delErr.message };
  }

  return { error: null };
}

export function formatOperationalEventLabel(
  event: Pick<OperationalEventSummary, "displayNumber" | "interventionRef"> | null,
): string {
  if (!event) {
    return "—";
  }
  const ref = event.interventionRef?.trim();
  return ref ? `Evento ${event.displayNumber} · ${ref}` : `Evento ${event.displayNumber}`;
}
