import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTocPanelClearPush } from "@/lib/notify-squad-panel-clear";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ForceDismissTocPushResult = {
  ok: boolean;
  error?: string;
  sessionId?: string | null;
};

export type ForceDismissGtNotifyResult = {
  ok: boolean;
  error?: string;
  updatedCount: number;
};

async function insertForceDismissLog(
  admin: SupabaseClient,
  row: {
    eventId: string;
    missionKind: "toc_push" | "gt_notify";
    squadCode: string;
    squadName: string;
    adminCode: string;
    sourceRef?: string | null;
    detail?: string | null;
    operationalEventId?: string | null;
  },
): Promise<void> {
  const baseRow = {
    event_id: row.eventId,
    mission_kind: row.missionKind,
    squad_code: row.squadCode,
    squad_name: row.squadName,
    admin_code: row.adminCode,
    source_ref: row.sourceRef ?? null,
    detail: row.detail ?? null,
  };
  const withOperational = {
    ...baseRow,
    operational_event_id: row.operationalEventId ?? null,
  };
  let error = (await admin.from("toc_mission_force_dismiss_logs").insert(withOperational))
    .error;
  if (error && /operational_event_id|column/i.test(error.message)) {
    error = (await admin.from("toc_mission_force_dismiss_logs").insert(baseRow)).error;
  }
  if (error && !error.message.includes("toc_mission_force_dismiss_logs")) {
    console.error("toc_mission_force_dismiss_logs insert failed:", error.message);
  }
}

export async function forceDismissTocPushLog(
  admin: SupabaseClient,
  pushLogId: string,
  adminCode: string,
): Promise<ForceDismissTocPushResult> {
  if (!UUID_RE.test(pushLogId)) {
    return { ok: false, error: "ID push non valido." };
  }

  const now = new Date().toISOString();
  const { data: row, error: fetchErr } = await admin
    .from("toc_push_logs")
    .select(
      "id, event_id, session_id, squad_code, squad_name, title, body, mobile_dismissed_at, closed_at, operational_event_id",
    )
    .eq("id", pushLogId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  if (!row?.id) {
    return { ok: false, error: "Push TOC non trovato." };
  }
  if (row.mobile_dismissed_at) {
    return { ok: true, sessionId: row.session_id as string | null };
  }

  const updateErr = (
    await admin
      .from("toc_push_logs")
      .update({ mobile_dismissed_at: now })
      .eq("id", pushLogId)
  ).error;

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  const squadCode = String(row.squad_code ?? "").trim() || "—";
  const squadName = String(row.squad_name ?? "").trim() || squadCode;
  const detail =
    String(row.body ?? "").trim() ||
    String(row.title ?? "").trim() ||
    "Push TOC";

  await insertForceDismissLog(admin, {
    eventId: String(row.event_id),
    missionKind: "toc_push",
    squadCode,
    squadName,
    adminCode: adminCode.trim() || "TOC",
    sourceRef: pushLogId,
    detail,
    operationalEventId: row.operational_event_id
      ? String(row.operational_event_id)
      : null,
  });

  const sessionId = row.session_id as string | null;
  if (sessionId) {
    await sendTocPanelClearPush(sessionId);
  }

  return { ok: true, sessionId };
}

async function resolveGtMissionEventId(
  admin: SupabaseClient,
  alarmId: string,
  hintEventId?: string | null,
): Promise<string | null> {
  const hinted = hintEventId?.trim();
  if (hinted) {
    return hinted;
  }
  if (!UUID_RE.test(alarmId)) {
    return null;
  }

  const { data: alarm } = await admin
    .from("squad_alarms")
    .select("event_id, session_id")
    .eq("id", alarmId)
    .maybeSingle();

  const alarmEventId =
    typeof alarm?.event_id === "string" ? alarm.event_id.trim() : "";
  if (alarmEventId) {
    return alarmEventId;
  }

  const sessionId =
    typeof alarm?.session_id === "string" ? alarm.session_id.trim() : "";
  if (!sessionId) {
    return null;
  }

  const { data: session } = await admin
    .from("squad_sessions")
    .select("event_id")
    .eq("id", sessionId)
    .maybeSingle();

  return typeof session?.event_id === "string" ? session.event_id.trim() : null;
}

function mobileDismissColumnMissing(message: string): boolean {
  return /mobile_dismissed_at|column/i.test(message);
}

export async function forceDismissGtNotifyLog(
  admin: SupabaseClient,
  adminCode: string,
  options: {
    logId?: string | null;
    alarmId?: string | null;
    recipientSquadCode?: string | null;
    recipientSessionId?: string | null;
  },
): Promise<ForceDismissGtNotifyResult> {
  const now = new Date().toISOString();
  const logId = options.logId?.trim() ?? "";
  const alarmId = options.alarmId?.trim() ?? "";
  const recipientSquadCode = options.recipientSquadCode?.trim().toUpperCase() ?? "";
  const recipientSessionId = options.recipientSessionId?.trim() ?? "";
  const operator = adminCode.trim() || "TOC";

  let squadCode = recipientSquadCode || "—";
  let squadName = squadCode;
  let sourceRef: string | null = UUID_RE.test(logId) ? logId : null;
  let detail = "Inoltro automatico GT";

  if (UUID_RE.test(logId)) {
    const { data: logRow, error: fetchErr } = await admin
      .from("alarm_auto_notify_logs")
      .select(
        "id, alarm_id, event_id, recipient_squad_code, admin_code, squad_code, squad_name, push_body, mobile_dismissed_at",
      )
      .eq("id", logId)
      .maybeSingle();

    if (fetchErr) {
      if (fetchErr.message.includes("alarm_auto_notify_logs")) {
        return { ok: false, error: "Tabella inoltri GT non disponibile.", updatedCount: 0 };
      }
      if (!mobileDismissColumnMissing(fetchErr.message)) {
        return { ok: false, error: fetchErr.message, updatedCount: 0 };
      }
    }

    if (!logRow?.id) {
      return { ok: false, error: "Log inoltro GT non trovato.", updatedCount: 0 };
    }

    const linkedAlarmId = String(logRow.alarm_id ?? alarmId);
    squadCode =
      String(logRow.recipient_squad_code ?? logRow.admin_code ?? "").trim().toUpperCase() ||
      squadCode;
    squadName = squadCode;
    detail =
      String(logRow.push_body ?? "").trim() ||
      `Allarme da ${String(logRow.squad_code ?? "").trim()}`;

    if (logRow.mobile_dismissed_at) {
      return { ok: true, updatedCount: 0 };
    }

    const { data, error } = await admin
      .from("alarm_auto_notify_logs")
      .update({ mobile_dismissed_at: now })
      .eq("id", logId)
      .is("mobile_dismissed_at", null)
      .select("id, event_id, push_body, squad_code");

    if (error) {
      if (error.message.includes("alarm_auto_notify_logs")) {
        return { ok: false, error: "Tabella inoltri GT non disponibile.", updatedCount: 0 };
      }
      if (mobileDismissColumnMissing(error.message)) {
        return {
          ok: false,
          error: "Esegui sql/alarm_auto_notify_active.sql su Supabase per abilitare il reset.",
          updatedCount: 0,
        };
      }
      return { ok: false, error: error.message, updatedCount: 0 };
    }

    if ((data?.length ?? 0) > 0) {
      const updated = data![0] as {
        id: string;
        event_id?: string | null;
        push_body?: string | null;
        squad_code?: string | null;
      };
      const eventId = await resolveGtMissionEventId(
        admin,
        linkedAlarmId,
        updated.event_id ?? logRow.event_id,
      );
      if (eventId) {
        await insertForceDismissLog(admin, {
          eventId,
          missionKind: "gt_notify",
          squadCode,
          squadName,
          adminCode: operator,
          sourceRef: updated.id ?? sourceRef,
          detail:
            String(updated.push_body ?? "").trim() ||
            detail,
        });
      }
      return { ok: true, updatedCount: data!.length };
    }

    const { data: recheck } = await admin
      .from("alarm_auto_notify_logs")
      .select("mobile_dismissed_at")
      .eq("id", logId)
      .maybeSingle();
    if (recheck?.mobile_dismissed_at) {
      return { ok: true, updatedCount: 0 };
    }
  }

  if (UUID_RE.test(alarmId) && recipientSquadCode) {
    const { data, error } = await admin
      .from("alarm_auto_notify_logs")
      .update({ mobile_dismissed_at: now })
      .eq("alarm_id", alarmId)
      .is("mobile_dismissed_at", null)
      .or(
        `recipient_squad_code.eq.${recipientSquadCode},admin_code.eq.${recipientSquadCode}`,
      )
      .select("id, event_id, push_body, squad_code");

    if (error) {
      if (error.message.includes("alarm_auto_notify_logs")) {
        return { ok: false, error: "Tabella inoltri GT non disponibile.", updatedCount: 0 };
      }
      if (mobileDismissColumnMissing(error.message)) {
        return {
          ok: false,
          error: "Esegui sql/alarm_auto_notify_active.sql su Supabase per abilitare il reset.",
          updatedCount: 0,
        };
      }
      return { ok: false, error: error.message, updatedCount: 0 };
    }
    if ((data?.length ?? 0) > 0) {
      const first = data![0] as {
        id: string;
        event_id?: string | null;
        push_body?: string | null;
        squad_code?: string | null;
      };
      const eventId = await resolveGtMissionEventId(admin, alarmId, first.event_id);
      if (eventId) {
        await insertForceDismissLog(admin, {
          eventId,
          missionKind: "gt_notify",
          squadCode: recipientSquadCode,
          squadName: recipientSquadCode,
          adminCode: operator,
          sourceRef: first.id,
          detail:
            String(first.push_body ?? "").trim() ||
            `Allarme da ${String(first.squad_code ?? "").trim()}`,
        });
      }
      return { ok: true, updatedCount: data!.length };
    }
  }

  if (UUID_RE.test(recipientSessionId)) {
    const { data: sessionRow, error: sessionErr } = await admin
      .from("squad_sessions")
      .select("id, event_id, squad_id, squads(squad_code, squad_name)")
      .eq("id", recipientSessionId)
      .maybeSingle();

    if (!sessionErr && sessionRow?.id) {
      const squad = sessionRow.squads as
        | { squad_code: string; squad_name: string }
        | { squad_code: string; squad_name: string }[]
        | null;
      const s = Array.isArray(squad) ? squad[0] : squad;
      squadCode = s?.squad_code ?? recipientSquadCode;
      squadName = s?.squad_name ?? squadCode;

      await insertForceDismissLog(admin, {
        eventId: String(sessionRow.event_id),
        missionKind: "gt_notify",
        squadCode,
        squadName,
        adminCode: operator,
        sourceRef: alarmId || null,
        detail: "Inoltro GT (missione da routing, senza log invio)",
      });

      const { error: insertErr } = await admin.from("squad_mobile_dismiss_logs").insert({
        event_id: sessionRow.event_id,
        session_id: sessionRow.id,
        squad_id: sessionRow.squad_id,
        squad_code: squadCode,
        squad_name: squadName,
        panel_message: null,
      });
      if (!insertErr) {
        return { ok: true, updatedCount: 1 };
      }
    }
  }

  return {
    ok: false,
    error: "Missione GT non trovata o già chiusa.",
    updatedCount: 0,
  };
}
