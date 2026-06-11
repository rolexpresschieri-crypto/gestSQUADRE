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

function buildRouteAssignment(
  assignment: Record<string, unknown>,
  route: Record<string, unknown>,
  targetLabel: string | null,
): SquadRouteAssignment | null {
  const points = parsePoints(route.points);
  if (points.length < 2) {
    return null;
  }
  const targetId = (assignment.target_waypoint_id as string | null) ?? null;
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

export async function fetchActiveRouteAssignment(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SquadRouteAssignment | null> {
  const map = await fetchActiveRouteAssignmentsForSessions(supabase, [sessionId]);
  return map.get(sessionId) ?? null;
}

/** Assegnazioni via attive per più sessioni (mappa TOC). */
export async function fetchActiveRouteAssignmentsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<Map<string, SquadRouteAssignment>> {
  const result = new Map<string, SquadRouteAssignment>();
  const uniqueIds = [...new Set(sessionIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return result;
  }

  const { data: assignments, error: assignmentErr } = await supabase
    .from("squad_route_assignments")
    .select("id, session_id, route_id, target_waypoint_id, assigned_at")
    .in("session_id", uniqueIds)
    .is("cleared_at", null)
    .order("assigned_at", { ascending: false });

  if (assignmentErr || !assignments?.length) {
    return result;
  }

  const latestBySession = new Map<string, Record<string, unknown>>();
  for (const row of assignments as Record<string, unknown>[]) {
    const sessionId = String(row.session_id ?? "");
    if (!sessionId || latestBySession.has(sessionId)) {
      continue;
    }
    latestBySession.set(sessionId, row);
  }

  const routeIds = [
    ...new Set(
      [...latestBySession.values()]
        .map((row) => String(row.route_id ?? ""))
        .filter(Boolean),
    ),
  ];
  if (routeIds.length === 0) {
    return result;
  }

  const { data: routes, error: routeErr } = await supabase
    .from("map_routes")
    .select("id, route_code, route_name, color_hex, points")
    .in("id", routeIds);

  if (routeErr || !routes?.length) {
    return result;
  }

  const routeById = new Map(
    (routes as Record<string, unknown>[]).map((row) => [String(row.id), row]),
  );

  const targetIds = [
    ...new Set(
      [...latestBySession.values()]
        .map((row) => row.target_waypoint_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const targetLabelById = new Map<string, string | null>();
  if (targetIds.length > 0) {
    const { data: waypoints } = await supabase
      .from("squad_map_points")
      .select("id, label")
      .in("id", targetIds);
    for (const wp of (waypoints ?? []) as Record<string, unknown>[]) {
      targetLabelById.set(String(wp.id), (wp.label as string | null) ?? null);
    }
  }

  for (const [sessionId, assignment] of latestBySession) {
    const route = routeById.get(String(assignment.route_id));
    if (!route) {
      continue;
    }
    const targetId = (assignment.target_waypoint_id as string | null) ?? null;
    const built = buildRouteAssignment(
      assignment,
      route,
      targetId ? (targetLabelById.get(targetId) ?? null) : null,
    );
    if (built) {
      result.set(sessionId, built);
    }
  }

  return result;
}

export async function clearRouteAssignmentForSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ error: string | null }> {
  if (!sessionId.trim()) {
    return { error: "sessionId mancante" };
  }
  const { error } = await supabase
    .from("squad_route_assignments")
    .update({ cleared_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("cleared_at", null);
  return { error: error?.message ?? null };
}
