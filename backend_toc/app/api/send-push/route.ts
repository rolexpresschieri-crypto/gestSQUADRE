import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin-app";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import { tocPushTextUpper } from "@/lib/toc-push-text";

/** Firebase Admin richiede runtime Node (compatibile Vercel serverless). */
export const runtime = "nodejs";

/** Canale Android + suono sirena AllarmeApp (MainActivity.kt + res/raw/siren.mp3). */
const ANDROID_ALARM_CHANNEL_ID = "gest_squadre_toc_alarm_v2";
const ANDROID_ALARM_SOUND = "siren";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY o URL mancanti.", code: "CONFIG" },
      { status: 501 },
    );
  }

  const messaging = getFirebaseAdminMessaging();
  if (!messaging) {
    return NextResponse.json(
      {
        error: "Firebase Admin non configurato (FIREBASE_SERVICE_ACCOUNT_JSON).",
        code: "FIREBASE_ADMIN_NOT_CONFIGURED",
      },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const payload = body as {
    session?: AdminSessionData | null;
    sessionId?: string;
    title?: string;
    body?: string;
    alarm?: boolean;
    routeCode?: string;
    targetWaypointId?: string | null;
  };

  const adminSessionRaw = payload.session;
  if (!adminSessionRaw?.code) {
    return NextResponse.json({ error: "Sessione TOC assente" }, { status: 401 });
  }
  const adminSession = adminSessionRaw;

  const role = normalizeAdminRole(adminSession.role);
  if (role === "campo" || (role !== "admin" && role !== "viewer")) {
    return NextResponse.json({ error: "Ruolo non autorizzato per push." }, { status: 403 });
  }

  const sessionId =
    typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "sessionId UUID obbligatorio" }, { status: 400 });
  }

  const useAlarm = payload.alarm !== false;

  const titleRaw =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : useAlarm
        ? "TOC — ALLARME"
        : "TOC — gestSQUADRE";
  const bodyRaw =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : useAlarm
        ? "MESSAGGIO URGENTE DAL TACTICAL OPERATIONS CENTER."
        : "MESSAGGIO DAL TACTICAL OPERATIONS CENTER.";
  const title = tocPushTextUpper(titleRaw);
  const routeCode =
    typeof payload.routeCode === "string" ? payload.routeCode.trim().toUpperCase() : "";
  const targetWaypointId =
    typeof payload.targetWaypointId === "string" && payload.targetWaypointId.trim()
      ? payload.targetWaypointId.trim()
      : "";
  let bodyText = tocPushTextUpper(bodyRaw);
  if (routeCode) {
    bodyText = tocPushTextUpper(
      bodyRaw.includes(routeCode) ? bodyRaw : `${bodyRaw} — VIA ${routeCode}`,
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sessionRow, error: sessionErr } = await admin
    .from("squad_sessions")
    .select("id, is_online, event_id, squad_id, squads(squad_code, squad_name)")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }
  if (!sessionRow?.is_online) {
    return NextResponse.json({ error: "Sessione non online" }, { status: 409 });
  }

  const session = sessionRow;

  const squadJoin = session.squads as
    | { squad_code: string; squad_name: string }
    | { squad_code: string; squad_name: string }[]
    | null;
  const squadInfo = Array.isArray(squadJoin) ? squadJoin[0] : squadJoin;
  const eventId = session.event_id as string;

  async function writePushLog(status: "sent" | "failed", extra: {
    fcmMessageId?: string;
    errorMessage?: string;
  }) {
    await admin.from("toc_push_logs").insert({
      event_id: eventId,
      session_id: sessionId,
      squad_id: session.squad_id as string,
      squad_code: squadInfo?.squad_code ?? null,
      squad_name: squadInfo?.squad_name ?? null,
      admin_code: adminSession.code,
      title,
      body: bodyText,
      is_alarm: useAlarm,
      fcm_message_id: extra.fcmMessageId ?? null,
      status,
      error_message: extra.errorMessage ?? null,
    });
  }

  const { data: tokenRow, error: tokenErr } = await admin
    .from("squad_fcm_tokens")
    .select("fcm_token")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (tokenErr) {
    return NextResponse.json({ error: tokenErr.message }, { status: 500 });
  }

  const token = tokenRow?.fcm_token as string | undefined;
  if (!token) {
    await writePushLog("failed", {
      errorMessage: "Nessun token FCM per questa sessione.",
    });
    return NextResponse.json(
      {
        error: "Nessun token FCM per questa sessione.",
        code: "NO_FCM_TOKEN",
      },
      { status: 404 },
    );
  }

  try {
    // Solo payload data: con notification+data Android in background non chiama
    // onMessageReceived e il messaggio non finisce nel pannello blu in app.
    const messageId = await messaging.send({
      token,
      data: {
        type: useAlarm ? "toc_alarm" : "toc_message",
        title,
        body: bodyText,
        ...(routeCode ? { route_code: routeCode } : {}),
        ...(targetWaypointId ? { target_waypoint_id: targetWaypointId } : {}),
      },
      android: {
        priority: "high",
      },
    });
    await writePushLog("sent", { fcmMessageId: messageId });
    return NextResponse.json({ ok: true, messageId, alarm: useAlarm });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore FCM";
    if (
      /registration-token-not-registered|invalid-registration-token|not a valid fcm registration token/i.test(
        msg,
      )
    ) {
      await admin.from("squad_fcm_tokens").delete().eq("session_id", sessionId);
    }
    await writePushLog("failed", { errorMessage: msg });
    return NextResponse.json({ error: msg, code: "FCM_SEND_FAILED" }, { status: 502 });
  }
}
