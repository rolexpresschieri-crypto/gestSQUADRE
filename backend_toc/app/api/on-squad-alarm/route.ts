import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import {
  forwardVolunteerAlarmToOperators,
  type SquadAlarmNotifyRow,
} from "@/lib/forward-volunteer-alarm";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getServiceSupabase() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return null;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authorizeWebhook(request: Request): boolean {
  const secret = process.env.SQUAD_ALARM_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return false;
  }
  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) {
    return true;
  }
  const headerSecret = request.headers.get("x-squad-alarm-secret")?.trim();
  return headerSecret === secret;
}

function parseAlarmRow(body: unknown): SquadAlarmNotifyRow | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const payload = body as Record<string, unknown>;
  const record =
    payload.record && typeof payload.record === "object"
      ? (payload.record as Record<string, unknown>)
      : payload;

  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!UUID_RE.test(id)) {
    return null;
  }

  const eventId =
    typeof record.event_id === "string" ? record.event_id.trim() : "";
  const sessionId =
    typeof record.session_id === "string" ? record.session_id.trim() : "";
  const squadId =
    typeof record.squad_id === "string" ? record.squad_id.trim() : "";
  const squadCode =
    typeof record.squad_code === "string" ? record.squad_code.trim() : "";
  const squadName =
    typeof record.squad_name === "string" ? record.squad_name.trim() : "";
  const createdAt =
    typeof record.created_at === "string" ? record.created_at : "";

  if (
    !UUID_RE.test(eventId) ||
    !UUID_RE.test(sessionId) ||
    !UUID_RE.test(squadId) ||
    !squadCode ||
    !squadName
  ) {
    return null;
  }

  return {
    id,
    event_id: eventId,
    session_id: sessionId,
    squad_id: squadId,
    squad_code: squadCode,
    squad_name: squadName,
    message: typeof record.message === "string" ? record.message : null,
    request_types: record.request_types,
    other_detail:
      typeof record.other_detail === "string" ? record.other_detail : null,
    created_at: createdAt,
  };
}

function authorizeSession(session: AdminSessionData | null | undefined): boolean {
  const role = session?.code ? normalizeAdminRole(session.role) : null;
  return role === "admin" || role === "viewer";
}

export async function POST(request: Request) {
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY o URL mancanti.", code: "CONFIG" },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const payload = body as {
    alarmId?: string;
    session?: AdminSessionData | null;
  };

  const webhookOk = authorizeWebhook(request);
  const sessionOk = authorizeSession(payload.session);
  if (!webhookOk && !sessionOk) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  let alarm: SquadAlarmNotifyRow | null = parseAlarmRow(body);

  if (!alarm && typeof payload.alarmId === "string" && UUID_RE.test(payload.alarmId)) {
    const { data, error } = await admin
      .from("squad_alarms")
      .select(
        "id, event_id, session_id, squad_id, squad_code, squad_name, message, request_types, other_detail, created_at",
      )
      .eq("id", payload.alarmId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) {
      alarm = data as SquadAlarmNotifyRow;
    }
  }

  if (!alarm) {
    return NextResponse.json(
      { error: "Record allarme non valido." },
      { status: 400 },
    );
  }

  try {
    const result = await forwardVolunteerAlarmToOperators(admin, alarm);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Errore inoltro allarme";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
