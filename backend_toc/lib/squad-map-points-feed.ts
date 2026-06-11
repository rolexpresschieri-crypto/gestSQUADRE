import type { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { waypointsFromRows, type SquadWaypoint } from "@/lib/waypoints";

export type ActiveEventSummary = {
  id: string;
  title: string;
};

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

export async function fetchActiveEvent(
  supabase: SupabaseClient,
): Promise<ActiveEventSummary | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }
  return {
    id: String(data.id),
    title: String(data.title ?? ""),
  };
}

export async function fetchSquadMapPoints(
  supabase: SupabaseClient,
  eventId: string,
  golfCourseId?: string | null,
): Promise<{ waypoints: SquadWaypoint[]; error: string | null }> {
  let query = supabase.from("squad_map_points").select("*").eq("event_id", eventId);
  if (golfCourseId) {
    // Include waypoint legacy senza golf_course_id (creati prima del multi-campo).
    query = query.or(`golf_course_id.eq.${golfCourseId},golf_course_id.is.null`);
  }
  const { data, error } = await query.limit(400);

  if (error) {
    return { waypoints: [], error: error.message };
  }
  return {
    waypoints: waypointsFromRows((data ?? []) as Record<string, unknown>[]),
    error: null,
  };
}
