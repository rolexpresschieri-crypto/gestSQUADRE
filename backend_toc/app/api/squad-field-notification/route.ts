import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import { insertSquadFieldNotification } from "@/lib/squad-field-notification";
import { forwardVolunteerAlarmToOperators } from "@/lib/forward-volunteer-alarm";

export const runtime = "nodejs";

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
    sessionId?: string;
    requestTypes?: string[];
    otherDetail?: string | null;
  };

  const session = payload.session;
  if (!session?.code) {
    return NextResponse.json({ error: "Sessione TOC assente" }, { status: 401 });
  }

  const role = normalizeAdminRole(session.role);
  if (role !== "admin" && role !== "viewer") {
    return NextResponse.json({ error: "Ruolo non autorizzato." }, { status: 403 });
  }

  const sessionId =
    typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  const requestTypes = Array.isArray(payload.requestTypes)
    ? payload.requestTypes.map((v) => String(v))
    : [];

  const inserted = await insertSquadFieldNotification(admin, sessionId, {
    requestTypes,
    otherDetail:
      typeof payload.otherDetail === "string" ? payload.otherDetail : null,
  });

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error }, { status: 400 });
  }

  const { data: alarm } = await admin
    .from("squad_alarms")
    .select(
      "id, event_id, session_id, squad_id, squad_code, squad_name, message, request_types, other_detail, created_at",
    )
    .eq("id", inserted.alarmId)
    .maybeSingle();

  if (alarm) {
    try {
      await forwardVolunteerAlarmToOperators(admin, alarm);
    } catch {
      // La segnalazione è registrata; l'inoltro GT può essere ritentato dal TOC.
    }
  }

  return NextResponse.json({
    ok: true,
    alarmId: inserted.alarmId,
    detail: inserted.detail,
  });
}
