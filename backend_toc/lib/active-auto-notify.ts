import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAlarmRequestDetail } from "@/lib/squad-alarms";

export type ActiveAutoNotifyDelivery = {
  id: string;
  alarmId: string;
  sourceSquadCode: string;
  sourceSquadName: string;
  recipientSquadCode: string;
  recipientSessionId: string;
  pushTitle: string | null;
  pushBody: string | null;
  requestTypes: unknown;
  createdAt: string;
};

type AutoNotifyLogRow = {
  id: string;
  alarm_id: string;
  event_id: string;
  squad_code: string;
  squad_name: string;
  recipient_squad_code?: string | null;
  admin_code?: string | null;
  recipient_session_id?: string | null;
  push_title?: string | null;
  push_body?: string | null;
  request_types?: unknown;
  created_at: string;
  status: string;
  mobile_dismissed_at?: string | null;
};

type OnlineSessionRow = {
  id: string;
  squads: { squad_code: string } | { squad_code: string }[] | null;
};

function recipientCode(row: AutoNotifyLogRow): string {
  return (row.recipient_squad_code ?? row.admin_code ?? "").trim().toUpperCase();
}

function squadCodeFromSession(row: OnlineSessionRow): string {
  const squads = row.squads;
  if (!squads) {
    return "";
  }
  if (Array.isArray(squads)) {
    return String(squads[0]?.squad_code ?? "").trim().toUpperCase();
  }
  return String(squads.squad_code ?? "").trim().toUpperCase();
}

async function onlineSessionIdBySquadCode(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("squad_sessions")
    .select("id, squads(squad_code)")
    .eq("is_online", true);

  const out = new Map<string, string>();
  if (error) {
    return out;
  }
  for (const row of (data ?? []) as OnlineSessionRow[]) {
    const code = squadCodeFromSession(row);
    if (code) {
      out.set(code, String(row.id));
    }
  }
  return out;
}

export async function fetchActiveAutoNotifyDeliveries(
  supabase: SupabaseClient,
  eventId: string | null,
  /** Codici squadra mittente (volontario sul campo). Per TOC campo: solo allarmi di quelle squadre. */
  sourceSquadCodes?: string[] | null,
): Promise<{ rows: ActiveAutoNotifyDelivery[]; error: string | null }> {
  if (!eventId) {
    return { rows: [], error: null };
  }

  const modernResult = await supabase
    .from("alarm_auto_notify_logs")
    .select(
      "id, alarm_id, event_id, squad_code, squad_name, recipient_squad_code, admin_code, recipient_session_id, push_title, push_body, request_types, created_at, status, mobile_dismissed_at",
    )
    .eq("event_id", eventId)
    .eq("status", "sent")
    .is("mobile_dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  let legacySchema = false;
  let data: AutoNotifyLogRow[] | null = (modernResult.data ?? null) as AutoNotifyLogRow[] | null;
  let error = modernResult.error;

  if (
    error &&
    /recipient_session_id|push_title|push_body|mobile_dismissed_at|column/i.test(
      error.message,
    )
  ) {
    legacySchema = true;
    const legacyResult = await supabase
      .from("alarm_auto_notify_logs")
      .select(
        "id, alarm_id, event_id, squad_code, squad_name, recipient_squad_code, admin_code, request_types, created_at, status",
      )
      .eq("event_id", eventId)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(80);
    data = (legacyResult.data ?? null) as AutoNotifyLogRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    if (error.message.includes("alarm_auto_notify_logs")) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }

  const sessionByCode = await onlineSessionIdBySquadCode(supabase);

  const allowedSources =
    sourceSquadCodes === undefined || sourceSquadCodes === null
      ? null
      : new Set(sourceSquadCodes.map((c) => c.trim().toUpperCase()));

  const rows = ((data ?? []) as AutoNotifyLogRow[])
    .map((row) => {
      const sourceCode = String(row.squad_code ?? "").trim().toUpperCase();
      if (allowedSources && !allowedSources.has(sourceCode)) {
        return null;
      }

      const recipient = recipientCode(row);
      if (!recipient) {
        return null;
      }

      const sessionId =
        row.recipient_session_id ?? sessionByCode.get(recipient) ?? null;
      if (!sessionId) {
        return null;
      }

      return {
        id: row.id,
        alarmId: row.alarm_id,
        sourceSquadCode: row.squad_code,
        sourceSquadName: row.squad_name,
        recipientSquadCode: recipient,
        recipientSessionId: String(sessionId),
        pushTitle: row.push_title ?? null,
        pushBody: row.push_body ?? null,
        requestTypes: row.request_types,
        createdAt: row.created_at,
      } satisfies ActiveAutoNotifyDelivery;
    })
    .filter((row): row is ActiveAutoNotifyDelivery => row !== null);

  if (legacySchema && (data?.length ?? 0) > 0 && rows.length === 0) {
    return {
      rows: [],
      error:
        "Per presa in carico TOC esegui sql/alarm_auto_notify_active.sql su Supabase.",
    };
  }

  return { rows, error: null };
}

export function formatAutoNotifyMissionDetail(row: ActiveAutoNotifyDelivery): string {
  if (row.pushBody?.trim()) {
    return row.pushBody.trim();
  }
  return formatAlarmRequestDetail({
    request_types: row.requestTypes,
  });
}
