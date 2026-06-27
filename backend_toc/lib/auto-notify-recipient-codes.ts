import type { SupabaseClient } from "@supabase/supabase-js";
import { ALARM_NOTIFY_SQUAD_CODE_PREFIX } from "@/lib/alarm-notify-admin";

function normalizeSquadCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Squadre GT_* / matrice inoltro automatico allarme volontario. */
export function isAutomaticNotifyRecipientCode(
  squadCode: string,
  routingRecipientCodes?: ReadonlySet<string>,
): boolean {
  const code = normalizeSquadCode(squadCode);
  if (!code) {
    return false;
  }
  if (routingRecipientCodes?.has(code)) {
    return true;
  }
  return code.startsWith(ALARM_NOTIFY_SQUAD_CODE_PREFIX);
}

export async function fetchAutomaticNotifyRecipientCodes(
  supabase: SupabaseClient,
): Promise<Set<string>> {
  const out = new Set<string>();

  let { data, error } = await supabase
    .from("alarm_notify_routing")
    .select("recipient_squad_code, admin_code");

  if (error && /recipient_squad_code|column/i.test(error.message)) {
    const legacy = await supabase
      .from("alarm_notify_routing")
      .select("admin_code");
    data = (legacy.data ?? []) as typeof data;
    error = legacy.error;
  }

  if (error) {
    if (!error.message.includes("alarm_notify_routing")) {
      console.error("alarm_notify_routing load failed:", error.message);
    }
    return out;
  }

  for (const row of data ?? []) {
    const code = normalizeSquadCode(
      String(row.recipient_squad_code ?? row.admin_code ?? ""),
    );
    if (code) {
      out.add(code);
    }
  }
  return out;
}
