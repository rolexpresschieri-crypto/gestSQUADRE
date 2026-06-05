import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  getFirebaseAdminDiagnostics,
  getFirebaseAdminMessaging,
} from "@/lib/firebase-admin-app";

export const runtime = "nodejs";

/** Verifica se il server può inviare push FCM (solo diagnostica). */
export async function GET() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const firebase = getFirebaseAdminDiagnostics();

  let fcmTokenRows = 0;
  let onlineSessions = 0;
  let onlineSessionsWithToken = 0;
  let queryError: string | null = null;

  if (url && serviceKey && !serviceKey.includes("YOUR_")) {
    try {
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: tokenRows, error: countErr } = await admin
        .from("squad_fcm_tokens")
        .select("session_id");
      if (countErr) {
        queryError = countErr.message;
        fcmTokenRows = -1;
      } else {
        fcmTokenRows = tokenRows?.length ?? 0;
      }

      const { data: online, error: onlineErr } = await admin
        .from("squad_sessions")
        .select("id")
        .eq("is_online", true);
      if (onlineErr) {
        queryError = queryError ?? onlineErr.message;
      } else if (online) {
        onlineSessions = online.length;
        const ids = online.map((r) => r.id as string).filter(Boolean);
        if (ids.length > 0) {
          const { data: matched, error: tokenErr } = await admin
            .from("squad_fcm_tokens")
            .select("session_id")
            .in("session_id", ids);
          if (tokenErr) {
            queryError = queryError ?? tokenErr.message;
          } else {
            onlineSessionsWithToken = matched?.length ?? 0;
          }
        }
      }
    } catch (e) {
      queryError = e instanceof Error ? e.message : "query failed";
      fcmTokenRows = -1;
    }
  }

  return NextResponse.json({
    apiVersion: 2,
    supabaseUrl: Boolean(url),
    supabaseProject: url ? new URL(url).hostname.split(".")[0] : null,
    supabaseServiceRole: Boolean(serviceKey && !serviceKey.includes("YOUR_")),
    firebaseAdmin: Boolean(getFirebaseAdminMessaging()),
    fcmTokenRows,
    onlineSessions,
    onlineSessionsWithToken,
    queryError,
    firebase: {
      ...firebase,
      hint: firebase.adminReady
        ? "ok"
        : !firebase.pathSet && !firebase.jsonEnvSet
          ? "Imposta FIREBASE_SERVICE_ACCOUNT_PATH (file .json) o FIREBASE_SERVICE_ACCOUNT_JSON"
          : firebase.pathSet && !firebase.pathExists
            ? "Percorso FIREBASE_SERVICE_ACCOUNT_PATH non trovato"
            : !firebase.parseOk
              ? "JSON non valido: non incollare altre righe .env nella riga Firebase"
              : "JSON ok ma init Firebase fallita",
    },
  });
}
