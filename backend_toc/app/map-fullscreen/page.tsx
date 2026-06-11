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
import type { LiveSquad } from "@/lib/live-squads";
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
  const [layerMode, setLayerMode] = useState<LayerMode>("standard");
  const [hint, setHint] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);

  const alarmingSessionIds = useMemo(
    () => new Set(alarmSessionIds),
    [alarmSessionIds],
  );

  const canManageWaypoints = session?.role === "admin";

  useEffect(() => {
    const layerParam = searchParams.get("layer");
    if (layerParam === "orthophoto" || layerParam === "standard") {
      setLayerMode(layerParam);
      writeStoredLayerMode(layerParam);
    } else {
      setLayerMode(readStoredLayerMode());
    }
    setSupabase(getSupabaseBrowserClient());
    const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (raw) {
      const restored = restoreAdminSessionFromStorage(raw);
      if (restored) {
        setSession(restored);
      } else {
        window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      }
    }
    if (displayMode) {
      setHint(
        "Trascina questa finestra sul secondo monitor. Poi F11 o «Schermo intero» per massimizzare la mappa.",
      );
    }
  }, [displayMode, searchParams]);

  const golfCourseId = session?.golfCourseId ?? null;

  const loadSquads = useCallback(async () => {
    if (!supabase) {
      return;
    }
    setSquads(await fetchLiveSquads(supabase, golfCourseId));
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
    if (!session || !supabase) {
      return;
    }
    void loadSquads();
    void loadActiveAlarms();
    void loadActiveEventAndWaypoints();

    const ch1 = supabase
      .channel("gest-fs-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_sessions" },
        () => void loadSquads(),
      )
      .subscribe();

    const ch2 = supabase
      .channel("gest-fs-alarms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_alarms" },
        () => void loadActiveAlarms(),
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

    const timer = window.setInterval(() => void loadSquads(), MAP_SQUAD_POLL_MS);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(ch1);
      void supabase.removeChannel(ch2);
      void supabase.removeChannel(ch3);
    };
  }, [session, supabase, loadSquads, loadActiveAlarms, loadActiveEventAndWaypoints]);

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
          <Link href="/">Effettua il login TOC</Link> nella finestra principale, poi riapri
          questa mappa.
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
          alarmingSessionIds={alarmingSessionIds}
          selectedSessionId={selectedSessionId}
          onSelect={(s) => setSelectedSessionId(s.sessionId)}
          canManageWaypoints={canManageWaypoints && Boolean(activeEventId)}
          onEditWaypoint={(wp) => router.push(`/waypoints?edit=${wp.id}`)}
          onDeleteWaypoint={(wp) => void handleDeleteWaypointFromMap(wp)}
          height="100%"
        />
      </div>
      {!displayMode ? (
        <footer style={{ padding: 8, color: "#ccc", fontSize: 12, flexShrink: 0 }}>
          {squads.map((s) => {
            const alarming = alarmingSessionIds.has(s.sessionId);
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
