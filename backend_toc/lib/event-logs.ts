import { formatEventLogActor } from "@/lib/admin-auth";
import { formatAlarmRequestDetail, parseAlarmRequestTypes } from "@/lib/squad-alarms";
import { formatPhotoGpsDetail } from "@/lib/squad-field-photos";
import {
  inferUniqueOperationalEventId,
  type OperationalEventTargetRow,
} from "@/lib/operational-events";

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
  operational_event_id?: string | null;
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
  operational_event_id?: string | null;
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

export type SquadFieldPhotoLogRow = {
  id: string;
  event_id: string | null;
  session_id: string;
  squad_id: string;
  squad_code: string;
  squad_name: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  note: string | null;
  storage_path: string | null;
  status: "inviato" | "fallito";
  error_message: string | null;
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
  operational_event_id?: string | null;
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
  operational_event_id?: string | null;
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

export type OperationalEventLogMeta = {
  displayNumber: number;
  interventionRef: string | null;
};

export type OperationalEventLogSourceRow = {
  id: string;
  display_number: number;
  intervention_ref?: string | null;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  opened_by_admin_code: string;
  closed_by_admin_code?: string | null;
  request_types?: string[] | null;
  other_detail?: string | null;
  target_squad_id?: string | null;
  target_session_id?: string | null;
};

export type UnifiedEventLog = {
  id: string;
  kind:
    | "squad_alarm"
    | "squad_login"
    | "squad_logout"
    | "fine_evento"
    | "operational_event_open"
    | "operational_event_close"
    | "toc_push"
    | "toc_push_close"
    | "toc_mission_close"
    | "toc_force_dismiss"
    | "mobile_dismiss"
    | "squad_field_photo"
    | "alarm_auto_notify";
  createdAt: string;
  squadCode: string;
  squadName: string;
  summary: string;
  detail: string;
  status: string;
  actor: string;
  operationalEventNumber: number | null;
  interventionRef: string | null;
  /** Tipologie allarme (solo righe legate a squad_alarms / inoltri GT). */
  alarmTypeCodes?: string[];
  /** Download JPEG (solo invio foto con status inviato). */
  photoId?: string;
};

function operationalLogFields(
  operationalEventId: string | null | undefined,
  metaById: Map<string, OperationalEventLogMeta>,
): Pick<UnifiedEventLog, "operationalEventNumber" | "interventionRef"> {
  if (!operationalEventId) {
    return { operationalEventNumber: null, interventionRef: null };
  }
  const meta = metaById.get(operationalEventId);
  return {
    operationalEventNumber: meta?.displayNumber ?? null,
    interventionRef: meta?.interventionRef ?? null,
  };
}

function resolveOperationalLogFields(
  explicitOperationalEventId: string | null | undefined,
  sessionId: string | null | undefined,
  squadId: string | null | undefined,
  createdAt: string,
  operationalEvents: OperationalEventTargetRow[],
  metaById: Map<string, OperationalEventLogMeta>,
): Pick<UnifiedEventLog, "operationalEventNumber" | "interventionRef"> {
  const explicit = explicitOperationalEventId?.trim() || null;
  const inferred =
    explicit ??
    inferUniqueOperationalEventId(
      operationalEvents,
      sessionId?.trim() ?? "",
      squadId?.trim() ?? "",
      createdAt,
    );
  return operationalLogFields(inferred, metaById);
}

export function sortUnifiedEventLogs(rows: UnifiedEventLog[]): UnifiedEventLog[] {
  return sortUnifiedEventLogsByColumn(rows, "operationalEventNumber", "asc");
}

export type EventLogSortColumn =
  | "operationalEventNumber"
  | "interventionRef"
  | "createdAt"
  | "summary"
  | "squadCode"
  | "status"
  | "actor";

function compareUnifiedEventLogColumn(
  a: UnifiedEventLog,
  b: UnifiedEventLog,
  column: EventLogSortColumn,
): number {
  switch (column) {
    case "operationalEventNumber": {
      const an = a.operationalEventNumber ?? Number.MAX_SAFE_INTEGER;
      const bn = b.operationalEventNumber ?? Number.MAX_SAFE_INTEGER;
      return an - bn;
    }
    case "interventionRef":
      return (a.interventionRef ?? "").localeCompare(b.interventionRef ?? "", "it", {
        sensitivity: "base",
      });
    case "createdAt":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case "summary":
      return a.summary.localeCompare(b.summary, "it", { sensitivity: "base" });
    case "squadCode": {
      const as = `${a.squadCode} ${a.squadName}`;
      const bs = `${b.squadCode} ${b.squadName}`;
      return as.localeCompare(bs, "it", { sensitivity: "base" });
    }
    case "status":
      return a.status.localeCompare(b.status, "it", { sensitivity: "base" });
    case "actor":
      return a.actor.localeCompare(b.actor, "it", { sensitivity: "base" });
    default:
      return 0;
  }
}

export function sortUnifiedEventLogsByColumn(
  rows: UnifiedEventLog[],
  column: EventLogSortColumn,
  direction: "asc" | "desc",
): UnifiedEventLog[] {
  const mul = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = compareUnifiedEventLogColumn(a, b, column);
    if (cmp === 0) {
      if (column !== "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (cmp === 0 && column !== "operationalEventNumber") {
        const an = a.operationalEventNumber ?? Number.MAX_SAFE_INTEGER;
        const bn = b.operationalEventNumber ?? Number.MAX_SAFE_INTEGER;
        cmp = an - bn;
      }
    }
    return cmp * mul;
  });
}

export function mergeEventLogs(
  alarms: SquadAlarmLogRow[],
  pushes: TocPushLogRow[],
  missionCloses: TocMissionCloseLogRow[] = [],
  mobileDismisses: SquadMobileDismissLogRow[] = [],
  sessionAuthLogs: SquadSessionAuthLogRow[] = [],
  autoNotifies: AlarmAutoNotifyLogRow[] = [],
  forceDismisses: TocMissionForceDismissLogRow[] = [],
  fieldPhotos: SquadFieldPhotoLogRow[] = [],
  operationalEventMetaById: Map<string, OperationalEventLogMeta> = new Map(),
  operationalEvents: OperationalEventLogSourceRow[] = [],
): UnifiedEventLog[] {
  const emptyOp = { operationalEventNumber: null, interventionRef: null };

  const operationalLifecycleRows: UnifiedEventLog[] = [];
  for (const ev of operationalEvents) {
    const displayNumber = Number(ev.display_number);
    const interventionRef = ev.intervention_ref?.trim() || null;
    const openedBy = ev.opened_by_admin_code?.trim() || "—";
    const typeLabel = formatAlarmRequestDetail({
      request_types: ev.request_types,
      other_detail: ev.other_detail,
    });
    const baseDetail =
      typeLabel && typeLabel !== "Richiesta intervento TOC da squadra"
        ? typeLabel
        : "Evento operativo";
    operationalLifecycleRows.push({
      id: `${ev.id}-open`,
      kind: "operational_event_open",
      createdAt: ev.opened_at,
      squadCode: openedBy,
      squadName: "—",
      summary: "Apertura evento operativo",
      detail:
        interventionRef != null
          ? `${baseDetail} · Evento n° ${displayNumber} · N° intervento ${interventionRef}`
          : `${baseDetail} · Evento operativo n° ${displayNumber}`,
      status: ev.status === "chiuso" ? "chiuso" : "aperto",
      actor: formatEventLogActor(openedBy),
      operationalEventNumber: displayNumber,
      interventionRef,
    });
    if (ev.status === "chiuso" && ev.closed_at) {
      operationalLifecycleRows.push({
        id: `${ev.id}-close`,
        kind: "operational_event_close",
        createdAt: ev.closed_at,
        squadCode: openedBy,
        squadName: "—",
        summary: "Chiusura evento operativo",
        detail: `Evento operativo n° ${displayNumber} chiuso`,
        status: "chiuso",
        actor: ev.closed_by_admin_code?.trim()
          ? formatEventLogActor(ev.closed_by_admin_code)
          : "TOC",
        operationalEventNumber: displayNumber,
        interventionRef,
      });
    }
  }
  const alarmRows: UnifiedEventLog[] = [];
  for (const a of alarms) {
    const typeCodes = parseAlarmRequestTypes(a.request_types);
    const opFields = resolveOperationalLogFields(
      a.operational_event_id,
      a.session_id,
      a.squad_id,
      a.created_at,
      operationalEvents,
      operationalEventMetaById,
    );
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
      ...opFields,
      alarmTypeCodes: typeCodes,
    });
    if (a.acknowledged_at) {
      const opFieldsFine = resolveOperationalLogFields(
        a.operational_event_id,
        a.session_id,
        a.squad_id,
        a.acknowledged_at,
        operationalEvents,
        operationalEventMetaById,
      );
      alarmRows.push({
        id: `${a.id}-fine-evento`,
        kind: "fine_evento",
        createdAt: a.acknowledged_at,
        squadCode: a.squad_code,
        squadName: a.squad_name,
        summary: "Fine evento (TOC)",
        detail: formatAlarmRequestDetail(a),
        status: "chiuso",
        actor: formatEventLogActor(a.acknowledged_by),
        ...opFieldsFine,
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
    const actor = formatEventLogActor(p.admin_code);

    const opFields = resolveOperationalLogFields(
      p.operational_event_id,
      p.session_id,
      p.squad_id,
      p.created_at,
      operationalEvents,
      operationalEventMetaById,
    );

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
        ...opFields,
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
      ...opFields,
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
        actor: formatEventLogActor(p.closed_by),
        ...opFields,
      });
    }
  }

  const autoNotifyRows: UnifiedEventLog[] = autoNotifies.map((n) => {
    const failed = n.status === "failed";
    const skipped = n.status === "skipped";
    const recipient = autoNotifyRecipientCode(n);
    const typeCodes = parseAlarmRequestTypes(n.request_types);
    const sourceAlarm = alarms.find((a) => a.id === n.alarm_id);
    const opFields = resolveOperationalLogFields(
      sourceAlarm?.operational_event_id,
      sourceAlarm?.session_id,
      sourceAlarm?.squad_id,
      n.created_at,
      operationalEvents,
      operationalEventMetaById,
    );
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
      ...opFields,
      alarmTypeCodes: typeCodes,
    };
  });

  const rows: UnifiedEventLog[] = [
    ...operationalLifecycleRows,
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
      ...resolveOperationalLogFields(
        null,
        d.session_id,
        d.squad_id,
        d.created_at,
        operationalEvents,
        operationalEventMetaById,
      ),
    })),
    ...fieldPhotos.map((p) => ({
      id: p.id,
      kind: "squad_field_photo" as const,
      createdAt: p.created_at,
      squadCode: p.squad_code,
      squadName: p.squad_name,
      summary: "Invio foto",
      detail: formatPhotoGpsDetail(
        p.latitude,
        p.longitude,
        p.accuracy_m,
        p.note,
      ),
      status: p.status,
      actor: p.squad_code,
      ...emptyOp,
      photoId: p.status === "inviato" && p.storage_path ? p.id : undefined,
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
      actor: formatEventLogActor(f.admin_code),
      ...operationalLogFields(f.operational_event_id, operationalEventMetaById),
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
      actor: formatEventLogActor(m.admin_code),
      ...operationalLogFields(m.operational_event_id, operationalEventMetaById),
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
        ...emptyOp,
      };
    }),
  ];

  return sortUnifiedEventLogs(rows);
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
    "N° evento",
    "N° intervento",
    "Data/ora",
    "Tipo",
    "Squadra",
    "Nome squadra",
    "Dettaglio",
    "Stato",
    "Operatore",
    "Foto",
  ].join(";");

  const lines = rows.map((r) =>
    [
      r.operationalEventNumber != null ? String(r.operationalEventNumber) : "",
      r.interventionRef ?? "",
      new Date(r.createdAt).toLocaleString("it-IT"),
      r.summary,
      r.squadCode,
      r.squadName,
      r.detail,
      r.status,
      r.actor,
      r.photoId ? "Scarica JPEG" : "",
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
        <td>${r.operationalEventNumber != null ? escapeHtml(String(r.operationalEventNumber)) : ""}</td>
        <td>${escapeHtml(r.interventionRef ?? "")}</td>
        <td>${escapeHtml(new Date(r.createdAt).toLocaleString("it-IT"))}</td>
        <td>${escapeHtml(r.summary)}</td>
        <td>${escapeHtml(r.squadCode)}</td>
        <td>${escapeHtml(r.squadName)}</td>
        <td>${escapeHtml(r.detail)}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.actor)}</td>
        <td>${r.photoId ? "Scarica JPEG" : ""}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Log eventi gestSQUADRE</title>
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
  <h1>Log eventi: ${escapeHtml(eventTitle)}</h1>
  <p class="meta">Esportato: ${escapeHtml(exportedAt)} · Login/logout · allarmi · notifiche · push</p>
  ${filterMeta}
  <table>
    <thead>
      <tr>
        <th>N° evento</th>
        <th>N° intervento</th>
        <th>Data/ora</th>
        <th>Tipo</th>
        <th>Squadra</th>
        <th>Nome</th>
        <th>Dettaglio messaggio</th>
        <th>Stato</th>
        <th>Operatore</th>
        <th>Foto</th>
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
