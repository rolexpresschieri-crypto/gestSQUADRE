import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { openOperationalEventFromFieldSession } from "@/lib/open-operational-event-from-squad-alarm";

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

  const payload = body as { sessionId?: string };
  const sessionId =
    typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";

  const result = await openOperationalEventFromFieldSession(admin, sessionId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (result.skipped) {
    return NextResponse.json(
      { error: "Squadra non autorizzata ad apertura eventi." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    event: result.event,
    created: result.created,
  });
}
