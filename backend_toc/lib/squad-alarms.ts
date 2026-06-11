export const SQUAD_ALARM_REQUEST_LABELS: Record<string, string> = {
  ambulanza: "Ambulanza",
  medico: "Medico",
  dae: "DAE",
  altro: "Altro",
};

export function parseAlarmRequestTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((v) => String(v).trim().toLowerCase())
    .filter((code) => code in SQUAD_ALARM_REQUEST_LABELS);
}

export function formatAlarmRequestDetail(row: {
  message?: string | null;
  request_types?: unknown;
  other_detail?: string | null;
}): string {
  const types = parseAlarmRequestTypes(row.request_types);
  if (types.length === 0) {
    return row.message?.trim() || "Richiesta intervento TOC da squadra";
  }
  const labels = types
    .filter((code) => code !== "altro")
    .map((code) => SQUAD_ALARM_REQUEST_LABELS[code] ?? code);
  const base = labels.join(" · ");
  if (types.includes("altro")) {
    const altro = row.other_detail?.trim() || "";
    if (!base) {
      return altro ? `Altro: ${altro}` : "Altro";
    }
    return altro ? `${base} · Altro: ${altro}` : base;
  }
  return base || row.message?.trim() || "Richiesta intervento TOC da squadra";
}
