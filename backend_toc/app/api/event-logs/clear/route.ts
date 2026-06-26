import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { canManageEventLogs, normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import {
  operationalEventScopeKey,
  resetOperationalEventsForScope,
} from "@/lib/operational-events";
import { fetchGolfCourseSquadIds } from "@/lib/golf-course-scope";

export const runtime = "nodejs";

async function deleteLogsForSquads(
  admin: SupabaseClient,
  squadIds: string[] | null,
  squadCodes: string[] | null,
) {
  const scoped = squadIds != null && squadIds.length > 0;

  const pushDelete = scoped
    ? admin.from("toc_push_logs").delete().in("squad_id", squadIds)
    : admin.from("toc_push_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: pushErr } = await pushDelete;
  if (pushErr) {
    return pushErr.message;
  }

  const alarmDelete = scoped
    ? admin.from("squad_alarms").delete().in("squad_id", squadIds)
    : admin.from("squad_alarms").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: alarmErr } = await alarmDelete;
  if (alarmErr) {
    return alarmErr.message;
  }

  const missionCloseDelete = scoped
    ? admin.from("toc_mission_close_logs").delete().in("squad_id", squadIds)
    : admin
        .from("toc_mission_close_logs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: missionCloseErr } = await missionCloseDelete;
  if (missionCloseErr && !missionCloseErr.message.includes("toc_mission_close_logs")) {
    return missionCloseErr.message;
  }

  const mobileDismissDelete = scoped
    ? admin.from("squad_mobile_dismiss_logs").delete().in("squad_id", squadIds)
    : admin
        .from("squad_mobile_dismiss_logs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: mobileDismissErr } = await mobileDismissDelete;
  if (mobileDismissErr && !mobileDismissErr.message.includes("squad_mobile_dismiss_logs")) {
    return mobileDismissErr.message;
  }

  const forceDismissDelete =
    scoped && squadCodes?.length
      ? admin.from("toc_mission_force_dismiss_logs").delete().in("squad_code", squadCodes)
      : admin
          .from("toc_mission_force_dismiss_logs")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: forceDismissErr } = await forceDismissDelete;
  if (
    forceDismissErr &&
    !forceDismissErr.message.includes("toc_mission_force_dismiss_logs")
  ) {
    return forceDismissErr.message;
  }

  const sessionAuthDelete = scoped
    ? admin.from("squad_session_auth_logs").delete().in("squad_id", squadIds)
    : admin
        .from("squad_session_auth_logs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: sessionAuthErr } = await sessionAuthDelete;
  if (sessionAuthErr && !sessionAuthErr.message.includes("squad_session_auth_logs")) {
    return sessionAuthErr.message;
  }

  const autoNotifyDelete =
    scoped && squadCodes?.length
      ? admin.from("alarm_auto_notify_logs").delete().in("squad_code", squadCodes)
      : admin
          .from("alarm_auto_notify_logs")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: autoNotifyErr } = await autoNotifyDelete;
  if (autoNotifyErr && !autoNotifyErr.message.includes("alarm_auto_notify_logs")) {
    return autoNotifyErr.message;
  }

  let photoQuery = admin.from("squad_field_photo_logs").select("storage_path");
  if (scoped && squadCodes?.length) {
    photoQuery = photoQuery.in("squad_code", squadCodes);
  }
  const { data: photoRows, error: photoSelectErr } = await photoQuery;
  if (photoSelectErr && !photoSelectErr.message.includes("squad_field_photo_logs")) {
    return photoSelectErr.message;
  }

  const storagePaths =
    (photoRows as { storage_path?: string | null }[] | null)
      ?.map((row) =>
        typeof row.storage_path === "string" ? row.storage_path.trim() : "",
      )
      .filter(Boolean) ?? [];

  if (storagePaths.length > 0) {
    const { error: storageErr } = await admin.storage
      .from("squad-photos")
      .remove(storagePaths);
    if (storageErr) {
      return storageErr.message;
    }
  }

  const photoDelete =
    scoped && squadCodes?.length
      ? admin.from("squad_field_photo_logs").delete().in("squad_code", squadCodes)
      : admin
          .from("squad_field_photo_logs")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: photoDeleteErr } = await photoDelete;
  if (photoDeleteErr && !photoDeleteErr.message.includes("squad_field_photo_logs")) {
    return photoDeleteErr.message;
  }

  return null;
}

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
    return NextResponse.json({ error: "Solo admin può resettare i log." }, { status: 403 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const golfCourseId = session.golfCourseId ?? null;
  let squadIds: string[] | null = null;
  let squadCodes: string[] | null = null;

  if (golfCourseId) {
    squadIds = await fetchGolfCourseSquadIds(admin, golfCourseId);
    if (squadIds.length === 0) {
      return NextResponse.json({ ok: true });
    }
    const { data: squadRows } = await admin
      .from("squads")
      .select("squad_code")
      .in("id", squadIds);
    squadCodes =
      squadRows?.map((r) => String(r.squad_code).trim().toUpperCase()).filter(Boolean) ??
      [];
  }

  const deleteErr = await deleteLogsForSquads(admin, squadIds, squadCodes);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr }, { status: 500 });
  }

  const scopeKey = operationalEventScopeKey(golfCourseId);
  const { error: resetErr } = await resetOperationalEventsForScope(
    admin,
    scopeKey,
    golfCourseId,
  );
  if (resetErr) {
    return NextResponse.json({ error: resetErr }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
