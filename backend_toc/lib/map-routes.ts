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

function parsePoints(raw: unknown): MapRoutePoint[] {
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
  const { data, error } = await supabase
    .from("squad_route_assignments")
    .select(
      "id, session_id, route_id, target_waypoint_id, assigned_at, map_routes(route_code, route_name, color_hex, points), squad_map_points(label)",
    )
    .eq("session_id", sessionId)
    .is("cleared_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const routeJoin = data.map_routes as
    | {
        route_code: string;
        route_name: string | null;
        color_hex: string | null;
        points: unknown;
      }
    | {
        route_code: string;
        route_name: string | null;
        color_hex: string | null;
        points: unknown;
      }[]
    | null;
  const route = Array.isArray(routeJoin) ? routeJoin[0] : routeJoin;
  if (!route) {
    return null;
  }

  const wpJoin = data.squad_map_points as { label: string | null } | { label: string | null }[] | null;
  const wp = Array.isArray(wpJoin) ? wpJoin[0] : wpJoin;

  const points = parsePoints(route.points);
  if (points.length < 2) {
    return null;
  }

  return {
    id: String(data.id),
    sessionId: String(data.session_id),
    routeId: String(data.route_id),
    routeCode: route.route_code,
    routeName: route.route_name ?? route.route_code,
    colorHex: route.color_hex ?? "#079B42",
    points,
    targetWaypointId: (data.target_waypoint_id as string | null) ?? null,
    targetLabel: wp?.label ?? null,
    assignedAt: String(data.assigned_at),
  };
}
