import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlarmNotifyRoutingRow } from "@/lib/alarm-notify-routing";

/** Carica matrice routing con fallback pre/post migrazione recipient_squad_code. */
export async function loadAlarmNotifyRoutingRows(
  admin: SupabaseClient,
): Promise<{ rows: AlarmNotifyRoutingRow[]; error: string | null }> {
  const modern = await admin
    .from("alarm_notify_routing")
    .select("alarm_type, recipient_squad_code, is_enabled")
    .eq("is_enabled", true);

  if (!modern.error) {
    return { rows: (modern.data ?? []) as AlarmNotifyRoutingRow[], error: null };
  }

  if (/recipient_squad_code|column/i.test(modern.error.message)) {
    const legacy = await admin
      .from("alarm_notify_routing")
      .select("alarm_type, admin_code, is_enabled")
      .eq("is_enabled", true);
    if (legacy.error) {
      return { rows: [], error: legacy.error.message };
    }
    return { rows: (legacy.data ?? []) as AlarmNotifyRoutingRow[], error: null };
  }

  return { rows: [], error: modern.error.message };
}
