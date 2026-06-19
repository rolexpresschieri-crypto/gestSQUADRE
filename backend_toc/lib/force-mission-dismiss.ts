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
    .select("id, session_id, mobile_dismissed_at, closed_at")
    .eq("id", pushLogId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  if (!row?.id) {
    return { ok: false, error: "Push TOC non trovato." };
  }
  if (row.mobile_dismissed_at || row.closed_at) {
    return { ok: true, sessionId: row.session_id as string | null };
  }

  const patch: Record<string, string> = { mobile_dismissed_at: now };
  if (!row.closed_at) {
    patch.closed_at = now;
    patch.closed_by = adminCode.trim() || "TOC";
  }

  let updateErr = (
    await admin.from("toc_push_logs").update(patch).eq("id", pushLogId)
  ).error;

  if (
    updateErr &&
    /mobile_dismissed_at|closed_at|closed_by|column/i.test(updateErr.message)
  ) {
    updateErr = (
      await admin
        .from("toc_push_logs")
        .update({ mobile_dismissed_at: now })
        .eq("id", pushLogId)
    ).error;
  }

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  const sessionId = row.session_id as string | null;
  if (sessionId) {
    await sendTocPanelClearPush(sessionId);
  }

  return { ok: true, sessionId };
}

export async function forceDismissGtNotifyLog(
  admin: SupabaseClient,
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

  if (UUID_RE.test(logId)) {
    const { data, error } = await admin
      .from("alarm_auto_notify_logs")
      .update({ mobile_dismissed_at: now })
      .eq("id", logId)
      .is("mobile_dismissed_at", null)
      .select("id");

    if (error) {
      if (error.message.includes("alarm_auto_notify_logs")) {
        return { ok: false, error: "Tabella inoltri GT non disponibile.", updatedCount: 0 };
      }
      return { ok: false, error: error.message, updatedCount: 0 };
    }
    if ((data?.length ?? 0) > 0) {
      return { ok: true, updatedCount: data?.length ?? 0 };
    }
  }

  if (UUID_RE.test(alarmId) && recipientSquadCode) {
    const { data, error } = await admin
      .from("alarm_auto_notify_logs")
      .update({ mobile_dismissed_at: now })
      .eq("alarm_id", alarmId)
      .eq("status", "sent")
      .is("mobile_dismissed_at", null)
      .or(
        `recipient_squad_code.eq.${recipientSquadCode},admin_code.eq.${recipientSquadCode}`,
      )
      .select("id");

    if (error && !error.message.includes("alarm_auto_notify_logs")) {
      return { ok: false, error: error.message, updatedCount: 0 };
    }
    if ((data?.length ?? 0) > 0) {
      return { ok: true, updatedCount: data?.length ?? 0 };
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
      const { error: insertErr } = await admin.from("squad_mobile_dismiss_logs").insert({
        event_id: sessionRow.event_id,
        session_id: sessionRow.id,
        squad_id: sessionRow.squad_id,
        squad_code: s?.squad_code ?? recipientSquadCode,
        squad_name: s?.squad_name ?? recipientSquadCode,
        panel_message: "Reset forzato da TOC",
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
