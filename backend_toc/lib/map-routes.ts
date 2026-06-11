import type { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

export type MapRoutePoint = {
  lat: number;
  lng: number;
};

export type MapRoute = {
  id: string;
  golfCourseId: string;
  routeCode: string;
  routeName: string;
  colorHex: string;
  points: MapRoutePoint[];
};

export type SquadRouteAssignment = {
  id: string;
  sessionId: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  colorHex: string;
  points: MapRoutePoint[];
  targetWaypointId: string | null;
  targetLabel: string | null;
  assignedAt: string;
};

export function parsePoints(raw: unknown): MapRoutePoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((p) => {
      const row = p as { lat?: unknown; lng?: unknown };
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      return { lat, lng };
    })
    .filter((p): p is MapRoutePoint => p !== null);
}

export function routesFromRows(rows: Record<string, unknown>[]): MapRoute[] {
  return rows
    .map((row) => {
      const points = parsePoints(row.points);
      if (points.length < 2) {
        return null;
      }
      return {
        id: String(row.id),
        golfCourseId: String(row.golf_course_id),
        routeCode: String(row.route_code),
        routeName: String(row.route_name ?? row.route_code),
        colorHex: String(row.color_hex ?? "#079B42"),
        points,
      } satisfies MapRoute;
    })
    .filter((r): r is MapRoute => r !== null)
    .sort((a, b) => a.routeCode.localeCompare(b.routeCode, "it"));
}

export async function fetchMapRoutes(
  supabase: SupabaseClient,
  golfCourseId: string,
): Promise<MapRoute[]> {
  const { data, error } = await supabase
    .from("map_routes")
    .select("id, golf_course_id, route_code, route_name, color_hex, points")
    .eq("golf_course_id", golfCourseId)
    .eq("is_enabled", true)
    .order("route_code", { ascending: true });

  if (error || !data) {
    return [];
  }
  return routesFromRows(data as Record<string, unknown>[]);
}

export async function fetchActiveRouteAssignment(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SquadRouteAssignment | null> {
  const { data: assignment, error: assignmentErr } = await supabase
    .from("squad_route_assignments")
    .select("id, session_id, route_id, target_waypoint_id, assigned_at")
    .eq("session_id", sessionId)
    .is("cleared_at", null)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignmentErr || !assignment?.route_id) {
    return null;
  }

  const { data: route, error: routeErr } = await supabase
    .from("map_routes")
    .select("route_code, route_name, color_hex, points")
    .eq("id", assignment.route_id as string)
    .maybeSingle();

  if (routeErr || !route) {
    return null;
  }

  const points = parsePoints(route.points);
  if (points.length < 2) {
    return null;
  }

  let targetLabel: string | null = null;
  const targetId = assignment.target_waypoint_id as string | null;
  if (targetId) {
    const { data: wp } = await supabase
      .from("squad_map_points")
      .select("label")
      .eq("id", targetId)
      .maybeSingle();
    targetLabel = (wp?.label as string | null) ?? null;
  }

  return {
    id: String(assignment.id),
    sessionId: String(assignment.session_id),
    routeId: String(assignment.route_id),
    routeCode: String(route.route_code),
    routeName: String(route.route_name ?? route.route_code),
    colorHex: String(route.color_hex ?? "#079B42"),
    points,
    targetWaypointId: targetId,
    targetLabel,
    assignedAt: String(assignment.assigned_at),
  };
}
