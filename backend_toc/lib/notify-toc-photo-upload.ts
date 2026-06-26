import type { SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin-app";
import { fcmIosApnsPayload } from "@/lib/fcm-ios-apns";

export async function notifyTocAdminsPhotoUploaded(
  admin: SupabaseClient,
  squadCode: string,
  squadName: string,
): Promise<{ sent: number; failed: number }> {
  const messaging = getFirebaseAdminMessaging();
  if (!messaging) {
    return { sent: 0, failed: 0 };
  }

  const { data: rows, error } = await admin
    .from("toc_admin_fcm_tokens")
    .select("fcm_token");

  if (error || !rows?.length) {
    return { sent: 0, failed: 0 };
  }

  const code = squadCode.trim().toUpperCase();
  const title = "gestSQUADRE — TOC";
  const body = `Foto inviata da ${code} — apri Log eventi per scaricare.`;

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const token = typeof row.fcm_token === "string" ? row.fcm_token.trim() : "";
    if (!token) {
      continue;
    }
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data: {
          type: "squad_photo_uploaded",
          squadCode: code,
          squadName: squadName.trim(),
        },
        android: {
          priority: "high",
          notification: { channelId: "gest_squadre_alerts" },
        },
        ...fcmIosApnsPayload(title, body),
      });
      sent += 1;
    } catch (e) {
      console.error("notifyTocAdminsPhotoUploaded FCM error:", e);
      failed += 1;
    }
  }

  return { sent, failed };
}
