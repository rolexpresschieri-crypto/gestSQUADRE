"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canManageWaypoints,
  canViewEventLogs,
  isCampoGolfSession,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { loginTocAdmin, restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { MAP_SQUAD_POLL_MS } from "@/lib/map-refresh";
import {
  clearRouteAssignmentForSession,
  fetchActiveRouteAssignmentsForSessions,
  fetchMapRoutes,
  type MapRoute,
  type SquadRouteAssignment,
} from "@/lib/map-routes";
import {
  canManageSquadsForCourse,
  fetchGolfCourseSquadIds,
  fetchLiveSquads,
} from "@/lib/golf-course-scope";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { openExternalMapWindow } from "@/lib/open-external-map";
import { layerOptions, type LayerMode } from "@/lib/map-layers";
import { readStoredLayerMode, writeStoredLayerMode } from "@/lib/map-layer-storage";
import {
  readStoredPushBody,
  readStoredPushTitle,
  writeStoredPushMessage,
} from "@/lib/push-message-storage";
import { tocPushTextUpper } from "@/lib/toc-push-text";
import type { LiveSquad } from "@/lib/live-squads";
import {
  fetchActiveEvent,
  fetchSquadMapPoints,
} from "@/lib/squad-map-points-feed";
import { waypointDisplayName, type SquadWaypoint } from "@/lib/waypoints";
import styles from "./toc-dashboard.module.css";
import "./squad-live-map.css";

const SquadLiveMap = dynamic(() => import("@/components/squad-live-map"), {
  ssr: false,
});

const TOC_PUSH_TITLE = "TOC — ALLARME";
const TOC_PUSH_BODY =
  "MESSAGGIO URGENTE DAL TACTICAL OPERATIONS CENTER. METTITI IN CONTATTO CON IL TOC.";

type AlarmRow = {
  id: string;
  session_id: string;
  squad_code: string;
  squad_name: string;
  message: string | null;
  created_at: string;
  acknowledged_at: string | null;
};

export default function TocDashboard() {
  const router = useRouter();
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [loginCode, setLoginCode] = useState("GOLF_TORINO");
  const [loginPassword, setLoginPassword] = useState("");
  const [squads, setSquads] = useState<LiveSquad[]>([]);
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>("standard");
  const [statusMessage, setStatusMessage] = useState("");
  const [pushOpen, setPushOpen] = useState(false);
  const [pushTitle, setPushTitle] = useState(TOC_PUSH_TITLE);
  const [pushBody, setPushBody] = useState(TOC_PUSH_BODY);
  const [pushAlert, setPushAlert] = useState<string | null>(null);
  const [pushSending, setPushSending] = useState(false);
  const [pushTargetAll, setPushTargetAll] = useState(true);
  const [pushSelected, setPushSelected] = useState<Record<string, boolean>>({});
  const [mapRoutes, setMapRoutes] = useState<MapRoute[]>([]);
  const [pushRouteId, setPushRouteId] = useState("");
  const [pushTargetWaypointId, setPushTargetWaypointId] = useState("");
  const [selectedRouteAssignment, setSelectedRouteAssignment] =
    useState<SquadRouteAssignment | null>(null);
  const [routeAssignmentsBySession, setRouteAssignmentsBySession] = useState<
    Map<string, SquadRouteAssignment>
  >(new Map());
  const [pushHealth, setPushHealth] = useState<{
    supabaseServiceRole: boolean;
    firebaseAdmin: boolean;
    fcmTokenRows?: number;
    onlineSessions?: number;
    onlineSessionsWithToken?: number;
    supabaseProject?: string | null;
  } | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<SquadWaypoint[]>([]);
  const [squadLogoutOpen, setSquadLogoutOpen] = useState(false);
  const [squadLogoutPickId, setSquadLogoutPickId] = useState<string | null>(null);
  const [squadLogoutBusy, setSquadLogoutBusy] = useState(false);
  const [onlineSessionsLogout, setOnlineSessionsLogout] = useState<LiveSquad[]>([]);

  const canEditWaypointsOnMap = session ? canManageWaypoints(session.role) : false;
  const canForceSquadLogout = session?.role === "admin";
  const canOpenEventLogs = session ? canViewEventLogs(session.role) : false;

  const alarmingSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of alarms) {
      if (!a.acknowledged_at) {
        ids.add(a.session_id);
      }
    }
    return ids;
  }, [alarms]);

  const mapActiveRoutes = useMemo(
    () =>
      Array.from(routeAssignmentsBySession.values()).map((assignment) => ({
        routeCode: `${assignment.routeCode}-${assignment.sessionId.slice(0, 8)}`,
        colorHex: assignment.colorHex,
        points: assignment.points,
        highlighted: assignment.sessionId === selectedSessionId,
      })),
    [routeAssignmentsBySession, selectedSessionId],
  );

  useEffect(() => {
    setLayerMode(readStoredLayerMode());
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
  }, []);

  const golfCourseId = session?.golfCourseId ?? null;

  const loadSquads = useCallback(async () => {
    if (!supabase) {
      setStatusMessage("Configura NEXT_PUBLIC_SUPABASE_* in .env.local");
      return;
    }
    const rows = await fetchLiveSquads(supabase, golfCourseId);
    setSquads(rows);
    setStatusMessage(`${rows.length} squadre online`);
  }, [supabase, golfCourseId]);

  const loadOnlineSessionsForLogout = useCallback(async () => {
    if (!supabase) {
      setOnlineSessionsLogout([]);
      return;
    }

    const rows = await fetchLiveSquads(supabase, golfCourseId);
    rows.sort((a, b) => a.squadCode.localeCompare(b.squadCode, "it"));
    setOnlineSessionsLogout(rows);
    setSquadLogoutPickId((prev) => {
      if (rows.length === 0) {
        return null;
      }
      if (prev && rows.some((r) => r.sessionId === prev)) {
        return prev;
      }
      return rows[0]!.sessionId;
    });
  }, [supabase, golfCourseId]);

  const loadAlarms = useCallback(async () => {
    if (!supabase) {
      return;
    }
    let query = supabase
      .from("squad_alarms")
      .select(
        "id, session_id, squad_code, squad_name, message, created_at, acknowledged_at, squad_id",
      )
      .order("created_at", { ascending: false })
      .limit(40);

    if (golfCourseId) {
      const squadIds = await fetchGolfCourseSquadIds(supabase, golfCourseId);
      if (squadIds.length === 0) {
        setAlarms([]);
        return;
      }
      query = query.in("squad_id", squadIds);
    }

    const { data } = await query;
    setAlarms((data ?? []) as AlarmRow[]);
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
    const { waypoints: wps, error } = await fetchSquadMapPoints(
      supabase,
      event.id,
      golfCourseId,
    );
    setWaypoints(wps);
    if (error && error.includes("squad_map_points")) {
      setStatusMessage(
        "Waypoint: esegui sql/squad_map_points.sql su Supabase per abilitare la tabella.",
      );
    }
  }, [supabase, golfCourseId]);

  const loadMapRoutes = useCallback(async () => {
    if (!supabase || !golfCourseId) {
      setMapRoutes([]);
      return;
    }
    setMapRoutes(await fetchMapRoutes(supabase, golfCourseId));
  }, [supabase, golfCourseId]);

  const loadSelectedRouteAssignment = useCallback(async () => {
    if (!supabase || squads.length === 0) {
      setRouteAssignmentsBySession(new Map());
      setSelectedRouteAssignment(null);
      return;
    }
    const sessionIds = squads.map((s) => s.sessionId);
    const { assignments, error } = await fetchActiveRouteAssignmentsForSessions(
      supabase,
      sessionIds,
    );
    setRouteAssignmentsBySession(assignments);
    if (error) {
      setStatusMessage(`Via mappa: ${error}`);
    }
    const routeSessionId =
      (selectedSessionId && assignments.has(selectedSessionId)
        ? selectedSessionId
        : null) ??
      sessionIds.find((id) => assignments.has(id)) ??
      selectedSessionId ??
      null;
    if (!selectedSessionId && routeSessionId && assignments.has(routeSessionId)) {
      setSelectedSessionId(routeSessionId);
    }
    setSelectedRouteAssignment(
      routeSessionId ? (assignments.get(routeSessionId) ?? null) : null,
    );
  }, [supabase, selectedSessionId, squads]);

  useEffect(() => {
    void loadMapRoutes();
  }, [loadMapRoutes]);

  useEffect(() => {
    void loadSelectedRouteAssignment();
  }, [loadSelectedRouteAssignment, squads]);

  const pushSingleTarget = useMemo(() => {
    if (pushTargetAll) {
      return null;
    }
    const picked = squads.filter((s) => pushSelected[s.sessionId]);
    return picked.length === 1 ? picked[0]! : null;
  }, [pushTargetAll, pushSelected, squads]);

  async function handleDeleteWaypointFromMap(waypoint: SquadWaypoint) {
    if (!supabase || !canEditWaypointsOnMap) {
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
      setStatusMessage(error.message);
      return;
    }
    await loadActiveEventAndWaypoints();
    setStatusMessage("Waypoint eliminato.");
  }

  useEffect(() => {
    if (!session) {
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/push-health");
        if (res.ok) {
          setPushHealth(await res.json());
        }
      } catch {
        setPushHealth(null);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!session || !supabase) {
      return;
    }
    void loadSquads();
    void loadAlarms();
    void loadActiveEventAndWaypoints();

    const squadChannel = supabase
      .channel("gest-squad-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_sessions" },
        () => void loadSquads(),
      )
      .subscribe();

    const alarmChannel = supabase
      .channel("gest-squad-alarms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_alarms" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as AlarmRow;
            setAlarms((prev) => [row, ...prev].slice(0, 40));
            setStatusMessage(
              `ALLARME: ${row.squad_code} — cerchio rosso sulla mappa`,
            );
          } else {
            void loadAlarms();
          }
        },
      )
      .subscribe();

    const wpChannel = supabase
      .channel("gest-dashboard-waypoints")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_map_points" },
        () => void loadActiveEventAndWaypoints(),
      )
      .subscribe();

    const routeChannel = supabase
      .channel("gest-route-assignments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_route_assignments" },
        () => void loadSelectedRouteAssignment(),
      )
      .subscribe();

    const timer = window.setInterval(() => void loadSquads(), MAP_SQUAD_POLL_MS);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(squadChannel);
      void supabase.removeChannel(alarmChannel);
      void supabase.removeChannel(wpChannel);
      void supabase.removeChannel(routeChannel);
    };
  }, [session, supabase, loadSquads, loadAlarms, loadActiveEventAndWaypoints, loadSelectedRouteAssignment]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setStatusMessage("Supabase non configurato (NEXT_PUBLIC_SUPABASE_*).");
      return;
    }

    const { session: next, error } = await loginTocAdmin(
      supabase,
      loginCode,
      loginPassword,
    );

    if (error || !next) {
      setStatusMessage(error ?? "Credenziali non valide.");
      return;
    }

    window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    setStatusMessage(
      isCampoGolfSession(next)
        ? `Benvenuto — ${next.golfCourseName ?? next.golfCourseCode}`
        : `Benvenuto ${next.name}`,
    );
  }

  function handleLogout() {
    window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    setSession(null);
  }

  function openSquadLogoutModal() {
    setSquadLogoutOpen(true);
    void loadOnlineSessionsForLogout();
  }

  async function forceLogoutSquad(squad: LiveSquad) {
    if (!supabase || !canForceSquadLogout) {
      return;
    }
    if (
      !window.confirm(
        `Forzare logout per ${squad.squadCode} — ${squad.squadName}?\n` +
          "La squadra potrà rifare login sul cellulare.",
      )
    ) {
      return;
    }

    setSquadLogoutBusy(true);
    const { error } = await supabase
      .from("squad_sessions")
      .update({
        is_online: false,
        logout_at: new Date().toISOString(),
      })
      .eq("id", squad.sessionId);

    setSquadLogoutBusy(false);

    if (error) {
      setStatusMessage(`Logout squadra: ${error.message}`);
      return;
    }

    await loadSquads();
    await loadOnlineSessionsForLogout();
    if (selectedSessionId === squad.sessionId) {
      setSelectedSessionId(null);
    }
    setStatusMessage(`Logout forzato: ${squad.squadCode} — ${squad.squadName}.`);
  }

  async function confirmSquadLogoutFromModal() {
    const picked = onlineSessionsLogout.find((s) => s.sessionId === squadLogoutPickId);
    if (!picked) {
      return;
    }
    await forceLogoutSquad(picked);
  }

  async function acknowledgeAlarm(alarm: AlarmRow) {
    if (!supabase || !session) {
      return;
    }
    const { error } = await supabase
      .from("squad_alarms")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: session.code,
      })
      .eq("id", alarm.id);
    if (error) {
      setStatusMessage(error.message);
      return;
    }
    const routeClear = await clearRouteAssignmentForSession(
      supabase,
      alarm.session_id,
    );
    await loadAlarms();
    await loadSelectedRouteAssignment();
    setStatusMessage(
      routeClear.error
        ? `Allarme preso in carico — squadra non più in rosso (via: ${routeClear.error}).`
        : "Allarme preso in carico — squadra non più in rosso, via rimossa dalla mappa.",
    );
  }

  function openPushModal() {
    setPushTitle(tocPushTextUpper(readStoredPushTitle(TOC_PUSH_TITLE)));
    setPushBody(tocPushTextUpper(readStoredPushBody(TOC_PUSH_BODY)));
    setPushRouteId(mapRoutes[0]?.id ?? "");
    setPushTargetWaypointId(waypoints[0]?.id ?? "");
    setPushAlert(null);
    setPushSending(false);
    setPushOpen(true);
  }

  async function sendPush() {
    if (!session) {
      return;
    }
    const title = tocPushTextUpper(pushTitle);
    const body = tocPushTextUpper(pushBody);
    if (!title) {
      setPushAlert("Inserisci un titolo per la notifica.");
      return;
    }
    if (!body) {
      setPushAlert("Inserisci il testo del messaggio.");
      return;
    }

    const targets = pushTargetAll
      ? squads
      : squads.filter((s) => pushSelected[s.sessionId]);

    if (targets.length === 0) {
      setPushAlert("Nessuna squadra selezionata.");
      return;
    }

    setPushAlert(null);
    setPushSending(true);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];

    const selectedRoute =
      pushRouteId && pushSingleTarget ? mapRoutes.find((r) => r.id === pushRouteId) : null;

    for (const squad of targets) {
      const routeForSquad =
        selectedRoute && pushSingleTarget?.sessionId === squad.sessionId
          ? selectedRoute
          : null;

      if (routeForSquad) {
        const assignRes = await fetch("/api/assign-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session,
            sessionId: squad.sessionId,
            routeId: routeForSquad.id,
            targetWaypointId: pushTargetWaypointId || null,
          }),
        });
        if (!assignRes.ok) {
          let assignErr = `HTTP ${assignRes.status}`;
          try {
            const payload = (await assignRes.json()) as { error?: string };
            if (payload.error) {
              assignErr = payload.error;
            }
          } catch {
            /* ignore */
          }
          fail += 1;
          errors.push(`${squad.squadCode}: via — ${assignErr}`);
          continue;
        }
        setSelectedSessionId(squad.sessionId);
      }

      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: session,
          sessionId: squad.sessionId,
          title,
          body,
          alarm: true,
          routeCode: routeForSquad?.routeCode,
          targetWaypointId: pushTargetWaypointId || null,
        }),
      });
      let payload: { error?: string; code?: string } = {};
      try {
        payload = (await res.json()) as { error?: string; code?: string };
      } catch {
        payload = { error: res.statusText };
      }

      if (res.ok) {
        ok += 1;
      } else {
        fail += 1;
        const code = payload.code ?? `HTTP ${res.status}`;
        const msg = payload.error ?? "Errore sconosciuto";
        errors.push(`${squad.squadCode}: ${code} — ${msg}`);
      }
    }
    setPushSending(false);
    if (ok > 0) {
      await loadSelectedRouteAssignment();
    }
    if (fail === 0) {
      writeStoredPushMessage(title, body);
      setPushOpen(false);
      const routeHint =
        selectedRoute && pushSingleTarget
          ? ` Via ${selectedRoute.routeCode} sulla mappa (squadra ${pushSingleTarget.squadCode} selezionata).`
          : "";
      setStatusMessage(`Push inviate con successo: ${ok} squadra/e.${routeHint}`);
    } else {
      setStatusMessage(
        `Push: ${ok} ok, ${fail} errori. ${errors.slice(0, 2).join(" | ")}`,
      );
      if (ok > 0) {
        writeStoredPushMessage(title, body);
      }
    }
  }

  if (!session) {
    return (
      <main className={`${styles.screen} ${styles.loginScreen}`}>
        <div className={styles.loginLayout}>
          <div className={styles.loginLogoWrap}>
            <Image
              className={styles.loginLogoSide}
              src="/logo_open_golf_2026.png"
              alt="83 Open d'Italia 2026 — DS Automobiles"
              width={840}
              height={200}
              priority
            />
          </div>
          <form className={styles.loginCard} onSubmit={handleLogin}>
            <h1>Login gestSQUADRE</h1>
            <input
              placeholder="Codice operatore"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button className={styles.loginBtn} type="submit">
              Accedi
            </button>
            <p className={styles.loginHint}>
              <strong>GOLF_TORINO</strong> — dashboard TOC completa per il campo
              golf_torino · opzionale <strong>TOC01</strong> (tutti i campi)
            </p>
            {statusMessage ? <p className={styles.message}>{statusMessage}</p> : null}
          </form>
          <div className={styles.loginLogoWrap}>
            <Image
              className={styles.loginLogoSide}
              src="/logo_open_golf_2026.png"
              alt="83 Open d'Italia 2026 — DS Automobiles"
              width={840}
              height={200}
              priority
            />
          </div>
        </div>
        <p className={styles.loginSignature}>by R. Ronco</p>
      </main>
    );
  }

  const pendingAlarms = alarms.filter((a) => !a.acknowledged_at);

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1>
            gestSQUADRE — TOC
            {session.golfCourseCode ? (
              <span className={styles.courseTag}> · {session.golfCourseCode}</span>
            ) : null}
          </h1>
          <p className={styles.message}>{statusMessage}</p>
        </div>
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => void loadSquads()}>
            Aggiorna
          </button>
          {canForceSquadLogout ? (
            <button
              className={`${styles.btn} ${styles.btnResetSquads}`}
              type="button"
              title="Scegli quale squadra chiudere (logout forzato da TOC)"
              onClick={openSquadLogoutModal}
            >
              Logout squadra…
            </button>
          ) : null}
          <button
            className={`${styles.btn} ${styles.btnAlarm}`}
            type="button"
            onClick={openPushModal}
          >
            Invia allarme a squadre (push)
          </button>
          <button
            className={`${styles.btn} ${styles.btnYellow}`}
            type="button"
            onClick={() => openExternalMapWindow()}
            title="Apre una nuova finestra da spostare sul secondo monitor"
          >
            Mappa su schermo grande
          </button>
          <Link className={`${styles.btn} ${styles.btnYellow}`} href="/map-fullscreen">
            Mappa (stessa finestra)
          </Link>
          <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/waypoints">
            Waypoint ({waypoints.length})
          </Link>
          {canManageSquadsForCourse(session) ? (
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/campo/squads">
              Squadre campo
            </Link>
          ) : null}
          {canOpenEventLogs ? (
            <Link className={`${styles.btn} ${styles.btnYellow}`} href="/logs">
              Log evento
            </Link>
          ) : null}
          <button className={`${styles.btn} ${styles.btnDanger}`} type="button" onClick={handleLogout}>
            Logout TOC
          </button>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={styles.mapColumn}>
        <section className={styles.mapBox}>
          <div className={styles.mapToolbar}>
            <label className={styles.layerLabel}>
              Layer mappa
              <select
                className={styles.layerSelect}
                value={layerMode}
                onChange={(e) => {
                  const mode = e.target.value as LayerMode;
                  setLayerMode(mode);
                  writeStoredLayerMode(mode);
                }}
                aria-label="Layer mappa"
              >
                {layerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {mapActiveRoutes.length > 0 ? (
              <span className={styles.pushHint}>
                Vie attive: <strong>{mapActiveRoutes.length}</strong>
                {selectedRouteAssignment ? (
                  <>
                    {" "}
                    — selezionata{" "}
                    <strong>{selectedRouteAssignment.routeCode}</strong>
                    {selectedRouteAssignment.targetLabel
                      ? ` → ${selectedRouteAssignment.targetLabel}`
                      : ""}
                  </>
                ) : null}
              </span>
            ) : selectedSessionId ? (
              <span className={styles.pushHint} style={{ color: "#ffb74d" }}>
                Squadra selezionata: nessuna via assegnata (invia push con via + target).
              </span>
            ) : null}
          </div>
          <SquadLiveMap
            layerMode={layerMode}
            squads={squads}
            waypoints={waypoints}
            activeRoutes={mapActiveRoutes}
            alarmingSessionIds={alarmingSessionIds}
            selectedSessionId={selectedSessionId}
            onSelect={(s) => {
              setSelectedSessionId(s.sessionId);
              setSelectedRouteAssignment(
                routeAssignmentsBySession.get(s.sessionId) ?? null,
              );
            }}
            canManageWaypoints={canEditWaypointsOnMap && Boolean(activeEventId)}
            onEditWaypoint={(wp) => router.push(`/waypoints?edit=${wp.id}`)}
            onDeleteWaypoint={(wp) => void handleDeleteWaypointFromMap(wp)}
            height="400px"
          />
        </section>
        <footer className={styles.dashboardFooter}>
          <div className={styles.footerLogoWrap}>
            <Image
              className={styles.footerLogo}
              src="/logo_open_golf_2026.png"
              alt="83 Open d'Italia 2026 — DS Automobiles"
              width={840}
              height={200}
            />
          </div>
          <div className={styles.footerLogoWrap}>
            <Image
              className={styles.footerLogo}
              src="/logo_open_golf_2026.png"
              alt="83 Open d'Italia 2026 — DS Automobiles"
              width={840}
              height={200}
            />
          </div>
        </footer>
        </div>
        <aside className={styles.sidePanel}>
          <h2>Allarmi mappa ({pendingAlarms.length} in rosso)</h2>
          <p className={styles.pushHint}>
            La squadra segnala solo per evidenziare il punto sulla mappa. Nessuna push verso il TOC.
          </p>
          <div className={styles.alarmList}>
            {pendingAlarms.length === 0 ? (
              <p>Nessun allarme attivo.</p>
            ) : (
              pendingAlarms.map((a) => (
                <div key={a.id} className={styles.alarmItem}>
                  <div className={styles.alarmDot} aria-hidden>
                    !
                  </div>
                  <div className={styles.alarmBody}>
                    <p className={styles.alarmTitle}>
                      {a.squad_code} — {a.squad_name}
                    </p>
                    {a.message ? (
                      <p className={styles.alarmMessage}>{a.message}</p>
                    ) : null}
                    <p className={styles.alarmMeta}>
                      {new Date(a.created_at).toLocaleString("it-IT")}
                    </p>
                    <button
                      className={styles.btnSmall}
                      type="button"
                      onClick={() => void acknowledgeAlarm(a)}
                    >
                      Preso in carico
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <h3>Squadre online</h3>
          <div className={styles.squadListWrap}>
            <ul className={styles.squadList}>
            {squads.length === 0 ? (
              <li className={styles.squadRowMuted}>Nessuna squadra online.</li>
            ) : (
              squads.map((s) => {
                const alarming = alarmingSessionIds.has(s.sessionId);
                return (
                  <li key={s.sessionId} className={styles.squadRow}>
                    <span
                      className={
                        alarming
                          ? `${styles.squadBadge} ${styles.squadBadgeAlarm}`
                          : styles.squadBadge
                      }
                    />
                    <span
                      className={
                        alarming ? styles.squadLabelAlarm : styles.squadLabel
                      }
                    >
                      {alarming ? "ALLARME — " : ""}
                      {s.squadCode} — {s.squadName}
                    </span>
                    {canForceSquadLogout ? (
                      <button
                        type="button"
                        className={styles.btnLogoutSquad}
                        disabled={squadLogoutBusy}
                        title="Forza logout solo per questa squadra"
                        onClick={() => void forceLogoutSquad(s)}
                      >
                        Logout
                      </button>
                    ) : null}
                  </li>
                );
              })
            )}
            </ul>
          </div>
        </aside>
      </div>

      {squadLogoutOpen ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h2>Logout squadra (TOC)</h2>
            <p className={styles.pushHint}>
              Scegli la squadra da disconnettere se ha dimenticato il logout sul cellulare.
            </p>
            {onlineSessionsLogout.length === 0 ? (
              <p className={styles.pushHint}>Nessuna sessione online da chiudere.</p>
            ) : (
              <div className={styles.squadLogoutList}>
                {onlineSessionsLogout.map((s) => (
                  <label key={s.sessionId} className={styles.squadLogoutOption}>
                    <input
                      type="radio"
                      name="squad-logout-pick"
                      checked={squadLogoutPickId === s.sessionId}
                      onChange={() => setSquadLogoutPickId(s.sessionId)}
                    />
                    <span>
                      <strong>{s.squadCode}</strong> — {s.squadName}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className={styles.actions} style={{ marginTop: 12 }}>
              <button
                className={`${styles.btn} ${styles.btnResetSquads}`}
                type="button"
                disabled={squadLogoutBusy || onlineSessionsLogout.length === 0}
                onClick={() => void confirmSquadLogoutFromModal()}
              >
                {squadLogoutBusy ? "Logout…" : "Forza logout squadra selezionata"}
              </button>
              <button
                className={styles.btn}
                type="button"
                onClick={() => setSquadLogoutOpen(false)}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pushOpen ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h2>Push allarme verso squadre</h2>
            <p className={styles.pushHint}>
              Notifica con suono allarme sul cellulare (canale dedicato Android).
            </p>
            {pushHealth && !pushHealth.firebaseAdmin ? (
              <p className={styles.pushHint} style={{ color: "#ffb74d" }}>
                Push non disponibile: manca il service account Firebase (
                <strong>FIREBASE_SERVICE_ACCOUNT_PATH</strong> o{" "}
                <strong>FIREBASE_SERVICE_ACCOUNT_JSON</strong>).
                {typeof window !== "undefined" &&
                window.location.hostname.includes("vercel.app") ? (
                  <>
                    {" "}
                    Su Vercel: <strong>Settings</strong> →{" "}
                    <strong>Environment Variables</strong> → incolla tutto il JSON in{" "}
                    <code>FIREBASE_SERVICE_ACCOUNT_JSON</code> → <strong>Redeploy</strong>.
                  </>
                ) : (
                  <>
                    {" "}
                    In <code>backend_toc/.env.local</code>: scarica la chiave da Firebase Console
                    (progetto <code>allarme-app-2026-b9f74</code>) e imposta il percorso del file
                    .json. Poi riavvia <code>npm run dev</code>. Verifica:{" "}
                    <a href="/api/push-health" target="_blank" rel="noreferrer">
                      /api/push-health
                    </a>
                    .
                  </>
                )}
              </p>
            ) : null}
            {pushHealth && pushHealth.firebaseAdmin ? (
              <p className={styles.pushHint}>
                Server FCM: OK.
                {pushHealth.onlineSessions != null &&
                pushHealth.onlineSessions > 0 &&
                (pushHealth.onlineSessionsWithToken ?? 0) <
                  pushHealth.onlineSessions ? (
                  <>
                    {" "}
                    <strong style={{ color: "#ff5252" }}>
                      {pushHealth.onlineSessions - (pushHealth.onlineSessionsWithToken ?? 0)}{" "}
                      squadra/e online senza token push: ricompila APK KMP (kmp-dev.bat
                      rebuild), consenti notifiche, logout/login sul telefono.
                    </strong>
                  </>
                ) : pushHealth.fcmTokenRows != null && pushHealth.fcmTokenRows > 0 ? (
                  <>
                    {" "}
                    Token in DB: {pushHealth.fcmTokenRows}
                    {pushHealth.onlineSessionsWithToken != null
                      ? ` · online con push: ${pushHealth.onlineSessionsWithToken}/${pushHealth.onlineSessions ?? 0}`
                      : null}
                    .
                  </>
                ) : (
                  <>
                    {" "}
                    <strong style={{ color: "#ff5252" }}>
                      Nessun token in squad_fcm_tokens: ricompila APK, login squadra con notifiche
                      attive.
                    </strong>
                  </>
                )}
              </p>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={pushTargetAll}
                onChange={(e) => setPushTargetAll(e.target.checked)}
              />{" "}
              Tutte le squadre online
            </label>
            {!pushTargetAll
              ? squads.map((s) => (
                  <label key={s.sessionId} className={styles.squadCheck}>
                    <input
                      type="checkbox"
                      checked={Boolean(pushSelected[s.sessionId])}
                      onChange={(e) =>
                        setPushSelected((prev) => ({
                          ...prev,
                          [s.sessionId]: e.target.checked,
                        }))
                      }
                    />{" "}
                    {s.squadCode} — {s.squadName}
                  </label>
                ))
              : null}
            {pushSingleTarget ? (
              <>
                <p className={styles.pushHint}>
                  Squadra: <strong>{pushSingleTarget.squadCode}</strong> — scegli via e target
                  (non scrivere la via nel messaggio).
                </p>
                {mapRoutes.length > 0 ? (
                  <>
                    <label className={styles.pushField}>
                      Via da percorrere
                      <select
                        className={styles.pushInput}
                        value={pushRouteId}
                        onChange={(e) => setPushRouteId(e.target.value)}
                      >
                        <option value="">— Nessuna via —</option>
                        {mapRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.routeCode}
                            {r.routeName !== r.routeCode ? ` — ${r.routeName}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.pushField}>
                      Target (waypoint)
                      <select
                        className={styles.pushInput}
                        value={pushTargetWaypointId}
                        onChange={(e) => setPushTargetWaypointId(e.target.value)}
                      >
                        <option value="">— Nessun target —</option>
                        {waypoints.map((wp) => (
                          <option key={wp.id} value={wp.id}>
                            {waypointDisplayName(wp)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className={styles.pushHint} style={{ color: "#ffb74d" }}>
                    Nessuna via in database: su Supabase esegui{" "}
                    <code>sql/map_routes.sql</code> e{" "}
                    <code>sql/import_routes_golf_torino_seed.sql</code>, poi ricarica la pagina.
                  </p>
                )}
              </>
            ) : !pushTargetAll ? (
              <p className={styles.pushHint}>
                Per assegnare una via, seleziona <strong>una sola</strong> squadra (non tutte).
              </p>
            ) : null}
            <label className={styles.pushField}>
              Titolo notifica
              <input
                className={styles.pushInput}
                value={pushTitle}
                onChange={(e) =>
                  setPushTitle(e.target.value.toLocaleUpperCase("it-IT"))
                }
                maxLength={120}
                placeholder="TOC — ALLARME"
              />
            </label>
            <label className={styles.pushField}>
              Messaggio (maiuscolo sul telefono)
              <textarea
                className={styles.pushTextarea}
                value={pushBody}
                onChange={(e) =>
                  setPushBody(e.target.value.toLocaleUpperCase("it-IT"))
                }
                rows={4}
                maxLength={500}
                placeholder="Testo visibile nella notifica push…"
              />
            </label>
            {pushAlert ? (
              <p className={styles.pushAlert} role="alert">
                {pushAlert}
              </p>
            ) : null}
            <div className={styles.actions} style={{ marginTop: 12 }}>
              <button
                className={`${styles.btn} ${styles.btnAlarm}`}
                type="button"
                disabled={pushSending}
                onClick={() => void sendPush()}
              >
                {pushSending ? "Invio in corso…" : "Invia push allarme"}
              </button>
              <button className={styles.btn} type="button" onClick={() => setPushOpen(false)}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
