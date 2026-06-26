import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeAdminRole, type AdminSessionData } from "@/lib/admin-auth";
import {
  mapOperationalEventRow,
  type OperationalEventRow,
} from "@/lib/operational-events";

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
    .select(
      "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code",
    )
    .order("display_number", { ascending: true });

  if (status === "aperto") {
    query = query.eq("status", "aperto");
  } else if (status === "chiuso") {
    query = query.eq("status", "chiuso");
  }

  if (golfCourseId) {
    query = query.eq("golf_course_id", golfCourseId);
  }

  const { data, error } = await query;
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
    return NextResponse.json(
      {
        error:
          "Gli eventi operativi si aprono solo dalle squadre attivatore (01_TOC, 01_RR) inviando allarme dal campo.",
      },
      { status: 403 },
    );
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
          error: `Impossibile chiudere evento ${row.displayNumber}: ${count} missione/i ancora aperta/e. Chiudile o forza reset TOC.`,
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

    return NextResponse.json({ ok: true, eventId: operationalEventId });
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

    const { data, error } = await admin
      .from("operational_events")
      .update({ intervention_ref: interventionRef })
      .eq("id", operationalEventId)
      .eq("status", "aperto")
      .select(
        "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code",
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      event: mapOperationalEventRow(data as OperationalEventRow),
    });
  }

  return NextResponse.json({ error: "Azione non supportata." }, { status: 400 });
}
