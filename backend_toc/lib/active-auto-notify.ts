import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSquadCodesFromRouting } from "@/lib/alarm-notify-routing";
import { loadAlarmNotifyRoutingRows } from "@/lib/load-alarm-notify-routing";
import { formatAlarmRequestDetail } from "@/lib/squad-alarms";
import { tocPushTextUpper } from "@/lib/toc-push-text";

export type ActiveAutoNotifyDelivery = {
  id: string;
  alarmId: string;
  sourceSquadCode: string;
  sourceSquadName: string;
  recipientSquadCode: string;
  recipientSessionId: string | null;
  pushTitle: string | null;
  pushBody: string | null;
  requestTypes: unknown;
  createdAt: string;
};

export type FetchActiveAutoNotifyOptions = {
  /** Eventi da includere (squadre online, evento attivo, ecc.). */
  eventIds?: string[] | null;
  /** Allarmi volontario ancora aperti sul TOC — include inoltri anche se event_id non coincide. */
  openAlarmIds?: string[] | null;
  /** Per TOC campo: solo allarmi inviati da squadre di quel golf course. */
  sourceSquadCodes?: string[] | null;
};

type AutoNotifyLogRow = {
  id: string;
  alarm_id: string;
  event_id: string;
  squad_code: string;
  squad_name: string;
  recipient_squad_code?: string | null;
  admin_code?: string | null;
  recipient_session_id?: string | null;
  push_title?: string | null;
  push_body?: string | null;
  request_types?: unknown;
  created_at: string;
  status: string;
  mobile_dismissed_at?: string | null;
};

type OnlineSessionRow = {
  id: string;
  squads: { squad_code: string } | { squad_code: string }[] | null;
};

function recipientCode(row: AutoNotifyLogRow): string {
  return (row.recipient_squad_code ?? row.admin_code ?? "").trim().toUpperCase();
}

function squadCodeFromSession(row: OnlineSessionRow): string {
  const squads = row.squads;
  if (!squads) {
    return "";
  }
  if (Array.isArray(squads)) {
    return String(squads[0]?.squad_code ?? "").trim().toUpperCase();
  }
  return String(squads.squad_code ?? "").trim().toUpperCase();
}

async function onlineSessionIdBySquadCode(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("squad_sessions")
    .select("id, squads(squad_code)")
    .eq("is_online", true);

  const out = new Map<string, string>();
  if (error) {
    return out;
  }
  for (const row of (data ?? []) as OnlineSessionRow[]) {
    const code = squadCodeFromSession(row);
    if (code) {
      out.set(code, String(row.id));
    }
  }
  return out;
}

function normalizeIds(ids?: string[] | null): string[] {
  if (!ids?.length) {
    return [];
  }
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function mapRowsToDeliveries(
  data: AutoNotifyLogRow[],
  sessionByCode: Map<string, string>,
  sourceSquadCodes?: string[] | null,
  filterDismissed = true,
): ActiveAutoNotifyDelivery[] {
  const allowedSources =
    sourceSquadCodes === undefined || sourceSquadCodes === null
      ? null
      : new Set(sourceSquadCodes.map((c) => c.trim().toUpperCase()));

  return data
    .map((row) => {
      if (row.status !== "sent") {
        return null;
      }
      if (filterDismissed && row.mobile_dismissed_at) {
        return null;
      }

      const sourceCode = String(row.squad_code ?? "").trim().toUpperCase();
      if (allowedSources && !allowedSources.has(sourceCode)) {
        return null;
      }

      const recipient = recipientCode(row);
      if (!recipient) {
        return null;
      }

      const sessionId =
        row.recipient_session_id ?? sessionByCode.get(recipient) ?? null;

      return {
        id: `mission-${row.alarm_id}-${recipient}`,
        alarmId: row.alarm_id,
        sourceSquadCode: row.squad_code,
        sourceSquadName: row.squad_name,
        recipientSquadCode: recipient,
        recipientSessionId: sessionId ? String(sessionId) : null,
        pushTitle: row.push_title ?? null,
        pushBody: row.push_body ?? null,
        requestTypes: row.request_types,
        createdAt: row.created_at,
      } satisfies ActiveAutoNotifyDelivery;
    })
    .filter((row): row is ActiveAutoNotifyDelivery => row !== null);
}

export async function fetchActiveAutoNotifyDeliveries(
  supabase: SupabaseClient,
  options: FetchActiveAutoNotifyOptions = {},
): Promise<{ rows: ActiveAutoNotifyDelivery[]; error: string | null }> {
  const eventIds = normalizeIds(options.eventIds);
  const openAlarmIds = normalizeIds(options.openAlarmIds);
  const sourceSquadCodes = options.sourceSquadCodes;

  const modernSelect =
    "id, alarm_id, event_id, squad_code, squad_name, recipient_squad_code, admin_code, recipient_session_id, push_title, push_body, request_types, created_at, status, mobile_dismissed_at";

  let query = supabase
    .from("alarm_auto_notify_logs")
    .select(modernSelect)
    .eq("status", "sent")
    .is("mobile_dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(120);

  const orParts: string[] = [];
  if (eventIds.length > 0) {
    orParts.push(`event_id.in.(${eventIds.join(",")})`);
  }
  if (openAlarmIds.length > 0) {
    orParts.push(`alarm_id.in.(${openAlarmIds.join(",")})`);
  }
  if (orParts.length > 0) {
    query = query.or(orParts.join(","));
  }

  let legacySchema = false;
  let data: AutoNotifyLogRow[] | null = null;
  let error: { message: string } | null = null;

  const modernResult = await query;
  data = (modernResult.data ?? null) as AutoNotifyLogRow[] | null;
  error = modernResult.error;

  if (
    error &&
    /recipient_session_id|push_title|push_body|mobile_dismissed_at|column/i.test(
      error.message,
    )
  ) {
    legacySchema = true;
    let legacyQuery = supabase
      .from("alarm_auto_notify_logs")
      .select(
        "id, alarm_id, event_id, squad_code, squad_name, recipient_squad_code, admin_code, request_types, created_at, status",
      )
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(120);

    if (orParts.length > 0) {
      legacyQuery = legacyQuery.or(orParts.join(","));
    }

    const legacyResult = await legacyQuery;
    data = (legacyResult.data ?? null) as AutoNotifyLogRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    if (error.message.includes("alarm_auto_notify_logs")) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }

  const sessionByCode = await onlineSessionIdBySquadCode(supabase);
  const rows = mapRowsToDeliveries(
    (data ?? []) as AutoNotifyLogRow[],
    sessionByCode,
    sourceSquadCodes,
    !legacySchema,
  );

  if (legacySchema && (data?.length ?? 0) > 0 && rows.length === 0) {
    return {
      rows: [],
      error:
        "Per presa in carico TOC esegui sql/alarm_auto_notify_active.sql su Supabase.",
    };
  }

  return { rows, error: null };
}

export function autoNotifyMissionKey(
  row: Pick<ActiveAutoNotifyDelivery, "alarmId" | "recipientSquadCode">,
): string {
  return `${row.alarmId}|${row.recipientSquadCode.trim().toUpperCase()}`;
}

export function activeAutoNotifySig(rows: ActiveAutoNotifyDelivery[]): string {
  return rows.map(autoNotifyMissionKey).sort().join(";");
}

export function formatAutoNotifyMissionDetail(row: ActiveAutoNotifyDelivery): string {
  if (row.pushBody?.trim()) {
    return row.pushBody.trim();
  }
  return formatAlarmRequestDetail({
    request_types: row.requestTypes,
  });
}

type OpenAlarmRow = {
  id: string;
  squad_code: string;
  squad_name: string;
  request_types?: unknown;
  other_detail?: string | null;
  created_at: string;
};

async function dismissedMissionKeysForOpenAlarms(
  supabase: SupabaseClient,
  openAlarmIds: string[],
  alarms: OpenAlarmRow[],
  sessionByCode: Map<string, string>,
): Promise<Set<string>> {
  const dismissed = new Set<string>();

  const { data: logs } = await supabase
    .from("alarm_auto_notify_logs")
    .select(
      "alarm_id, recipient_squad_code, admin_code, mobile_dismissed_at",
    )
    .in("alarm_id", openAlarmIds);

  for (const row of (logs ?? []) as AutoNotifyLogRow[]) {
    if (!row.mobile_dismissed_at) {
      continue;
    }
    const code = recipientCode(row);
    if (code) {
      dismissed.add(`${row.alarm_id}|${code}`);
    }
  }

  const sessionIds = [...new Set(sessionByCode.values())];
  if (sessionIds.length === 0 || alarms.length === 0) {
    return dismissed;
  }

  const { data: dismissRows } = await supabase
    .from("squad_mobile_dismiss_logs")
    .select("session_id, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });

  const latestDismissBySession = new Map<string, string>();
  for (const row of dismissRows ?? []) {
    const sessionId = String(row.session_id ?? "");
    if (!sessionId || latestDismissBySession.has(sessionId)) {
      continue;
    }
    latestDismissBySession.set(sessionId, String(row.created_at ?? ""));
  }

  for (const alarm of alarms) {
    const alarmAt = alarm.created_at;
    for (const [code, sessionId] of sessionByCode) {
      const dismissAt = latestDismissBySession.get(sessionId);
      if (!dismissAt || dismissAt < alarmAt) {
        continue;
      }
      dismissed.add(`${alarm.id}|${code}`);
    }
  }

  return dismissed;
}

/** Se il log DB manca ma l'allarme è aperto e il destinatario è online, mostra comunque la missione GT. */
export async function supplementMissionsFromOpenAlarms(
  supabase: SupabaseClient,
  openAlarmIds: string[],
  existing: ActiveAutoNotifyDelivery[],
  sourceSquadCodes?: string[] | null,
): Promise<ActiveAutoNotifyDelivery[]> {
  if (openAlarmIds.length === 0) {
    return existing;
  }

  const allowedSources =
    sourceSquadCodes === undefined || sourceSquadCodes === null
      ? null
      : new Set(sourceSquadCodes.map((c) => c.trim().toUpperCase()));

  const { data: alarms, error: alarmsErr } = await supabase
    .from("squad_alarms")
    .select("id, squad_code, squad_name, request_types, other_detail, created_at")
    .in("id", openAlarmIds)
    .is("acknowledged_at", null);

  if (alarmsErr || !alarms?.length) {
    return existing;
  }

  const { rows: routingRows, error: routingErr } =
    await loadAlarmNotifyRoutingRows(supabase);
  if (routingErr) {
    return existing;
  }

  const sessionByCode = await onlineSessionIdBySquadCode(supabase);
  const dismissedKeys = await dismissedMissionKeysForOpenAlarms(
    supabase,
    openAlarmIds,
    alarms as OpenAlarmRow[],
    sessionByCode,
  );
  const covered = new Set(
    existing.map((row) => `${row.alarmId}|${row.recipientSquadCode}`),
  );

  const supplement: ActiveAutoNotifyDelivery[] = [];

  for (const alarm of alarms as OpenAlarmRow[]) {
    const sourceCode = String(alarm.squad_code ?? "").trim().toUpperCase();
    if (allowedSources && !allowedSources.has(sourceCode)) {
      continue;
    }

    const detail = formatAlarmRequestDetail(alarm);
    const title = tocPushTextUpper(`ALLARME — ${alarm.squad_code}`);
    const body = tocPushTextUpper(`${alarm.squad_name} — ${detail}`);
    const recipients = resolveSquadCodesFromRouting(
      alarm.request_types,
      routingRows,
    );

    for (const recipient of recipients) {
      const key = `${alarm.id}|${recipient}`;
      if (covered.has(key) || dismissedKeys.has(key)) {
        continue;
      }
      const sessionId = sessionByCode.get(recipient);
      if (!sessionId) {
        continue;
      }

      supplement.push({
        id: `mission-${alarm.id}-${recipient}`,
        alarmId: alarm.id,
        sourceSquadCode: alarm.squad_code,
        sourceSquadName: alarm.squad_name,
        recipientSquadCode: recipient,
        recipientSessionId: sessionId,
        pushTitle: title,
        pushBody: body,
        requestTypes: alarm.request_types,
        createdAt: alarm.created_at,
      });
      covered.add(key);
    }
  }

  return [...existing, ...supplement].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
