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
  if (url && serviceKey && !serviceKey.includes("YOUR_")) {
    try {
      const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { count } = await admin
        .from("squad_fcm_tokens")
        .select("id", { count: "exact", head: true });
      fcmTokenRows = count ?? 0;
    } catch {
      fcmTokenRows = -1;
    }
  }

  return NextResponse.json({
    supabaseUrl: Boolean(url),
    supabaseServiceRole: Boolean(serviceKey && !serviceKey.includes("YOUR_")),
    firebaseAdmin: Boolean(getFirebaseAdminMessaging()),
    fcmTokenRows,
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
