import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import { openOperationalEventFromSquadAlarm } from "@/lib/open-operational-event-from-squad-alarm";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAdmin() {
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

export async function POST(request: Request) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Config Supabase mancante." }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const payload = body as {
    session?: AdminSessionData | null;
    alarmId?: string;
  };

  const webhookOk = authorizeWebhook(request);
  const session = payload.session;
  const role = session?.code ? normalizeAdminRole(session.role) : null;
  const sessionOk = role === "admin" || role === "viewer";

  if (!webhookOk && !sessionOk) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const alarmId = typeof payload.alarmId === "string" ? payload.alarmId.trim() : "";
  if (!UUID_RE.test(alarmId)) {
    return NextResponse.json({ error: "alarmId obbligatorio." }, { status: 400 });
  }

  const { data: alarm, error: alarmErr } = await admin
    .from("squad_alarms")
    .select("id, squad_id, squad_code, operational_event_id")
    .eq("id", alarmId)
    .maybeSingle();

  if (alarmErr) {
    return NextResponse.json({ error: alarmErr.message }, { status: 500 });
  }
  if (!alarm) {
    return NextResponse.json({ error: "Allarme non trovato." }, { status: 404 });
  }

  const result = await openOperationalEventFromSquadAlarm(admin, {
    id: String(alarm.id),
    squad_id: String(alarm.squad_id),
    squad_code: String(alarm.squad_code ?? ""),
    operational_event_id:
      typeof alarm.operational_event_id === "string" ? alarm.operational_event_id : null,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    created: result.created,
    skipped: result.skipped,
    event: result.event,
  });
}
