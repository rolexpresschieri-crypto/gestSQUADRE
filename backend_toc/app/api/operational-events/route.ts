import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import {
  mapOperationalEventRow,
  OPERATIONAL_EVENT_SELECT,
  OPERATIONAL_EVENT_BASE_SELECT,
  fetchOperationalEventById,
  isMissingRequestTypesColumn,
  type OperationalEventRow,
} from "@/lib/operational-events";
import { openOperationalEvent } from "@/lib/open-operational-event-core";

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

export async function GET(request: Request) {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Config Supabase mancante." }, { status: 501 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim() || "aperto";
  const golfCourseId = url.searchParams.get("golfCourseId")?.trim() || null;

  let query = admin
    .from("operational_events")
    .select(OPERATIONAL_EVENT_SELECT)
    .order("display_number", { ascending: true });

  if (status === "aperto") {
    query = query.eq("status", "aperto");
  } else if (status === "chiuso") {
    query = query.eq("status", "chiuso");
  }

  if (golfCourseId) {
    query = query.eq("golf_course_id", golfCourseId);
  }

  let { data, error } = await query;
  if (error && isMissingRequestTypesColumn(error.message)) {
    let fallbackQuery = admin
      .from("operational_events")
      .select(OPERATIONAL_EVENT_BASE_SELECT)
      .order("display_number", { ascending: true });
    if (status === "aperto") {
      fallbackQuery = fallbackQuery.eq("status", "aperto");
    } else if (status === "chiuso") {
      fallbackQuery = fallbackQuery.eq("status", "chiuso");
    }
    if (golfCourseId) {
      fallbackQuery = fallbackQuery.eq("golf_course_id", golfCourseId);
    }
    const fallback = await fallbackQuery;
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error) {
    if (error.message.includes("operational_events")) {
      return NextResponse.json({
        rows: [],
        schemaMissing: true,
        error: "Esegui sql/operational_events.sql su Supabase.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: ((data ?? []) as OperationalEventRow[]).map(mapOperationalEventRow),
    schemaMissing: false,
    error: null,
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
    action?: string;
    operationalEventId?: string;
    interventionRef?: string;
    targetSessionId?: string;
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

  const action = typeof payload.action === "string" ? payload.action.trim() : "";
  const golfCourseId = session.golfCourseId ?? null;

  if (action === "open") {
    const targetSessionId =
      typeof payload.targetSessionId === "string"
        ? payload.targetSessionId.trim()
        : "";
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(targetSessionId)) {
      return NextResponse.json(
        { error: "Seleziona una squadra target online." },
        { status: 400 },
      );
    }

    const { data: sessionRow, error: sessionErr } = await admin
      .from("squad_sessions")
      .select("id, is_online, squad_id, squads(golf_course_id)")
      .eq("id", targetSessionId)
      .maybeSingle();

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    }
    if (!sessionRow?.is_online) {
      return NextResponse.json(
        { error: "La squadra target non è online." },
        { status: 409 },
      );
    }

    const squadId = String(sessionRow.squad_id ?? "");
    const squadGolfCourseId =
      (sessionRow.squads as { golf_course_id?: string | null } | null)?.golf_course_id ??
      null;
    if (golfCourseId && squadGolfCourseId && golfCourseId !== squadGolfCourseId) {
      return NextResponse.json(
        { error: "La squadra target non appartiene al tuo campo." },
        { status: 403 },
      );
    }

    const result = await openOperationalEvent(admin, {
      golfCourseId: golfCourseId ?? squadGolfCourseId,
      openedByCode: session.code,
      targetSquadId: squadId,
      targetSessionId,
      requestTypes: Array.isArray(payload.requestTypes)
        ? payload.requestTypes.map((v) => String(v))
        : [],
      otherDetail:
        typeof payload.otherDetail === "string" ? payload.otherDetail : null,
    });

    if (result.error || !result.event) {
      return NextResponse.json(
        { error: result.error ?? "Apertura evento fallita." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      event: result.event,
      created: result.created,
    });
  }

  if (action === "close") {
    const operationalEventId =
      typeof payload.operationalEventId === "string"
        ? payload.operationalEventId.trim()
        : "";
    if (!operationalEventId) {
      return NextResponse.json({ error: "operationalEventId obbligatorio." }, { status: 400 });
    }

    const { validateOpenOperationalEvent, countOpenMissionsForOperationalEvent } =
      await import("@/lib/operational-events");

    const { row, error: validateErr } = await validateOpenOperationalEvent(
      admin,
      operationalEventId,
      golfCourseId,
    );
    if (validateErr || !row) {
      return NextResponse.json(
        { error: validateErr ?? "Evento non valido." },
        { status: 409 },
      );
    }

    const { count, error: countErr } = await countOpenMissionsForOperationalEvent(
      admin,
      operationalEventId,
    );
    if (countErr) {
      return NextResponse.json({ error: countErr }, { status: 500 });
    }
    if (count > 0) {
      return NextResponse.json(
        {
          error: `Notifiche collegate all'evento n° ${row.displayNumber} ancora aperte (${count}). Chiudile dalla colonna «Notifiche TOC attive» o usa Reset forzato TOC.`,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { error } = await admin
      .from("operational_events")
      .update({
        status: "chiuso",
        closed_at: now,
        closed_by_admin_code: session.code,
      })
      .eq("id", operationalEventId)
      .eq("status", "aperto");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: linkedAlarms, error: linkedErr } = await admin
      .from("squad_alarms")
      .select("id, session_id")
      .eq("operational_event_id", operationalEventId)
      .is("acknowledged_at", null);

    if (!linkedErr) {
      await admin
        .from("squad_alarms")
        .update({
          acknowledged_at: now,
          acknowledged_by: session.code,
        })
        .eq("operational_event_id", operationalEventId)
        .is("acknowledged_at", null);
    }

    const acknowledgedSessionIds = [
      ...new Set(
        (linkedAlarms ?? [])
          .map((row) => String(row.session_id ?? "").trim())
          .filter(Boolean),
      ),
    ];

    return NextResponse.json({
      ok: true,
      eventId: operationalEventId,
      acknowledgedSessionIds,
    });
  }

  if (action === "intervention") {
    const operationalEventId =
      typeof payload.operationalEventId === "string"
        ? payload.operationalEventId.trim()
        : "";
    if (!operationalEventId) {
      return NextResponse.json({ error: "operationalEventId obbligatorio." }, { status: 400 });
    }

    const { validateOpenOperationalEvent, normalizeInterventionRef } = await import(
      "@/lib/operational-events"
    );

    const { error: validateErr } = await validateOpenOperationalEvent(
      admin,
      operationalEventId,
      golfCourseId,
    );
    if (validateErr) {
      return NextResponse.json({ error: validateErr }, { status: 409 });
    }

    let interventionRef: string | null;
    try {
      interventionRef = normalizeInterventionRef(
        typeof payload.interventionRef === "string" ? payload.interventionRef : "",
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "N° intervento non valido." },
        { status: 400 },
      );
    }

    const { error: updateErr } = await admin
      .from("operational_events")
      .update({ intervention_ref: interventionRef })
      .eq("id", operationalEventId)
      .eq("status", "aperto");

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const { row, error: fetchErr } = await fetchOperationalEventById(
      admin,
      operationalEventId,
    );
    if (fetchErr || !row) {
      return NextResponse.json(
        { error: fetchErr ?? "Evento non trovato dopo aggiornamento." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      event: mapOperationalEventRow(row),
    });
  }

  return NextResponse.json({ error: "Azione non supportata." }, { status: 400 });
}
