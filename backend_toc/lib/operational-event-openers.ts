import type { SupabaseClient } from "@supabase/supabase-js";

export const OPERATIONAL_EVENT_OPENER_LABEL =
  "squadre con «Può aprire evento» attivo in Squadre campo";

export async function fetchOperationalEventOpenerCodes(
  admin: SupabaseClient,
  golfCourseId: string | null,
): Promise<Set<string>> {
  let query = admin
    .from("squads")
    .select("squad_code")
    .eq("can_open_operational_event", true);

  if (golfCourseId) {
    query = query.eq("golf_course_id", golfCourseId);
  }

  const { data, error } = await query;
  if (error) {
    if (/can_open_operational_event|column/i.test(error.message)) {
      return new Set();
    }
    throw new Error(error.message);
  }

  return new Set(
    (data ?? [])
      .map((row) =>
        typeof row.squad_code === "string" ? row.squad_code.trim().toUpperCase() : "",
      )
      .filter(Boolean),
  );
}

export async function isSquadOperationalEventOpener(
  admin: SupabaseClient,
  squadId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("squads")
    .select("can_open_operational_event")
    .eq("id", squadId)
    .maybeSingle();

  if (error) {
    if (/can_open_operational_event|column/i.test(error.message)) {
      return false;
    }
    throw new Error(error.message);
  }

  return Boolean(data?.can_open_operational_event);
}

export function isOperationalEventOpenerCode(
  squadCode: string,
  openerCodes: Set<string>,
): boolean {
  const code = squadCode.trim().toUpperCase();
  return code.length > 0 && openerCodes.has(code);
}
