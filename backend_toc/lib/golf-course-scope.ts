import type { AdminSessionData } from "@/lib/admin-auth";
import type { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { liveSquadsFromRows, normalizeMapColor, type LiveSquad } from "@/lib/live-squads";
import { normalizeSquadIconKey } from "@/lib/squad-icons";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

export function hasGolfCourseScope(session: AdminSessionData | null): boolean {
  return Boolean(session?.golfCourseId);
}

export function canManageSquadsForCourse(session: AdminSessionData | null): boolean {
  if (!session?.golfCourseId) {
    return false;
  }
  return session.role === "admin" || session.role === "campo";
}

/** Rimuove sessioni/allarmi collegati, poi la riga squadra (FK restrict su squad_sessions / squad_alarms). */
export async function deleteSquadForCourse(
  supabase: SupabaseClient,
  squadId: string,
  golfCourseId: string,
): Promise<{ error?: string }> {
  const { data: squad, error: fetchErr } = await supabase
    .from("squads")
    .select("id")
    .eq("id", squadId)
    .eq("golf_course_id", golfCourseId)
    .maybeSingle();

  if (fetchErr) {
    return { error: fetchErr.message };
  }
  if (!squad) {
    return { error: "Squadra non trovata su questo campo." };
  }

  const { error: alarmsErr } = await supabase
    .from("squad_alarms")
    .delete()
    .eq("squad_id", squadId);
  if (alarmsErr) {
    return { error: alarmsErr.message };
  }

  const { error: sessionsErr } = await supabase
    .from("squad_sessions")
    .delete()
    .eq("squad_id", squadId);
  if (sessionsErr) {
    return { error: sessionsErr.message };
  }

  const { error: squadErr } = await supabase
    .from("squads")
    .delete()
    .eq("id", squadId)
    .eq("golf_course_id", golfCourseId);
  if (squadErr) {
    return { error: squadErr.message };
  }

  return {};
}

export async function fetchGolfCourseSquadIds(
  supabase: SupabaseClient,
  golfCourseId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("squads")
    .select("id")
    .eq("golf_course_id", golfCourseId);

  return (data ?? []).map((row) => row.id as string);
}

export async function fetchLiveSquads(
  supabase: SupabaseClient,
  golfCourseId?: string | null,
): Promise<LiveSquad[]> {
  if (golfCourseId) {
    const { data, error } = await supabase
      .from("squad_sessions")
      .select(
        "id, event_id, squad_id, is_online, login_at, last_latitude, last_longitude, last_accuracy, last_fix_at, squads!inner(squad_code, squad_name, map_color, map_icon_key, golf_course_id)",
      )
      .eq("is_online", true)
      .eq("squads.golf_course_id", golfCourseId)
      .order("login_at", { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => {
      const squad = row.squads as
        | {
            squad_code: string;
            squad_name: string;
            map_color: string | null;
            map_icon_key: string | null;
          }
        | {
            squad_code: string;
            squad_name: string;
            map_color: string | null;
            map_icon_key: string | null;
          }[]
        | null;
      const s = Array.isArray(squad) ? squad[0] : squad;
      return {
        sessionId: row.id as string,
        eventId: row.event_id as string,
        squadId: row.squad_id as string,
        squadCode: (s?.squad_code ?? "?").toUpperCase(),
        squadName: s?.squad_name ?? "Squadra",
        isOnline: true,
        lastLatitude: (row.last_latitude as number | null) ?? null,
        lastLongitude: (row.last_longitude as number | null) ?? null,
        lastAccuracy: (row.last_accuracy as number | null) ?? null,
        lastFixAt: (row.last_fix_at as string | null) ?? null,
        mapColor: normalizeMapColor(s?.map_color ?? null),
        mapIconKey: normalizeSquadIconKey(s?.map_icon_key ?? null),
      } satisfies LiveSquad;
    });
  }

  const { data, error } = await supabase
    .from("active_squad_summaries")
    .select("*")
    .order("squad_code", { ascending: true });

  if (error || !data) {
    return [];
  }
  return liveSquadsFromRows(data as Record<string, unknown>[]);
}
