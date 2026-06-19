import { parseAlarmRequestTypes } from "@/lib/squad-alarms";

export const ROUTING_ALARM_TYPES = [
  "sanitario",
  "security",
  "vvf",
  "altro",
] as const;

export type RoutingAlarmType = (typeof ROUTING_ALARM_TYPES)[number];

/** Tipologie legacy → bucket routing attuale. */
const LEGACY_TO_ROUTING: Record<string, RoutingAlarmType> = {
  ambulanza: "sanitario",
  medico: "sanitario",
  dae: "sanitario",
  forze_ordine: "security",
};

export function routingTypesFromRequest(raw: unknown): RoutingAlarmType[] {
  const parsed = parseAlarmRequestTypes(raw);
  const out = new Set<RoutingAlarmType>();
  for (const code of parsed) {
    if ((ROUTING_ALARM_TYPES as readonly string[]).includes(code)) {
      out.add(code as RoutingAlarmType);
      continue;
    }
    const mapped = LEGACY_TO_ROUTING[code];
    if (mapped) {
      out.add(mapped);
    }
  }
  return ROUTING_ALARM_TYPES.filter((t) => out.has(t));
}

export type AlarmNotifyRoutingRow = {
  alarm_type: string;
  admin_code: string;
  is_enabled: boolean;
};

export function resolveAdminCodesFromRouting(
  requestTypes: unknown,
  routingRows: AlarmNotifyRoutingRow[],
): string[] {
  const types = routingTypesFromRequest(requestTypes);
  if (types.length === 0) {
    return [];
  }
  const enabled = routingRows.filter((r) => r.is_enabled);
  const codes = new Set<string>();
  for (const type of types) {
    for (const row of enabled) {
      if (row.alarm_type === type) {
        codes.add(row.admin_code.trim().toUpperCase());
      }
    }
  }
  return [...codes].sort();
}
