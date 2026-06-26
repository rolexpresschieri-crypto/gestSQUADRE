import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { canManageEventLogs, normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";

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

  const payload = body as { session?: AdminSessionData | null; eventId?: string };
  const session = payload.session;
  if (!session?.code) {
    return NextResponse.json({ error: "Sessione TOC assente" }, { status: 401 });
  }

  const role = normalizeAdminRole(session.role);
  if (!canManageEventLogs(role)) {
    return NextResponse.json({ error: "Solo admin può cancellare i log." }, { status: 403 });
  }

  const eventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
  if (!eventId) {
    return NextResponse.json({ error: "eventId obbligatorio" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: pushErr } = await admin
    .from("toc_push_logs")
    .delete()
    .eq("event_id", eventId);

  if (pushErr) {
    return NextResponse.json({ error: pushErr.message }, { status: 500 });
  }

  const { error: alarmErr } = await admin
    .from("squad_alarms")
    .delete()
    .eq("event_id", eventId);

  if (alarmErr) {
    return NextResponse.json({ error: alarmErr.message }, { status: 500 });
  }

  const { error: missionCloseErr } = await admin
    .from("toc_mission_close_logs")
    .delete()
    .eq("event_id", eventId);

  if (missionCloseErr && !missionCloseErr.message.includes("toc_mission_close_logs")) {
    return NextResponse.json({ error: missionCloseErr.message }, { status: 500 });
  }

  const { error: mobileDismissErr } = await admin
    .from("squad_mobile_dismiss_logs")
    .delete()
    .eq("event_id", eventId);

  if (mobileDismissErr && !mobileDismissErr.message.includes("squad_mobile_dismiss_logs")) {
    return NextResponse.json({ error: mobileDismissErr.message }, { status: 500 });
  }

  const { error: forceDismissErr } = await admin
    .from("toc_mission_force_dismiss_logs")
    .delete()
    .eq("event_id", eventId);

  if (
    forceDismissErr &&
    !forceDismissErr.message.includes("toc_mission_force_dismiss_logs")
  ) {
    return NextResponse.json({ error: forceDismissErr.message }, { status: 500 });
  }

  const { error: sessionAuthErr } = await admin
    .from("squad_session_auth_logs")
    .delete()
    .eq("event_id", eventId);

  if (sessionAuthErr && !sessionAuthErr.message.includes("squad_session_auth_logs")) {
    return NextResponse.json({ error: sessionAuthErr.message }, { status: 500 });
  }

  const { data: photoRows, error: photoSelectErr } = await admin
    .from("squad_field_photo_logs")
    .select("storage_path")
    .eq("event_id", eventId);

  if (photoSelectErr && !photoSelectErr.message.includes("squad_field_photo_logs")) {
    return NextResponse.json({ error: photoSelectErr.message }, { status: 500 });
  }

  const storagePaths =
    photoRows
      ?.map((row) =>
        typeof row.storage_path === "string" ? row.storage_path.trim() : "",
      )
      .filter(Boolean) ?? [];

  if (storagePaths.length > 0) {
    const { error: storageErr } = await admin.storage
      .from("squad-photos")
      .remove(storagePaths);
    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 500 });
    }
  }

  const { error: photoDeleteErr } = await admin
    .from("squad_field_photo_logs")
    .delete()
    .eq("event_id", eventId);

  if (photoDeleteErr && !photoDeleteErr.message.includes("squad_field_photo_logs")) {
    return NextResponse.json({ error: photoDeleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
