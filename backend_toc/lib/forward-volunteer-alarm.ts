import type { SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin-app";
import { fcmIosApnsPayload } from "@/lib/fcm-ios-apns";
import {
  resolveSquadCodesFromRouting,
} from "@/lib/alarm-notify-routing";
import { loadAlarmNotifyRoutingRows } from "@/lib/load-alarm-notify-routing";
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
    sourceSquadCode: string;
    sourceSquadName: string;
    recipientSquadCode: string;
    recipientSessionId?: string | null;
    fcmToken: string | null;
    status: "sent" | "failed" | "skipped";
    fcmMessageId?: string | null;
    errorMessage?: string | null;
    requestTypes: unknown;
    pushTitle?: string | null;
    pushBody?: string | null;
  },
) {
  const fullPayload: Record<string, unknown> = {
    alarm_id: row.alarmId,
    event_id: row.eventId,
    squad_code: row.sourceSquadCode,
    squad_name: row.sourceSquadName,
    recipient_squad_code: row.recipientSquadCode,
    recipient_session_id: row.recipientSessionId ?? null,
    fcm_token: row.fcmToken,
    status: row.status,
    fcm_message_id: row.fcmMessageId ?? null,
    error_message: row.errorMessage ?? null,
    request_types: row.requestTypes ?? [],
    push_title: row.pushTitle ?? null,
    push_body: row.pushBody ?? null,
  };

  let { error } = await admin.from("alarm_auto_notify_logs").insert(fullPayload);
  if (error && /recipient_squad_code|column/i.test(error.message)) {
    ({ error } = await admin.from("alarm_auto_notify_logs").insert({
      ...fullPayload,
      admin_code: row.recipientSquadCode,
      recipient_squad_code: undefined,
      recipient_session_id: undefined,
      push_title: undefined,
      push_body: undefined,
    }));
  } else if (
    error &&
    /recipient_session_id|push_title|push_body|column/i.test(error.message)
  ) {
    const { recipient_session_id, push_title, push_body, ...legacy } = fullPayload;
    void recipient_session_id;
    void push_title;
    void push_body;
    ({ error } = await admin.from("alarm_auto_notify_logs").insert(legacy));
  }
  if (error) {
    console.error("alarm_auto_notify_logs insert failed:", error.message);
  }
}

export async function forwardVolunteerAlarmToOperators(
  admin: SupabaseClient,
  alarm: SquadAlarmNotifyRow,
): Promise<ForwardVolunteerAlarmResult> {
  const { rows: routingRows, error: routingErr } =
    await loadAlarmNotifyRoutingRows(admin);

  if (routingErr) {
    throw new Error(`Routing allarme: ${routingErr}`);
  }

  const recipientCodes = resolveSquadCodesFromRouting(
    alarm.request_types,
    routingRows,
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

  for (const recipientCode of recipientCodes) {
    const { data: recipientSquad, error: squadErr } = await admin
      .from("squads")
      .select("id, squad_code, squad_name")
      .eq("squad_code", recipientCode)
      .maybeSingle();

    if (squadErr) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        sourceSquadCode: alarm.squad_code,
        sourceSquadName: alarm.squad_name,
        recipientSquadCode: recipientCode,
        fcmToken: null,
        status: "failed",
        errorMessage: squadErr.message,
        requestTypes: alarm.request_types,
        pushTitle: title,
        pushBody: body,
      });
      result.failed += 1;
      continue;
    }

    if (!recipientSquad?.id) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        sourceSquadCode: alarm.squad_code,
        sourceSquadName: alarm.squad_name,
        recipientSquadCode: recipientCode,
        fcmToken: null,
        status: "skipped",
        errorMessage: "Squadra destinataria non trovata in anagrafica.",
        requestTypes: alarm.request_types,
        pushTitle: title,
        pushBody: body,
      });
      result.skipped += 1;
      continue;
    }

    if (recipientSquad.id === alarm.squad_id) {
      continue;
    }

    const { data: sessions, error: sessionErr } = await admin
      .from("squad_sessions")
      .select("id")
      .eq("squad_id", recipientSquad.id)
      .eq("is_online", true);

    if (sessionErr) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        sourceSquadCode: alarm.squad_code,
        sourceSquadName: alarm.squad_name,
        recipientSquadCode: recipientCode,
        fcmToken: null,
        status: "failed",
        errorMessage: sessionErr.message,
        requestTypes: alarm.request_types,
        pushTitle: title,
        pushBody: body,
      });
      result.failed += 1;
      continue;
    }

    const sessionIds = (sessions ?? []).map((s) => String(s.id));
    if (sessionIds.length === 0) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        sourceSquadCode: alarm.squad_code,
        sourceSquadName: alarm.squad_name,
        recipientSquadCode: recipientCode,
        fcmToken: null,
        status: "skipped",
        errorMessage: "Squadra non online (nessuna sessione attiva).",
        requestTypes: alarm.request_types,
        pushTitle: title,
        pushBody: body,
      });
      result.skipped += 1;
      continue;
    }

    const { data: tokenRows, error: tokenErr } = await admin
      .from("squad_fcm_tokens")
      .select("fcm_token, session_id")
      .in("session_id", sessionIds);

    if (tokenErr) {
      await writeAutoNotifyLog(admin, {
        alarmId: alarm.id,
        eventId: alarm.event_id,
        sourceSquadCode: alarm.squad_code,
        sourceSquadName: alarm.squad_name,
        recipientSquadCode: recipientCode,
        fcmToken: null,
        status: "failed",
        errorMessage: tokenErr.message,
        requestTypes: alarm.request_types,
        pushTitle: title,
        pushBody: body,
      });
      result.failed += 1;
      continue;
    }

    const tokensBySession = new Map<string, string[]>();
    for (const row of tokenRows ?? []) {
      const sessionId = String(row.session_id ?? "");
      const token = String(row.fcm_token ?? "").trim();
      if (!sessionId || !token) {
        continue;
      }
      tokensBySession.set(sessionId, [...(tokensBySession.get(sessionId) ?? []), token]);
    }

    if (!messaging) {
      for (const sessionId of sessionIds) {
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          sourceSquadCode: alarm.squad_code,
          sourceSquadName: alarm.squad_name,
          recipientSquadCode: recipientCode,
          recipientSessionId: sessionId,
          fcmToken: tokensBySession.get(sessionId)?.[0] ?? null,
          status: "failed",
          errorMessage: "Firebase Admin non configurato.",
          requestTypes: alarm.request_types,
          pushTitle: title,
          pushBody: body,
        });
        result.failed += 1;
      }
      continue;
    }

    for (const sessionId of sessionIds) {
      const sessionTokens = tokensBySession.get(sessionId) ?? [];
      if (sessionTokens.length === 0) {
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          sourceSquadCode: alarm.squad_code,
          sourceSquadName: alarm.squad_name,
          recipientSquadCode: recipientCode,
          recipientSessionId: sessionId,
          fcmToken: null,
          status: "skipped",
          errorMessage: "Squadra online ma senza token push (rifare login app).",
          requestTypes: alarm.request_types,
          pushTitle: title,
          pushBody: body,
        });
        result.skipped += 1;
        continue;
      }

      let sentForSession = false;
      let lastMessageId: string | null = null;
      let lastError: string | null = null;

      for (const token of sessionTokens) {
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
          sentForSession = true;
          lastMessageId = messageId;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Errore FCM";
          lastError = msg;
          if (
            /registration-token-not-registered|invalid-registration-token|not a valid fcm registration token/i.test(
              msg,
            )
          ) {
            await admin
              .from("squad_fcm_tokens")
              .delete()
              .eq("session_id", sessionId);
          }
        }
      }

      if (sentForSession) {
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          sourceSquadCode: alarm.squad_code,
          sourceSquadName: alarm.squad_name,
          recipientSquadCode: recipientCode,
          recipientSessionId: sessionId,
          fcmToken: sessionTokens[0] ?? null,
          status: "sent",
          fcmMessageId: lastMessageId,
          requestTypes: alarm.request_types,
          pushTitle: title,
          pushBody: body,
        });
        result.sent += 1;
      } else {
        await writeAutoNotifyLog(admin, {
          alarmId: alarm.id,
          eventId: alarm.event_id,
          sourceSquadCode: alarm.squad_code,
          sourceSquadName: alarm.squad_name,
          recipientSquadCode: recipientCode,
          recipientSessionId: sessionId,
          fcmToken: sessionTokens[0] ?? null,
          status: "failed",
          errorMessage: lastError ?? "Errore FCM",
          requestTypes: alarm.request_types,
          pushTitle: title,
          pushBody: body,
        });
        result.failed += 1;
      }
    }
  }

  return result;
}
