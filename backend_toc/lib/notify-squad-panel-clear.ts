import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFirebaseAdminMessaging } from "@/lib/firebase-admin-app";
import { fcmIosApnsSilentPayload } from "@/lib/fcm-ios-apns";

export async function markLatestTocPushClosed(
  admin: SupabaseClient,
  sessionId: string,
  closedBy: string,
): Promise<void> {
  const { data: row } = await admin
    .from("toc_push_logs")
    .select("id")
    .eq("session_id", sessionId)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row?.id) {
    return;
  }

  await admin
    .from("toc_push_logs")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: closedBy,
    })
    .eq("id", row.id);
}

export async function sendTocPanelClearPush(sessionId: string): Promise<void> {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return;
  }

  const messaging = getFirebaseAdminMessaging();
  if (!messaging) {
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tokenRow } = await admin
    .from("squad_fcm_tokens")
    .select("fcm_token")
    .eq("session_id", sessionId)
    .maybeSingle();

  const token = tokenRow?.fcm_token as string | undefined;
  if (!token) {
    return;
  }

  try {
    await messaging.send({
      token,
      data: { type: "toc_clear_panel" },
      android: { priority: "high" },
      apns: fcmIosApnsSilentPayload(),
    });
  } catch {
    /* best effort */
  }
}

export async function closeTocSquadPanel(
  admin: SupabaseClient,
  sessionId: string,
  closedBy: string,
): Promise<void> {
  await markLatestTocPushClosed(admin, sessionId, closedBy);
  await sendTocPanelClearPush(sessionId);
}
