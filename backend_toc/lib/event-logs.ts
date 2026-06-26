import { formatAlarmRequestDetail, parseAlarmRequestTypes } from "@/lib/squad-alarms";

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
  route_code?: string | null;
  target_waypoint_label?: string | null;
  mobile_dismissed_at?: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  fcm_message_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type SquadMobileDismissLogRow = {
  id: string;
  event_id: string;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  panel_message: string | null;
  created_at: string;
};

export type SquadSessionAuthLogRow = {
  id: string;
  event_id: string;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  action: "login" | "logout" | string;
  created_at: string;
};

export type TocMissionCloseLogRow = {
  id: string;
  event_id: string;
  session_id: string | null;
  squad_id: string | null;
  squad_code: string | null;
  squad_name: string | null;
  route_code: string | null;
  target_waypoint_label: string | null;
  admin_code: string;
  created_at: string;
};

function formatMissionDetail(
  routeCode: string | null | undefined,
  targetLabel: string | null | undefined,
  extra?: string,
): string {
  const parts: string[] = [];
  if (routeCode?.trim()) {
    parts.push(`Via TRK: ${routeCode.trim()}`);
  }
  if (targetLabel?.trim()) {
    parts.push(`Target: ${targetLabel.trim()}`);
  }
  if (extra?.trim()) {
    parts.push(extra.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatTocPushDetail(p: TocPushLogRow): string {
  const title = p.title?.trim() || "—";
  const body = p.body?.trim() || "—";
  return formatMissionDetail(
    p.route_code,
    p.target_waypoint_label,
    `Titolo: ${title} · Messaggio: ${body}`,
  );
}

export type AlarmAutoNotifyLogRow = {
  id: string;
  alarm_id: string;
  event_id: string;
  squad_code: string;
  squad_name: string;
  recipient_squad_code?: string | null;
  admin_code?: string | null;
  fcm_token: string | null;
  status: string;
  fcm_message_id: string | null;
  error_message: string | null;
  request_types?: unknown;
  created_at: string;
};

function autoNotifyRecipientCode(row: AlarmAutoNotifyLogRow): string {
  return (row.recipient_squad_code ?? row.admin_code ?? "").trim() || "—";
}

export type TocMissionForceDismissLogRow = {
  id: string;
  event_id: string;
  mission_kind: "toc_push" | "gt_notify" | string;
  squad_code: string;
  squad_name: string | null;
  admin_code: string;
  source_ref: string | null;
  detail: string | null;
  created_at: string;
};

export type EventLogAlarmFilterCode = "sanitario" | "security" | "vvf" | "strutture";

export const EVENT_LOG_ALARM_FILTER_OPTIONS: {
  code: EventLogAlarmFilterCode;
  label: string;
}[] = [
  { code: "sanitario", label: "Sanitario" },
  { code: "security", label: "Security" },
  { code: "vvf", label: "Vigili del Fuoco" },
  { code: "strutture", label: "Strutture" },
];

export type UnifiedEventLog = {
  id: string;
  kind:
    | "squad_alarm"
    | "squad_login"
    | "squad_logout"
    | "fine_evento"
    | "toc_push"
    | "toc_push_close"
    | "toc_mission_close"
    | "toc_force_dismiss"
    | "mobile_dismiss"
    | "alarm_auto_notify";
  createdAt: string;
  squadCode: string;
  squadName: string;
  summary: string;
  detail: string;
  status: string;
  actor: string;
  /** Tipologie allarme (solo righe legate a squad_alarms / inoltri GT). */
  alarmTypeCodes?: string[];
};

export function mergeEventLogs(
  alarms: SquadAlarmLogRow[],
  pushes: TocPushLogRow[],
  missionCloses: TocMissionCloseLogRow[] = [],
  mobileDismisses: SquadMobileDismissLogRow[] = [],
  sessionAuthLogs: SquadSessionAuthLogRow[] = [],
  autoNotifies: AlarmAutoNotifyLogRow[] = [],
  forceDismisses: TocMissionForceDismissLogRow[] = [],
): UnifiedEventLog[] {
  const alarmRows: UnifiedEventLog[] = [];
  for (const a of alarms) {
    const typeCodes = parseAlarmRequestTypes(a.request_types);
    alarmRows.push({
      id: a.id,
      kind: "squad_alarm",
      createdAt: a.created_at,
      squadCode: a.squad_code,
      squadName: a.squad_name,
      summary: "Allarme volontario → TOC",
      detail: formatAlarmRequestDetail(a),
      status: a.acknowledged_at ? "chiuso" : "inviato",
      actor: "—",
      alarmTypeCodes: typeCodes,
    });
    if (a.acknowledged_at) {
      alarmRows.push({
        id: `${a.id}-fine-evento`,
        kind: "fine_evento",
        createdAt: a.acknowledged_at,
        squadCode: a.squad_code,
        squadName: a.squad_name,
        summary: "Fine evento (TOC)",
        detail: formatAlarmRequestDetail(a),
        status: "chiuso",
        actor: a.acknowledged_by?.trim() || "—",
        alarmTypeCodes: typeCodes,
      });
    }
  }

  const pushRows: UnifiedEventLog[] = [];
  for (const p of pushes) {
    const failed = p.status === "failed";
    const isMission =
      Boolean(p.route_code?.trim()) || Boolean(p.target_waypoint_label?.trim());
    const summary = isMission
      ? "Missione TOC → volontario"
      : p.is_alarm
        ? "Allarme TOC → volontario"
        : "Messaggio TOC → volontario";
    const detail = formatTocPushDetail(p);
    const actor = p.admin_code;

    if (failed) {
      pushRows.push({
        id: p.id,
        kind: "toc_push",
        createdAt: p.created_at,
        squadCode: p.squad_code?.trim() || "—",
        squadName: p.squad_name?.trim() || "—",
        summary,
        detail,
        status: `fallito${p.error_message?.trim() ? `: ${p.error_message.trim()}` : ""}`,
        actor,
      });
      continue;
    }

    pushRows.push({
      id: p.id,
      kind: "toc_push",
      createdAt: p.created_at,
      squadCode: p.squad_code?.trim() || "—",
      squadName: p.squad_name?.trim() || "—",
      summary,
      detail,
      status: "inviato",
      actor,
    });

    if (p.closed_at) {
      pushRows.push({
        id: `${p.id}-toc-close`,
        kind: "toc_push_close",
        createdAt: p.closed_at,
        squadCode: p.squad_code?.trim() || "—",
        squadName: p.squad_name?.trim() || "—",
        summary: "Fine evento messaggio TOC",
        detail,
        status: "chiuso",
        actor: p.closed_by?.trim() || "—",
      });
    }
  }

  const autoNotifyRows: UnifiedEventLog[] = autoNotifies.map((n) => {
    const failed = n.status === "failed";
    const skipped = n.status === "skipped";
    const recipient = autoNotifyRecipientCode(n);
    const typeCodes = parseAlarmRequestTypes(n.request_types);
    return {
      id: n.id,
      kind: "alarm_auto_notify" as const,
      createdAt: n.created_at,
      squadCode: n.squad_code,
      squadName: n.squad_name,
      summary: "Inoltro automatico allarme → squadra GT",
      detail: skipped
        ? `Squadra ${recipient}${n.error_message?.trim() ? `: ${n.error_message.trim()}` : ""}`
        : failed
          ? `Squadra ${recipient}${n.error_message?.trim() ? `: ${n.error_message.trim()}` : ""}`
          : `Squadra ${recipient}`,
      status: skipped ? "saltato" : failed ? "fallito" : "inviato",
      actor: recipient,
      alarmTypeCodes: typeCodes,
    };
  });

  const rows: UnifiedEventLog[] = [
    ...alarmRows,
    ...autoNotifyRows,
    ...pushRows,
    ...mobileDismisses.map((d) => ({
      id: d.id,
      kind: "mobile_dismiss" as const,
      createdAt: d.created_at,
      squadCode: d.squad_code,
      squadName: d.squad_name,
      summary: "Reset notifica mobile (squadra)",
      detail:
        d.panel_message?.trim() ||
        "Pannello TOC azzerato dal telefono della squadra destinatario.",
      status: "notifica chiusa" as const,
      actor: d.squad_code,
    })),
    ...forceDismisses.map((f) => ({
      id: f.id,
      kind: "toc_force_dismiss" as const,
      createdAt: f.created_at,
      squadCode: f.squad_code,
      squadName: f.squad_name?.trim() || f.squad_code,
      summary:
        f.mission_kind === "gt_notify"
          ? "Reset forzato da TOC — inoltro GT"
          : "Reset forzato da TOC — push",
      detail: f.detail?.trim() || "Chiusura missione dall'operatore in dashboard TOC.",
      status: "forzato" as const,
      actor: f.admin_code,
    })),
    ...missionCloses.map((m) => ({
      id: m.id,
      kind: "toc_mission_close" as const,
      createdAt: m.created_at,
      squadCode: m.squad_code?.trim() || "—",
      squadName: m.squad_name?.trim() || "—",
      summary: "Fine evento missione TOC",
      detail: formatMissionDetail(m.route_code, m.target_waypoint_label),
      status: "chiuso",
      actor: m.admin_code,
    })),
    ...sessionAuthLogs.map((entry) => {
      const isLogin = entry.action === "login";
      return {
        id: entry.id,
        kind: isLogin ? ("squad_login" as const) : ("squad_logout" as const),
        createdAt: entry.created_at,
        squadCode: entry.squad_code,
        squadName: entry.squad_name,
        summary: isLogin ? "Login squadra (app mobile)" : "Logout squadra (app mobile)",
        detail: `Sessione ${entry.session_id.slice(0, 8)}…`,
        status: "registrato" as const,
        actor: entry.squad_code,
      };
    }),
  ];

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Filtra log per tipologia allarme (multipla). `null` = tutti i tipi di log. */
export function filterUnifiedEventLogsByAlarmTypes(
  rows: UnifiedEventLog[],
  selectedTypes: EventLogAlarmFilterCode[] | null,
): UnifiedEventLog[] {
  if (selectedTypes === null) {
    return rows;
  }
  if (selectedTypes.length === 0) {
    return [];
  }
  const wanted = new Set(selectedTypes);
  return rows.filter((row) => {
    const codes = row.alarmTypeCodes;
    if (!codes?.length) {
      return false;
    }
    return codes.some((code) => wanted.has(code as EventLogAlarmFilterCode));
  });
}

export function eventLogAlarmFilterLabel(
  selectedTypes: EventLogAlarmFilterCode[] | null,
): string {
  if (selectedTypes === null) {
    return "Tutti i log";
  }
  if (selectedTypes.length === 0) {
    return "Nessuna tipologia selezionata";
  }
  const labels = EVENT_LOG_ALARM_FILTER_OPTIONS.filter((o) =>
    selectedTypes.includes(o.code),
  ).map((o) => o.label);
  return labels.length > 0 ? labels.join(", ") : "Tutti i log";
}

function csvEscape(value: string): string {
  const v = value.replace(/"/g, '""');
  return `"${v}"`;
}

export function eventLogsToCsv(
  rows: UnifiedEventLog[],
  eventTitle: string,
  filterLabel?: string,
): string {
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

  const filterLine = filterLabel ? `\nFiltro tipologia: ${filterLabel}` : "";
  return `\uFEFFEvento: ${eventTitle}${filterLine}\n${header}\n${lines.join("\n")}\n`;
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

export function eventLogsPrintHtml(
  rows: UnifiedEventLog[],
  eventTitle: string,
  filterLabel?: string,
): string {
  const exportedAt = new Date().toLocaleString("it-IT");
  const filterMeta = filterLabel
    ? `<p class="meta">Filtro tipologia allarme: ${escapeHtml(filterLabel)}</p>`
    : "";
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
  <p class="meta">Esportato: ${escapeHtml(exportedAt)} · Login/logout · allarmi · missioni · push</p>
  ${filterMeta}
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
  filterLabel?: string,
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
  doc.write(eventLogsPrintHtml(rows, eventTitle, filterLabel));
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
