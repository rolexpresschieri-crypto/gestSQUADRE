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

function recipientCode(row: AutoNotifyLogRow): string {
  return (row.recipient_squad_code ?? row.admin_code ?? "").trim().toUpperCase();
}

export async function fetchActiveAutoNotifyDeliveries(
  supabase: SupabaseClient,
  eventId: string | null,
  recipientSquadCodes?: string[] | null,
): Promise<{ rows: ActiveAutoNotifyDelivery[]; error: string | null }> {
  if (!eventId) {
    return { rows: [], error: null };
  }

  let query = supabase
    .from("alarm_auto_notify_logs")
    .select(
      "id, alarm_id, event_id, squad_code, squad_name, recipient_squad_code, admin_code, recipient_session_id, push_title, push_body, request_types, created_at, status, mobile_dismissed_at",
    )
    .eq("event_id", eventId)
    .eq("status", "sent")
    .is("mobile_dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const { data, error } = await query;

  if (error) {
    if (error.message.includes("alarm_auto_notify_logs")) {
      return { rows: [], error: null };
    }
    if (
      /recipient_session_id|push_title|push_body|mobile_dismissed_at|column/i.test(
        error.message,
      )
    ) {
      return {
        rows: [],
        error: "Esegui sql/alarm_auto_notify_active.sql su Supabase.",
      };
    }
    return { rows: [], error: error.message };
  }

  const allowed =
    recipientSquadCodes && recipientSquadCodes.length > 0
      ? new Set(recipientSquadCodes.map((c) => c.trim().toUpperCase()))
      : null;

  const rows = ((data ?? []) as AutoNotifyLogRow[])
    .map((row) => {
      const code = recipientCode(row);
      if (!code || !row.recipient_session_id) {
        return null;
      }
      if (allowed && !allowed.has(code)) {
        return null;
      }
      return {
        id: row.id,
        alarmId: row.alarm_id,
        sourceSquadCode: row.squad_code,
        sourceSquadName: row.squad_name,
        recipientSquadCode: code,
        recipientSessionId: String(row.recipient_session_id),
        pushTitle: row.push_title ?? null,
        pushBody: row.push_body ?? null,
        requestTypes: row.request_types,
        createdAt: row.created_at,
      } satisfies ActiveAutoNotifyDelivery;
    })
    .filter((row): row is ActiveAutoNotifyDelivery => row !== null);

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
