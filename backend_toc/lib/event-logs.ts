import { formatAlarmRequestDetail } from "@/lib/squad-alarms";

export type SquadAlarmLogRow = {
  id: string;
  event_id: string;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  message: string | null;
  request_types?: unknown;
  other_detail?: string | null;
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
  kind: "squad_alarm" | "fine_evento" | "toc_push";
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
  const alarmRows: UnifiedEventLog[] = [];
  for (const a of alarms) {
    alarmRows.push({
      id: a.id,
      kind: "squad_alarm",
      createdAt: a.created_at,
      squadCode: a.squad_code,
      squadName: a.squad_name,
      summary: "Allarme volontario → TOC",
      detail: formatAlarmRequestDetail(a),
      status: a.acknowledged_at ? "chiuso" : "attivo",
      actor: "—",
    });
    if (a.acknowledged_at) {
      alarmRows.push({
        id: `${a.id}-fine-evento`,
        kind: "fine_evento",
        createdAt: a.acknowledged_at,
        squadCode: a.squad_code,
        squadName: a.squad_name,
        summary: "Fine evento",
        detail: formatAlarmRequestDetail(a),
        status: "registrato",
        actor: a.acknowledged_by?.trim() || "—",
      });
    }
  }

  const rows: UnifiedEventLog[] = [
    ...alarmRows,
    ...pushes.map((p) => {
      const title = p.title?.trim() || "—";
      const body = p.body?.trim() || "—";
      const failed = p.status === "failed";
      const statusLabel = failed
        ? `fallito${p.error_message?.trim() ? `: ${p.error_message.trim()}` : ""}`
        : p.status === "sent"
          ? "inviato"
          : p.status;
      return {
        id: p.id,
        kind: "toc_push" as const,
        createdAt: p.created_at,
        squadCode: p.squad_code?.trim() || "—",
        squadName: p.squad_name?.trim() || "—",
        summary: p.is_alarm
          ? "Allarme TOC → volontario"
          : "Messaggio TOC → volontario",
        detail: `Titolo: ${title} · Messaggio: ${body}`,
        status: statusLabel,
        actor: p.admin_code,
      };
    }),
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function eventLogsPrintHtml(rows: UnifiedEventLog[], eventTitle: string): string {
  const exportedAt = new Date().toLocaleString("it-IT");
  const bodyRows = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(new Date(r.createdAt).toLocaleString("it-IT"))}</td>
        <td>${escapeHtml(r.summary)}</td>
        <td>${escapeHtml(r.squadCode)}</td>
        <td>${escapeHtml(r.squadName)}</td>
        <td>${escapeHtml(r.detail)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.actor)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Log evento gestSQUADRE</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: system-ui, sans-serif; padding: 16px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p.meta { font-size: 12px; color: #444; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #eee; font-weight: 700; }
    td:nth-child(5) { max-width: 280px; word-break: break-word; }
  </style>
</head>
<body>
  <h1>Log evento: ${escapeHtml(eventTitle)}</h1>
  <p class="meta">Esportato: ${escapeHtml(exportedAt)} · Allarmi volontario↔TOC e messaggi TOC→volontari</p>
  <table>
    <thead>
      <tr>
        <th>Data/ora</th>
        <th>Tipo</th>
        <th>Squadra</th>
        <th>Nome</th>
        <th>Dettaglio messaggio</th>
        <th>Stato</th>
        <th>Operatore</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

/** Apre la finestra di stampa (Salva come PDF) senza popup bloccati. */
export function printEventLogsAsPdf(
  rows: UnifiedEventLog[],
  eventTitle: string,
): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Export log gestSQUADRE");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return false;
  }

  doc.open();
  doc.write(eventLogsPrintHtml(rows, eventTitle));
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1500);
    }
  };

  if (doc.readyState === "complete") {
    window.setTimeout(triggerPrint, 250);
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 250);
  }

  return true;
}
