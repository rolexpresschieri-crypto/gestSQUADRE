import { ROUTING_ALARM_TYPES } from "@/lib/alarm-notify-routing";
import { SQUAD_ALARM_REQUEST_LABELS } from "@/lib/squad-alarms";

export const ROUTING_ALARM_ROWS = ROUTING_ALARM_TYPES.map((code) => ({
  code,
  label: SQUAD_ALARM_REQUEST_LABELS[code] ?? code,
}));

export type TocOperatorRow = {
  admin_code: string;
  admin_name: string;
  is_enabled: boolean;
};

export type RoutingCell = {
  alarmType: string;
  adminCode: string;
  enabled: boolean;
};

export function routingKey(alarmType: string, adminCode: string): string {
  return `${alarmType}::${adminCode.trim().toUpperCase()}`;
}

export function buildRoutingSet(
  rows: { alarm_type: string; admin_code: string; is_enabled: boolean }[],
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (!row.is_enabled) {
      continue;
    }
    out.add(routingKey(row.alarm_type, row.admin_code));
  }
  return out;
}
