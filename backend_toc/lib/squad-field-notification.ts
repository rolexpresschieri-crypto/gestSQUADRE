import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveUniqueOpenOperationalEventForSquad,
} from "@/lib/operational-events";
import {
  formatAlarmRequestDetail,
  parseAlarmRequestTypes,
  SQUAD_ALARM_REQUEST_ORDER,
} from "@/lib/squad-alarms";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SQUAD_ALARM_BACKEND_LABEL = "Richiesta intervento TOC da squadra";

export type SquadFieldNotificationInput = {
  requestTypes: string[];
  otherDetail?: string | null;
};

export function validateSquadFieldNotification(
  input: SquadFieldNotificationInput,
): string | null {
  const types = parseAlarmRequestTypes(input.requestTypes);
  const allowed = new Set<string>(SQUAD_ALARM_REQUEST_ORDER);
  const normalized = types.filter((code) => allowed.has(code));
  if (normalized.length === 0) {
    return "Seleziona almeno una richiesta.";
  }
  if (normalized.includes("altro")) {
    const detail = (input.otherDetail ?? "").trim();
    if (detail.length < 2) {
      return "Descrivi brevemente la richiesta «Altro».";
    }
  }
  return null;
}

export function normalizeSquadFieldNotificationTypes(raw: string[]): string[] {
  const types = parseAlarmRequestTypes(raw);
  const allowed = new Set<string>(SQUAD_ALARM_REQUEST_ORDER);
  return types.filter((code) => allowed.has(code));
}

export async function insertSquadFieldNotification(
  admin: SupabaseClient,
  sessionId: string,
  input: SquadFieldNotificationInput,
): Promise<{ alarmId: string; detail: string; error: string | null }> {
  const validationErr = validateSquadFieldNotification(input);
  if (validationErr) {
    return { alarmId: "", detail: "", error: validationErr };
  }

  if (!UUID_RE.test(sessionId)) {
    return { alarmId: "", detail: "", error: "sessionId non valido." };
  }

  const { data: sessionRow, error: sessionErr } = await admin
    .from("squad_sessions")
    .select("id, event_id, squad_id, is_online, squads(squad_code, squad_name)")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr) {
    return { alarmId: "", detail: "", error: sessionErr.message };
  }
  if (!sessionRow?.is_online) {
    return { alarmId: "", detail: "", error: "Sessione squadra non online." };
  }

  const squad = sessionRow.squads as
    | { squad_code?: string; squad_name?: string }
    | null
    | undefined;
  const squadCode = String(squad?.squad_code ?? "").trim().toUpperCase();
  const squadName = String(squad?.squad_name ?? "").trim();
  if (!squadCode || !squadName) {
    return { alarmId: "", detail: "", error: "Dati squadra mancanti." };
  }

  const requestTypes = normalizeSquadFieldNotificationTypes(input.requestTypes);
  const otherDetail =
    requestTypes.includes("altro") ? (input.otherDetail ?? "").trim() : null;

  const detail = formatAlarmRequestDetail({
    request_types: requestTypes,
    other_detail: otherDetail,
  });

  const operationalEventId = await resolveUniqueOpenOperationalEventForSquad(admin, {
    sessionId: String(sessionRow.id),
    squadId: String(sessionRow.squad_id),
  });

  const insertBase: Record<string, unknown> = {
    event_id: sessionRow.event_id,
    session_id: sessionRow.id,
    squad_id: sessionRow.squad_id,
    squad_code: squadCode,
    squad_name: squadName,
    message: `${SQUAD_ALARM_BACKEND_LABEL} — ${detail}`,
    request_types: requestTypes,
    other_detail: otherDetail,
  };
  if (operationalEventId) {
    insertBase.operational_event_id = operationalEventId;
  }

  let { data: inserted, error: insertErr } = await admin
    .from("squad_alarms")
    .insert(insertBase)
    .select("id")
    .single();

  if (
    insertErr &&
    operationalEventId &&
    /operational_event_id|column/i.test(insertErr.message)
  ) {
    delete insertBase.operational_event_id;
    ({ data: inserted, error: insertErr } = await admin
      .from("squad_alarms")
      .insert(insertBase)
      .select("id")
      .single());
  }

  if (insertErr || !inserted?.id) {
    return {
      alarmId: "",
      detail: "",
      error: insertErr?.message ?? "Inserimento segnalazione fallito.",
    };
  }

  return { alarmId: String(inserted.id), detail, error: null };
}
