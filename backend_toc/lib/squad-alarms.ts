export const SQUAD_ALARM_REQUEST_LABELS: Record<string, string> = {
  ambulanza: "Ambulanza",
  medico: "Medico",
  dae: "DAE",
  forze_ordine: "FORZE DELL'ORDINE",
  vvf: "V.V.F.",
  altro: "Altro",
};

export const SQUAD_ALARM_REQUEST_ORDER = [
  "ambulanza",
  "medico",
  "dae",
  "forze_ordine",
  "vvf",
  "altro",
] as const;

export type AlarmRequestPart = {
  code: string;
  label: string;
  variant: "default" | "forze_ordine" | "vvf";
};

export function parseAlarmRequestTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const known = new Set<string>(SQUAD_ALARM_REQUEST_ORDER);
  return raw
    .map((v) => String(v).trim().toLowerCase())
    .filter((code) => known.has(code as (typeof SQUAD_ALARM_REQUEST_ORDER)[number]));
}

export function getAlarmRequestParts(row: {
  message?: string | null;
  request_types?: unknown;
  other_detail?: string | null;
}): AlarmRequestPart[] {
  const types = parseAlarmRequestTypes(row.request_types);
  const parts: AlarmRequestPart[] = [];

  for (const code of SQUAD_ALARM_REQUEST_ORDER) {
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
      variant:
        code === "forze_ordine"
          ? "forze_ordine"
          : code === "vvf"
            ? "vvf"
            : "default",
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
