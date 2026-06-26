import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isGlobalTocAdmin, normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";

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
    routeId?: string;
    targetWaypointId?: string | null;
    operationalEventId?: string | null;
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
  const routeId = typeof payload.routeId === "string" ? payload.routeId.trim() : "";
  if (!UUID_RE.test(sessionId) || !UUID_RE.test(routeId)) {
    return NextResponse.json(
      { error: "sessionId e routeId UUID obbligatori." },
      { status: 400 },
    );
  }

  const targetWaypointId =
    typeof payload.targetWaypointId === "string" && payload.targetWaypointId.trim()
      ? payload.targetWaypointId.trim()
      : null;
  if (targetWaypointId && !UUID_RE.test(targetWaypointId)) {
    return NextResponse.json({ error: "targetWaypointId UUID non valido." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const operationalEventIdRaw =
    typeof payload.operationalEventId === "string"
      ? payload.operationalEventId.trim()
      : "";
  let operationalEventId: string | null = null;
  if (operationalEventIdRaw) {
    if (!UUID_RE.test(operationalEventIdRaw)) {
      return NextResponse.json(
        { error: "operationalEventId UUID non valido." },
        { status: 400 },
      );
    }
    const { validateOpenOperationalEvent } = await import("@/lib/operational-events");
    const { error: opErr } = await validateOpenOperationalEvent(
      admin,
      operationalEventIdRaw,
      adminSession.golfCourseId ?? null,
    );
    if (opErr) {
      return NextResponse.json({ error: opErr }, { status: 409 });
    }
    operationalEventId = operationalEventIdRaw;
  }

  const { data: routeRow, error: routeErr } = await admin
    .from("map_routes")
    .select("id, route_code, golf_course_id")
    .eq("id", routeId)
    .eq("is_enabled", true)
    .maybeSingle();

  if (routeErr) {
    return NextResponse.json({ error: routeErr.message }, { status: 500 });
  }
  if (!routeRow) {
    return NextResponse.json({ error: "Via non trovata." }, { status: 404 });
  }

  if (
    adminSession.golfCourseId &&
    routeRow.golf_course_id !== adminSession.golfCourseId
  ) {
    return NextResponse.json(
      { error: "Via non appartiene al tuo campo." },
      { status: 403 },
    );
  }
  if (!adminSession.golfCourseId && !isGlobalTocAdmin(adminSession)) {
    return NextResponse.json({ error: "Admin senza campo golf." }, { status: 403 });
  }

  const { data: sessionRow, error: sessionErr } = await admin
    .from("squad_sessions")
    .select("id, is_online, squads!inner(golf_course_id)")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }
  if (!sessionRow?.is_online) {
    return NextResponse.json({ error: "Sessione non online." }, { status: 409 });
  }

  const squadJoin = sessionRow.squads as { golf_course_id: string | null } | { golf_course_id: string | null }[];
  const squadCourseId = Array.isArray(squadJoin) ? squadJoin[0]?.golf_course_id : squadJoin?.golf_course_id;
  if (squadCourseId && squadCourseId !== routeRow.golf_course_id) {
    return NextResponse.json(
      { error: "La via non è dello stesso campo della squadra." },
      { status: 409 },
    );
  }

  await admin
    .from("squad_route_assignments")
    .update({ cleared_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("cleared_at", null);

  const insertRow = {
    session_id: sessionId,
    route_id: routeId,
    target_waypoint_id: targetWaypointId,
    assigned_by_admin_code: adminSession.code,
    operational_event_id: operationalEventId,
  };

  let insertResult = await admin
    .from("squad_route_assignments")
    .insert(insertRow)
    .select("id, assigned_at")
    .single();

  if (
    insertResult.error &&
    /operational_event_id|column/i.test(insertResult.error.message)
  ) {
    insertResult = await admin
      .from("squad_route_assignments")
      .insert({
        session_id: sessionId,
        route_id: routeId,
        target_waypoint_id: targetWaypointId,
        assigned_by_admin_code: adminSession.code,
      })
      .select("id, assigned_at")
      .single();
  }

  if (insertResult.error) {
    return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
  }

  const inserted = insertResult.data;

  return NextResponse.json({
    ok: true,
    assignmentId: inserted.id,
    routeCode: routeRow.route_code,
    assignedAt: inserted.assigned_at,
  });
}
