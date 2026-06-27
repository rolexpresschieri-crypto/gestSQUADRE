import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import {
  forceDismissGtNotifyLog,
  forceDismissTocPushLog,
} from "@/lib/force-mission-dismiss";

export const runtime = "nodejs";

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
    kind?: string;
    id?: string;
    logId?: string;
    alarmId?: string;
    recipientSquadCode?: string;
    recipientSessionId?: string;
  };

  const adminSession = payload.session;
  if (!adminSession?.code) {
    return NextResponse.json({ error: "Sessione TOC assente" }, { status: 401 });
  }

  const role = normalizeAdminRole(adminSession.role);
  if (role !== "admin" && role !== "campo" && role !== "viewer") {
    return NextResponse.json({ error: "Ruolo non autorizzato." }, { status: 403 });
  }

  const kind = payload.kind?.trim();
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (kind === "toc_push") {
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    const result = await forceDismissTocPushLog(admin, id, adminSession.code);
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Reset fallito." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, kind, sessionId: result.sessionId ?? null });
  }

  if (kind === "gt_notify") {
    const logId =
      (typeof payload.logId === "string" ? payload.logId.trim() : "") ||
      (typeof payload.id === "string" ? payload.id.trim() : "");
    const result = await forceDismissGtNotifyLog(admin, adminSession.code, {
      logId,
      alarmId: payload.alarmId,
      recipientSquadCode: payload.recipientSquadCode,
      recipientSessionId: payload.recipientSessionId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? "Reset fallito." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, kind, updatedCount: result.updatedCount });
  }

  return NextResponse.json({ error: "kind deve essere toc_push o gt_notify." }, { status: 400 });
}
