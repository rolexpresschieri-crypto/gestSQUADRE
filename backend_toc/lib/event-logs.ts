export type SquadAlarmLogRow = {
  id: string;
  event_id: string;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  message: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type TocPushLogRow = {
  id: string;
  event_id: string;
  session_id: string | null;
  squad_id: string | null;
  squad_code: string | null;
  squad_name: string | null;
  admin_code: string;
  title: string;
  body: string;
  is_alarm: boolean;
  fcm_message_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type UnifiedEventLog = {
  id: string;
  kind: "squad_alarm" | "toc_push";
  createdAt: string;
  squadCode: string;
  squadName: string;
  summary: string;
  detail: string;
  status: string;
  actor: string;
};

export function mergeEventLogs(
  alarms: SquadAlarmLogRow[],
  pushes: TocPushLogRow[],
): UnifiedEventLog[] {
  const rows: UnifiedEventLog[] = [
    ...alarms.map((a) => ({
      id: a.id,
      kind: "squad_alarm" as const,
      createdAt: a.created_at,
      squadCode: a.squad_code,
      squadName: a.squad_name,
      summary: "Allarme squadra → TOC",
      detail: a.message?.trim() || "Chiamata TOC da squadra",
      status: a.acknowledged_at ? "preso in carico" : "attivo",
      actor: a.acknowledged_by?.trim() || "—",
    })),
    ...pushes.map((p) => ({
      id: p.id,
      kind: "toc_push" as const,
      createdAt: p.created_at,
      squadCode: p.squad_code?.trim() || "—",
      squadName: p.squad_name?.trim() || "—",
      summary: p.is_alarm ? "Push allarme TOC → squadra" : "Push TOC → squadra",
      detail: `${p.title} — ${p.body}`,
      status: p.status,
      actor: p.admin_code,
    })),
  ];

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function csvEscape(value: string): string {
  const v = value.replace(/"/g, '""');
  return `"${v}"`;
}

export function eventLogsToCsv(rows: UnifiedEventLog[], eventTitle: string): string {
  const header = [
    "Data/ora",
    "Tipo",
    "Squadra",
    "Nome squadra",
    "Dettaglio",
    "Stato",
    "Operatore",
  ].join(";");

  const lines = rows.map((r) =>
    [
      new Date(r.createdAt).toLocaleString("it-IT"),
      r.summary,
      r.squadCode,
      r.squadName,
      r.detail,
      r.status,
      r.actor,
    ]
      .map((c) => csvEscape(String(c)))
      .join(";"),
  );

  return `\uFEFFEvento: ${eventTitle}\n${header}\n${lines.join("\n")}\n`;
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
