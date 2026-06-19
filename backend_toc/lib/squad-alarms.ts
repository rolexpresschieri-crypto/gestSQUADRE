export const SQUAD_ALARM_REQUEST_LABELS: Record<string, string> = {
  sanitario: "Sanitario",
  security: "Security",
  vvf: "Vigili del Fuoco",
  altro: "Altro",
  // legacy (allarmi già inviati prima del cambio tipologie)
  ambulanza: "Ambulanza",
  medico: "Medico",
  dae: "DAE",
  forze_ordine: "FORZE DELL'ORDINE",
};

/** Ordine visualizzazione tipologie attuali. */
export const SQUAD_ALARM_REQUEST_ORDER = [
  "sanitario",
  "security",
  "vvf",
  "altro",
] as const;

const LEGACY_ALARM_CODES = ["ambulanza", "medico", "dae", "forze_ordine"] as const;

const KNOWN_ALARM_CODES = new Set<string>([
  ...SQUAD_ALARM_REQUEST_ORDER,
  ...LEGACY_ALARM_CODES,
]);

const SQUAD_ALARM_DISPLAY_ORDER = [
  ...SQUAD_ALARM_REQUEST_ORDER,
  ...LEGACY_ALARM_CODES,
] as const;

export type AlarmRequestPart = {
  code: string;
  label: string;
  variant: "default" | "legacy_highlight";
};

export function parseAlarmRequestTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((v) => String(v).trim().toLowerCase())
    .filter((code) => KNOWN_ALARM_CODES.has(code));
}

export function getAlarmRequestParts(row: {
  message?: string | null;
  request_types?: unknown;
  other_detail?: string | null;
}): AlarmRequestPart[] {
  const types = parseAlarmRequestTypes(row.request_types);
  const parts: AlarmRequestPart[] = [];

  for (const code of SQUAD_ALARM_DISPLAY_ORDER) {
    if (!types.includes(code)) {
      continue;
    }
    if (code === "altro") {
      const altro = row.other_detail?.trim() || "";
      parts.push({
        code,
        label: altro ? `Altro: ${altro}` : "Altro",
        variant: "default",
      });
      continue;
    }
    parts.push({
      code,
      label: SQUAD_ALARM_REQUEST_LABELS[code] ?? code,
      variant: code === "forze_ordine" ? "legacy_highlight" : "default",
    });
  }

  return parts;
}

export function formatAlarmRequestDetail(row: {
  message?: string | null;
  request_types?: unknown;
  other_detail?: string | null;
}): string {
  const parts = getAlarmRequestParts(row);
  if (parts.length === 0) {
    return row.message?.trim() || "Richiesta intervento TOC da squadra";
  }
  return parts.map((p) => p.label).join(" · ");
}
