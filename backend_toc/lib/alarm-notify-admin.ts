import { ROUTING_ALARM_TYPES } from "@/lib/alarm-notify-routing";
import { SQUAD_ALARM_REQUEST_LABELS } from "@/lib/squad-alarms";

export const ROUTING_ALARM_ROWS = ROUTING_ALARM_TYPES.map((code) => ({
  code,
  label: SQUAD_ALARM_REQUEST_LABELS[code] ?? code,
}));

/** Squadre FIG / Sanitari e altre con codice GT_* in anagrafica. */
export const ALARM_NOTIFY_SQUAD_CODE_PREFIX = "GT_";

export type SquadRecipientRow = {
  squad_code: string;
  squad_name: string;
  is_enabled: boolean;
};

export function routingKey(alarmType: string, squadCode: string): string {
  return `${alarmType}::${squadCode.trim().toUpperCase()}`;
}

export function buildRoutingSet(
  rows: {
    alarm_type: string;
    recipient_squad_code?: string | null;
    admin_code?: string | null;
    is_enabled: boolean;
  }[],
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (!row.is_enabled) {
      continue;
    }
    const code = (row.recipient_squad_code ?? row.admin_code ?? "")
      .trim()
      .toUpperCase();
    if (!code) {
      continue;
    }
    out.add(routingKey(row.alarm_type, code));
  }
  return out;
}
