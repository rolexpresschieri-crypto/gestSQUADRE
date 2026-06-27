import type { SupabaseClient } from "@supabase/supabase-js";
import { isOperationalEventActivatorSquad } from "@/lib/operational-event-activators";
import {
  allocateOperationalEventNumber,
  mapOperationalEventRow,
  operationalEventScopeKey,
  type OperationalEventRow,
  type OperationalEventSummary,
} from "@/lib/operational-events";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SquadAlarmOperationalOpenRow = {
  id: string;
  squad_id: string;
  squad_code: string;
  operational_event_id?: string | null;
};

export type OpenOperationalEventFromSquadAlarmResult = {
  created: boolean;
  skipped: boolean;
  event: OperationalEventSummary | null;
  error: string | null;
};

async function fetchExistingOperationalEvent(
  admin: SupabaseClient,
  operationalEventId: string,
): Promise<OperationalEventSummary | null> {
  const { data, error } = await admin
    .from("operational_events")
    .select(
      "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code",
    )
    .eq("id", operationalEventId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return mapOperationalEventRow(data as OperationalEventRow);
}

export async function openOperationalEventFromSquadAlarm(
  admin: SupabaseClient,
  alarm: SquadAlarmOperationalOpenRow,
): Promise<OpenOperationalEventFromSquadAlarmResult> {
  const squadCode = alarm.squad_code.trim().toUpperCase();
  if (!isOperationalEventActivatorSquad(squadCode)) {
    return { created: false, skipped: true, event: null, error: null };
  }

  if (!UUID_RE.test(alarm.id)) {
    return { created: false, skipped: false, event: null, error: "Allarme non valido." };
  }

  const { data: freshAlarm, error: freshErr } = await admin
    .from("squad_alarms")
    .select("id, squad_id, squad_code, operational_event_id")
    .eq("id", alarm.id)
    .maybeSingle();

  if (freshErr) {
    return { created: false, skipped: false, event: null, error: freshErr.message };
  }
  if (!freshAlarm) {
    return { created: false, skipped: false, event: null, error: "Allarme non trovato." };
  }

  const existingId =
    typeof freshAlarm.operational_event_id === "string"
      ? freshAlarm.operational_event_id.trim()
      : "";
  if (existingId && UUID_RE.test(existingId)) {
    const existing = await fetchExistingOperationalEvent(admin, existingId);
    return {
      created: false,
      skipped: false,
      event: existing,
      error: existing ? null : "Evento operativo collegato all'allarme non trovato.",
    };
  }

  const squadId = String(freshAlarm.squad_id ?? alarm.squad_id);

  const { data: squadRow, error: squadErr } = await admin
    .from("squads")
    .select("golf_course_id")
    .eq("id", squadId)
    .maybeSingle();

  if (squadErr) {
    return { created: false, skipped: false, event: null, error: squadErr.message };
  }

  const golfCourseId =
    typeof squadRow?.golf_course_id === "string" ? squadRow.golf_course_id : null;
  const scopeKey = operationalEventScopeKey(golfCourseId);
  const { number, error: allocErr } = await allocateOperationalEventNumber(admin, scopeKey);
  if (allocErr) {
    return { created: false, skipped: false, event: null, error: allocErr };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("operational_events")
    .insert({
      display_number: number,
      status: "aperto",
      golf_course_id: golfCourseId,
      opened_by_admin_code: squadCode,
    })
    .select(
      "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code",
    )
    .single();

  if (insertErr || !inserted) {
    return {
      created: false,
      skipped: false,
      event: null,
      error: insertErr?.message ?? "Inserimento evento operativo fallito.",
    };
  }

  const event = mapOperationalEventRow(inserted as OperationalEventRow);

  const { data: linkedRows, error: linkErr } = await admin
    .from("squad_alarms")
    .update({ operational_event_id: event.id })
    .eq("id", alarm.id)
    .is("operational_event_id", null)
    .select("operational_event_id");

  if (linkErr && !/operational_event_id|column/i.test(linkErr.message)) {
    await admin.from("operational_events").delete().eq("id", event.id);
    return { created: false, skipped: false, event: null, error: linkErr.message };
  }

  if (!linkedRows?.length) {
    await admin.from("operational_events").delete().eq("id", event.id);
    const { data: relinked } = await admin
      .from("squad_alarms")
      .select("operational_event_id")
      .eq("id", alarm.id)
      .maybeSingle();
    const linkedId =
      typeof relinked?.operational_event_id === "string"
        ? relinked.operational_event_id.trim()
        : "";
    if (linkedId && UUID_RE.test(linkedId)) {
      const winner = await fetchExistingOperationalEvent(admin, linkedId);
      return { created: false, skipped: false, event: winner, error: null };
    }
    return {
      created: false,
      skipped: false,
      event: null,
      error: "Collegamento evento all'allarme non riuscito.",
    };
  }

  if (linkErr) {
    const { data: relinked } = await admin
      .from("squad_alarms")
      .select("operational_event_id")
      .eq("id", alarm.id)
      .maybeSingle();
    const linkedId =
      typeof relinked?.operational_event_id === "string"
        ? relinked.operational_event_id
        : null;
    if (linkedId && linkedId !== event.id) {
      await admin.from("operational_events").delete().eq("id", event.id);
      const winner = await fetchExistingOperationalEvent(admin, linkedId);
      return { created: false, skipped: false, event: winner, error: null };
    }
  }

  return { created: true, skipped: false, event, error: null };
}
