import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  fetchActiveAutoNotifyDeliveries,
  type FetchActiveAutoNotifyOptions,
} from "@/lib/active-auto-notify";
import {
  fetchActiveTocPushDeliveries,
  type FetchActiveTocPushOptions,
} from "@/lib/active-toc-push";
import { fetchGolfCourseSquadIds } from "@/lib/golf-course-scope";

export const runtime = "nodejs";

function getServiceSupabase() {
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

function parseListParam(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const admin = getServiceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY mancante.", rows: [], tocPushes: [] },
      { status: 501 },
    );
  }

  const url = new URL(request.url);
  const golfCourseId = url.searchParams.get("golfCourseId")?.trim() || null;
  const eventIds = parseListParam(url.searchParams.get("eventIds"));
  const openAlarmIds = parseListParam(url.searchParams.get("alarmIds"));

  const autoOptions: FetchActiveAutoNotifyOptions = {
    eventIds,
    openAlarmIds,
    sourceSquadCodes: null,
  };
  const pushOptions: FetchActiveTocPushOptions = {
    eventIds,
    recipientSquadIds: null,
  };

  if (golfCourseId) {
    const squadIds = await fetchGolfCourseSquadIds(admin, golfCourseId);
    if (squadIds.length === 0) {
      return NextResponse.json({ rows: [], tocPushes: [], error: null });
    }
    pushOptions.recipientSquadIds = squadIds;
    const { data } = await admin
      .from("squads")
      .select("squad_code")
      .in("id", squadIds);
    autoOptions.sourceSquadCodes =
      (data ?? [])
        .map((row) => String(row.squad_code ?? "").trim().toUpperCase())
        .filter(Boolean) ?? [];
  }

  const [{ rows, error }, { rows: tocPushes, error: pushError }] =
    await Promise.all([
      fetchActiveAutoNotifyDeliveries(admin, autoOptions),
      fetchActiveTocPushDeliveries(admin, pushOptions),
    ]);

  const combinedError = error ?? pushError;
  return NextResponse.json({ rows, tocPushes, error: combinedError });
}
