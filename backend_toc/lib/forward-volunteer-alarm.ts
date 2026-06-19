import type { SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin-app";
import { fcmIosApnsPayload } from "@/lib/fcm-ios-apns";
import {
  resolveAdminCodesFromRouting,
  type AlarmNotifyRoutingRow,
} from "@/lib/alarm-notify-routing";
import { formatAlarmRequestDetail } from "@/lib/squad-alarms";
import { tocPushTextUpper } from "@/lib/toc-push-text";

export type SquadAlarmNotifyRow = {
  id: string;
  event_id: string;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  message?: string | null;
  request_types?: unknown;
  other_detail?: string | null;
  created_at: string;
};

export type ForwardVolunteerAlarmResult = {
  alarmId: string;
  recipientCodes: string[];
  sent: number;
  failed: number;
  skipped: number;
};

async function writeAutoNotifyLog(
  admin: SupabaseClient,
  row: {
    alarmId: string;
    eventId: string;
    squadCode: string;
    squadName: string;
    adminCode: string;
    fcmToken: string | null;
    status: "sent" | "failed" | "skipped";
    fcmMessageId?: string | null;
    errorMessage?: string | null;
    requestTypes: unknown;
  },
) {
  const { error } = await admin.from("alarm_auto_notify_logs").insert({
    alarm_id: row.alarmId,
    event_id: row.eventId,
    squad_code: row.squadCode,
    squad_name: row.squadName,
    admin_code: row.adminCode,
    fcm_token: row.fcmToken,
    status: row.status,
    fcm_message_id: row.fcmMessageId ?? null,
    error_message: row.errorMessage ?? null,
    request_types: row.requestTypes ?? [],
  });
  if (error) {
    console.error("alarm_auto_notify_logs insert failed:", error.message);
  }
}

export async function forwardVolunteerAlarmToOperators(
  admin: SupabaseClient,
  alarm: SquadAlarmNotifyRow,
): Promise<ForwardVolunteerAlarmResult> {
  const { data: routingRows, error: routingErr } = await admin
    .from("alarm_notify_routing")
    .select("alarm_type, admin_code, is_enabled")
    .eq("is_enabled", true);

  if (routingErr) {
    throw new Error(`Routing allarme: ${routingErr.message}`);
  }

  const recipientCodes = resolveAdminCodesFromRouting(
    alarm.request_types,
    (routingRows ?? []) as AlarmNotifyRoutingRow[],
  );

  const result: ForwardVolunteerAlarmResult = {
    alarmId: alarm.id,
    recipientCodes,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  if (recipientCodes.length === 0) {
    return result;
  }

  const messaging = getFirebaseAdminMessaging();
  const detail = formatAlarmRequestDetail(alarm);
  const title = tocPushTextUpper(`ALLARME — ${alarm.squad_code}`);
  const body = tocPushTextUpper(`${alarm.squad_name} — ${detail}`);

  for (const adminCode of recipientCodes) {
    const { data: tokenRows, error: tokenErr } = await admin
      .from("toc_admin_fcm_tokens")
      .select("fcm_token")
      .eq("admin_code", adminCode);

    if (tokenErr) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        squadCode: alarm.squad_code,
        squadName: alarm.squad_name,
        adminCode,
        fcmToken: null,
        status: "failed",
        errorMessage: tokenErr.message,
        requestTypes: alarm.request_types,
      });
      result.failed += 1;
      continue;
    }

    const tokens = (tokenRows ?? [])
      .map((r) => String(r.fcm_token ?? "").trim())
      .filter(Boolean);

    if (tokens.length === 0) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        squadCode: alarm.squad_code,
        squadName: alarm.squad_name,
        adminCode,
        fcmToken: null,
        status: "skipped",
        errorMessage: "Nessun token FCM registrato per operatore.",
        requestTypes: alarm.request_types,
      });
      result.skipped += 1;
      continue;
    }

    if (!messaging) {
      for (const token of tokens) {
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          squadCode: alarm.squad_code,
          squadName: alarm.squad_name,
          adminCode,
          fcmToken: token,
          status: "failed",
          errorMessage: "Firebase Admin non configurato.",
          requestTypes: alarm.request_types,
        });
        result.failed += 1;
      }
      continue;
    }

    for (const token of tokens) {
      try {
        const messageId = await messaging.send({
          token,
          data: {
            type: "volunteer_alarm",
            title,
            body,
            alarm_id: alarm.id,
            squad_code: alarm.squad_code,
          },
          android: { priority: "high" },
          apns: fcmIosApnsPayload(title, body),
        });
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          squadCode: alarm.squad_code,
          squadName: alarm.squad_name,
          adminCode,
          fcmToken: token,
          status: "sent",
          fcmMessageId: messageId,
          requestTypes: alarm.request_types,
        });
        result.sent += 1;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Errore FCM";
        if (
          /registration-token-not-registered|invalid-registration-token|not a valid fcm registration token/i.test(
            msg,
          )
        ) {
          await admin
            .from("toc_admin_fcm_tokens")
            .delete()
            .eq("admin_code", adminCode)
            .eq("fcm_token", token);
        }
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          squadCode: alarm.squad_code,
          squadName: alarm.squad_name,
          adminCode,
          fcmToken: token,
          status: "failed",
          errorMessage: msg,
          requestTypes: alarm.request_types,
        });
        result.failed += 1;
      }
    }
  }

  return result;
}
