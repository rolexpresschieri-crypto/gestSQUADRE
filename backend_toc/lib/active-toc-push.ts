import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveTocPushDelivery = {
  id: string;
  sessionId: string | null;
  squadCode: string;
  squadName: string;
  adminCode: string;
  title: string;
  body: string;
  isAlarm: boolean;
  createdAt: string;
};

export type FetchActiveTocPushOptions = {
  eventIds?: string[] | null;
  recipientSquadIds?: string[] | null;
};

type TocPushLogRow = {
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
  status: string;
  created_at: string;
  mobile_dismissed_at?: string | null;
  closed_at?: string | null;
};

function normalizeIds(ids?: string[] | null): string[] {
  if (!ids?.length) {
    return [];
  }
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function mapRow(row: TocPushLogRow): ActiveTocPushDelivery | null {
  const squadCode = String(row.squad_code ?? "").trim();
  if (!squadCode) {
    return null;
  }
  return {
    id: row.id,
    sessionId: row.session_id ? String(row.session_id) : null,
    squadCode,
    squadName: String(row.squad_name ?? "").trim() || squadCode,
    adminCode: String(row.admin_code ?? "").trim(),
    title: row.title,
    body: row.body,
    isAlarm: Boolean(row.is_alarm),
    createdAt: row.created_at,
  };
}

export function activeTocPushSig(rows: ActiveTocPushDelivery[]): string {
  return rows
    .map((row) => row.id)
    .sort()
    .join(";");
}

export function formatTocPushMissionDetail(row: ActiveTocPushDelivery): string {
  const body = row.body?.trim();
  if (body) {
    return body;
  }
  return row.title?.trim() || "Messaggio TOC";
}

export async function fetchActiveTocPushDeliveries(
  supabase: SupabaseClient,
  options: FetchActiveTocPushOptions = {},
): Promise<{ rows: ActiveTocPushDelivery[]; error: string | null }> {
  const eventIds = normalizeIds(options.eventIds);
  const recipientSquadIds = normalizeIds(options.recipientSquadIds);

  const modernSelect =
    "id, event_id, session_id, squad_id, squad_code, squad_name, admin_code, title, body, is_alarm, status, created_at, mobile_dismissed_at, closed_at";

  let query = supabase
    .from("toc_push_logs")
    .select(modernSelect)
    .eq("status", "sent")
    .is("mobile_dismissed_at", null)
    .is("closed_at", null)
    .order("created_at", { ascending: false })
    .limit(80);

  if (eventIds.length > 0) {
    query = query.in("event_id", eventIds);
  }
  if (recipientSquadIds.length > 0) {
    query = query.in("squad_id", recipientSquadIds);
  }

  let legacySchema = false;
  let data: TocPushLogRow[] | null = null;
  let error: { message: string } | null = null;

  const modernResult = await query;
  data = (modernResult.data ?? null) as TocPushLogRow[] | null;
  error = modernResult.error;

  if (
    error &&
    /mobile_dismissed_at|closed_at|column/i.test(error.message)
  ) {
    legacySchema = true;
    let legacyQuery = supabase
      .from("toc_push_logs")
      .select(
        "id, event_id, session_id, squad_id, squad_code, squad_name, admin_code, title, body, is_alarm, status, created_at",
      )
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(80);

    if (eventIds.length > 0) {
      legacyQuery = legacyQuery.in("event_id", eventIds);
    }
    if (recipientSquadIds.length > 0) {
      legacyQuery = legacyQuery.in("squad_id", recipientSquadIds);
    }

    const legacyResult = await legacyQuery;
    data = (legacyResult.data ?? null) as TocPushLogRow[] | null;
    error = legacyResult.error;
  }

  if (error) {
    if (error.message.includes("toc_push_logs")) {
      return { rows: [], error: null };
    }
    return { rows: [], error: error.message };
  }

  const rows = ((data ?? []) as TocPushLogRow[])
    .map((row) => {
      if (legacySchema) {
        return mapRow(row);
      }
      if (row.mobile_dismissed_at || row.closed_at) {
        return null;
      }
      return mapRow(row);
    })
    .filter((row): row is ActiveTocPushDelivery => row !== null);

  if (legacySchema && (data?.length ?? 0) > 0 && rows.length === 0) {
    return {
      rows: [],
      error:
        "Per presa in carico push TOC esegui sql/squad_event_flow.sql su Supabase.",
    };
  }

  return { rows, error: null };
}
