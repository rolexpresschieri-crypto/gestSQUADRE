import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import { closeTocSquadPanel } from "@/lib/notify-squad-panel-clear";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceKey) {
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
  };

  const adminSession = payload.session;
  if (!adminSession?.code) {
    return NextResponse.json({ error: "Sessione TOC assente" }, { status: 401 });
  }

  const role = normalizeAdminRole(adminSession.role);
  if (role !== "admin" && role !== "campo" && role !== "viewer") {
    return NextResponse.json({ error: "Ruolo non autorizzato." }, { status: 403 });
  }

  const sessionId =
    typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: "sessionId UUID obbligatorio" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await closeTocSquadPanel(admin, sessionId, adminSession.code);

  return NextResponse.json({ ok: true });
}
