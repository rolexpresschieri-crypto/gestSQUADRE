"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_SESSION_STORAGE_KEY,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { fetchGolfCourseSquadIds, fetchLiveSquads } from "@/lib/golf-course-scope";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { layerOptions, type LayerMode } from "@/lib/map-layers";
import { readStoredLayerMode, writeStoredLayerMode } from "@/lib/map-layer-storage";
import { liveSquadsEqual, type LiveSquad } from "@/lib/live-squads";
import {
  fetchActiveRouteAssignmentsForSessions,
  routeAssignmentsSig,
  type SquadRouteAssignment,
} from "@/lib/map-routes";
import {
  fetchActiveEvent,
  fetchSquadMapPoints,
} from "@/lib/squad-map-points-feed";
import { brandBackgroundCss } from "@/lib/brand-colors";
import { MAP_SQUAD_POLL_MS } from "@/lib/map-refresh";
import { waypointDisplayName, type SquadWaypoint } from "@/lib/waypoints";
import "@/components/squad-live-map.css";

const brandBg = brandBackgroundCss.replace(/\s+/g, " ").trim();

const SquadLiveMap = dynamic(() => import("@/components/squad-live-map"), {
  ssr: false,
});

function readAdminSession(): AdminSessionData | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return restoreAdminSessionFromStorage(raw);
}

function MapFullscreenContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayMode = searchParams.get("display") === "1";

  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [squads, setSquads] = useState<LiveSquad[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<SquadWaypoint[]>([]);
  const [alarmSessionIds, setAlarmSessionIds] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [routeAssignmentsBySession, setRouteAssignmentsBySession] = useState<
    Map<string, SquadRouteAssignment>
  >(new Map());
  const [layerMode, setLayerMode] = useState<LayerMode>("standard");
  const [mapRecenterNonce, setMapRecenterNonce] = useState(0);
  const [hint, setHint] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);

  const onlineSessionIds = useMemo(
    () => new Set(squads.map((s) => s.sessionId)),
    [squads],
  );

  const mapAlarmingSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of alarmSessionIds) {
      if (onlineSessionIds.has(id)) {
        ids.add(id);
      }
    }
    return ids;
  }, [alarmSessionIds, onlineSessionIds]);

  const mapActiveRoutes = useMemo(
    () =>
      Array.from(routeAssignmentsBySession.values())
        .filter((assignment) => onlineSessionIds.has(assignment.sessionId))
        .map((assignment) => ({
          routeCode: `${assignment.routeCode}-${assignment.sessionId.slice(0, 8)}`,
          colorHex: assignment.colorHex,
          points: assignment.points,
          highlighted:
            assignment.sessionId === selectedSessionId ||
            mapAlarmingSessionIds.has(assignment.sessionId),
        })),
    [routeAssignmentsBySession, selectedSessionId, mapAlarmingSessionIds, onlineSessionIds],
  );

  const canManageWaypoints = session?.role === "admin";

  const endDisplaySession = useCallback(() => {
    setSession(null);
    setSquads([]);
    setAlarmSessionIds([]);
    setRouteAssignmentsBySession(new Map());
    setSelectedSessionId(null);
    if (displayMode) {
      window.close();
    }
  }, [displayMode]);

  useEffect(() => {
    const layerParam = searchParams.get("layer");
    if (layerParam === "orthophoto" || layerParam === "standard") {
      setLayerMode(layerParam);
      writeStoredLayerMode(layerParam);
    } else {
      setLayerMode(readStoredLayerMode());
    }
    setSupabase(getSupabaseBrowserClient());
    setSession(readAdminSession());
    if (displayMode) {
      setHint(
        "Trascina questa finestra sul secondo monitor. Poi F11 o «Schermo intero» per massimizzare la mappa.",
      );
    }
  }, [displayMode, searchParams]);

  useEffect(() => {
    if (!displayMode) {
      return;
    }
    window.__gestMapDisplayWin = window;
    return () => {
      if (window.__gestMapDisplayWin === window) {
        window.__gestMapDisplayWin = null;
      }
    };
  }, [displayMode]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ADMIN_SESSION_STORAGE_KEY) {
        return;
      }
      if (!event.newValue) {
        endDisplaySession();
        return;
      }
      setSession(readAdminSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [endDisplaySession]);

  useEffect(() => {
    if (!displayMode) {
      return;
    }
    const timer = window.setInterval(() => {
      if (!window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY)) {
        endDisplaySession();
      }
    }, MAP_SQUAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [displayMode, endDisplaySession]);

  const golfCourseId = session?.golfCourseId ?? null;

  const loadSquads = useCallback(async () => {
    if (!supabase) {
      return;
    }
    const rows = await fetchLiveSquads(supabase, golfCourseId);
    setSquads((prev) => (liveSquadsEqual(prev, rows) ? prev : rows));
    setSelectedSessionId((prev) =>
      prev && rows.some((s) => s.sessionId === prev) ? prev : null,
    );
  }, [supabase, golfCourseId]);

  const loadActiveAlarms = useCallback(async () => {
    if (!supabase) {
      return;
    }
    let query = supabase
      .from("squad_alarms")
      .select("session_id, squad_id")
      .is("acknowledged_at", null);
    if (golfCourseId) {
      const squadIds = await fetchGolfCourseSquadIds(supabase, golfCourseId);
      if (squadIds.length === 0) {
        setAlarmSessionIds([]);
        return;
      }
      query = query.in("squad_id", squadIds);
    }
    const { data } = await query;
    setAlarmSessionIds(
      (data ?? []).map((r) => r.session_id as string).filter(Boolean),
    );
  }, [supabase, golfCourseId]);

  const loadRouteAssignments = useCallback(
    async (extraSessionIds: string[] = [], squadsSnapshot: LiveSquad[] = squads) => {
      if (!supabase) {
        setRouteAssignmentsBySession(new Map());
        return;
      }
      const onlineIds = new Set(squadsSnapshot.map((s) => s.sessionId));
      const sessionIds = [
        ...new Set([
          ...squadsSnapshot.map((s) => s.sessionId),
          ...alarmSessionIds.filter((id) => onlineIds.has(id)),
          ...extraSessionIds,
        ]),
      ];
      if (sessionIds.length === 0) {
        return;
      }
      const { assignments } = await fetchActiveRouteAssignmentsForSessions(
        supabase,
        sessionIds,
      );
      const visibleAssignments = new Map(
        [...assignments].filter(([sessionId]) => onlineIds.has(sessionId)),
      );
      setRouteAssignmentsBySession((prev) => {
        if (routeAssignmentsSig(prev) === routeAssignmentsSig(visibleAssignments)) {
          return prev;
        }
        return visibleAssignments;
      });
      if (!selectedSessionId) {
        const firstWithRoute = squadsSnapshot.find((s) =>
          visibleAssignments.has(s.sessionId),
        );
        if (firstWithRoute) {
          setSelectedSessionId(firstWithRoute.sessionId);
        }
      }
    },
    [supabase, selectedSessionId, squads, alarmSessionIds],
  );

  const loadActiveEventAndWaypoints = useCallback(async () => {
    if (!supabase) {
      setActiveEventId(null);
      setWaypoints([]);
      return;
    }
    const event = await fetchActiveEvent(supabase);
    if (!event) {
      setActiveEventId(null);
      setWaypoints([]);
      return;
    }
    setActiveEventId(event.id);
    const { waypoints: wps } = await fetchSquadMapPoints(
      supabase,
      event.id,
      golfCourseId,
    );
    setWaypoints(wps);
  }, [supabase, golfCourseId]);

  async function handleDeleteWaypointFromMap(waypoint: SquadWaypoint) {
    if (!supabase || !canManageWaypoints) {
      return;
    }
    if (
      !window.confirm(
        `Eliminare la buca "${waypointDisplayName(waypoint)}"?`,
      )
    ) {
      return;
    }
    const { error } = await supabase
      .from("squad_map_points")
      .delete()
      .eq("id", waypoint.id);
    if (error) {
      setHint(error.message);
      return;
    }
    await loadActiveEventAndWaypoints();
    setHint("Waypoint eliminato.");
  }

  useEffect(() => {
    void loadRouteAssignments();
  }, [loadRouteAssignments, squads, alarmSessionIds]);

  useEffect(() => {
    if (!session || !supabase) {
      return;
    }
    void loadSquads();
    void loadActiveAlarms();
    void loadActiveEventAndWaypoints();
    void loadRouteAssignments();

    const ch1 = supabase
      .channel("gest-fs-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_sessions" },
        () => {
          void (async () => {
            if (!supabase) {
              return;
            }
            const rows = await fetchLiveSquads(supabase, golfCourseId);
            setSquads((prev) => (liveSquadsEqual(prev, rows) ? prev : rows));
            setSelectedSessionId((prev) =>
              prev && rows.some((s) => s.sessionId === prev) ? prev : null,
            );
            await loadRouteAssignments([], rows);
          })();
        },
      )
      .subscribe();

    const ch2 = supabase
      .channel("gest-fs-alarms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_alarms" },
        (payload) => {
          const sessionId =
            payload.eventType === "INSERT" && payload.new
              ? String((payload.new as { session_id?: string }).session_id ?? "")
              : "";
          void (async () => {
            await loadActiveAlarms();
            await loadRouteAssignments(sessionId ? [sessionId] : []);
          })();
        },
      )
      .subscribe();

    const ch3 = supabase
      .channel("gest-fs-waypoints")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_map_points" },
        () => void loadActiveEventAndWaypoints(),
      )
      .subscribe();

    const ch4 = supabase
      .channel("gest-fs-route-assignments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_route_assignments" },
        () => void loadRouteAssignments(),
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadSquads();
      void loadActiveAlarms();
    }, MAP_SQUAD_POLL_MS);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(ch1);
      void supabase.removeChannel(ch2);
      void supabase.removeChannel(ch3);
      void supabase.removeChannel(ch4);
    };
  }, [
    session,
    supabase,
    golfCourseId,
    loadSquads,
    loadActiveAlarms,
    loadActiveEventAndWaypoints,
    loadRouteAssignments,
  ]);

  function toggleBrowserFullscreen() {
    const el = mapRef.current;
    if (!el) {
      return;
    }
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }

  if (!session) {
    return (
      <main
        style={{
          padding: 24,
          color: "#fff",
          background: brandBg,
          minHeight: "100vh",
        }}
      >
        <h1>Accesso richiesto</h1>
        <p>
          {displayMode ? (
            <>Sessione TOC chiusa nella dashboard. Puoi chiudere questa finestra.</>
          ) : (
            <>
              <Link href="/">Effettua il login TOC</Link> nella finestra principale, poi riapri
              questa mappa.
            </>
          )}
        </p>
      </main>
    );
  }

  const headerPad = displayMode ? 6 : 12;

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: brandBg,
        margin: 0,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: headerPad,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          color: "#fff",
          fontSize: displayMode ? 13 : 14,
          flexShrink: 0,
        }}
      >
        {!displayMode ? (
          <>
            <Link href="/" style={{ color: "#e0be3a" }}>
              ← Dashboard
            </Link>
            <Link href="/waypoints" style={{ color: "#e0be3a" }}>
              Waypoint ({waypoints.length})
            </Link>
          </>
        ) : (
          <span style={{ color: "#e0be3a", fontWeight: 700 }}>gestSQUADRE — mappa display</span>
        )}
        <button type="button" onClick={() => void loadSquads()}>
          Aggiorna
        </button>
        <button type="button" onClick={() => setMapRecenterNonce((n) => n + 1)}>
          Ricentra mappa
        </button>
        {mapActiveRoutes.length > 0 ? (
          <span style={{ color: "#8fe88f", fontWeight: 700 }}>
            Vie TRK: {mapActiveRoutes.length}
          </span>
        ) : null}
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Layer
          <select
            value={layerMode}
            onChange={(e) => {
              const mode = e.target.value as LayerMode;
              setLayerMode(mode);
              writeStoredLayerMode(mode);
            }}
            style={{
              padding: "4px 8px",
              borderRadius: 6,
              background: "#0d1a12",
              color: "#fff",
              border: "1px solid #4a5568",
            }}
          >
            {layerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={toggleBrowserFullscreen}>
          Schermo intero
        </button>
        {displayMode && hint ? (
          <span style={{ color: "#ccc", flex: "1 1 200px" }}>{hint}</span>
        ) : null}
      </header>
      <div ref={mapRef} style={{ flex: 1, minHeight: 0, width: "100%" }}>
        <SquadLiveMap
          layerMode={layerMode}
          squads={squads}
          waypoints={waypoints}
          activeRoutes={mapActiveRoutes}
          alarmingSessionIds={mapAlarmingSessionIds}
          selectedSessionId={selectedSessionId}
          onSelect={(s) => setSelectedSessionId(s.sessionId)}
          canManageWaypoints={canManageWaypoints && Boolean(activeEventId)}
          onEditWaypoint={(wp) => router.push(`/waypoints?edit=${wp.id}`)}
          onDeleteWaypoint={(wp) => void handleDeleteWaypointFromMap(wp)}
          height="100%"
          recenterNonce={mapRecenterNonce}
        />
      </div>
      {!displayMode ? (
        <footer style={{ padding: 8, color: "#ccc", fontSize: 12, flexShrink: 0 }}>
          {squads.map((s) => {
            const alarming = mapAlarmingSessionIds.has(s.sessionId);
            return (
              <button
                key={s.sessionId}
                type="button"
                style={{
                  marginRight: 8,
                  background: alarming ? "#c62828" : "#333",
                  color: "#fff",
                  border: alarming ? "2px solid #fff" : "none",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontWeight: alarming ? 800 : 400,
                }}
                onClick={() => setSelectedSessionId(s.sessionId)}
              >
                {alarming ? "⚠ " : ""}
                {s.squadCode}
              </button>
            );
          })}
        </footer>
      ) : null}
    </main>
  );
}

export default function MapFullscreenPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, color: "#fff", background: brandBg }}>
          Caricamento mappa…
        </main>
      }
    >
      <MapFullscreenContent />
    </Suspense>
  );
}
