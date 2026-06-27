"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canViewEventLogs,
  canViewAlarmRouting,
  isCampoGolfSession,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { loginTocAdmin, restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { MAP_SQUAD_POLL_MS } from "@/lib/map-refresh";
import {
  clearRouteAssignmentForSession,
  fetchActiveRouteAssignmentsForSessions,
  routeAssignmentsSig,
  type SquadRouteAssignment,
} from "@/lib/map-routes";
import {
  canManageSquadsForCourse,
  fetchGolfCourseSquadIds,
  fetchLiveSquads,
} from "@/lib/golf-course-scope";
import {
  activeAutoNotifySig,
  autoNotifyMissionKey,
  formatAutoNotifyMissionDetail,
  type ActiveAutoNotifyDelivery,
} from "@/lib/active-auto-notify";
import {
  activeTocPushSig,
  formatTocPushMissionDetail,
  type ActiveTocPushDelivery,
} from "@/lib/active-toc-push";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { openExternalMapWindow } from "@/lib/open-external-map";
import {
  readStoredPushBody,
  readStoredPushTitle,
  writeStoredPushMessage,
} from "@/lib/push-message-storage";
import { tocPushTextUpper } from "@/lib/toc-push-text";
import { liveSquadsEqual, type LiveSquad } from "@/lib/live-squads";
import {
  fetchActiveEvent,
  fetchSquadMapPoints,
} from "@/lib/squad-map-points-feed";
import { formatAlarmRequestDetail } from "@/lib/squad-alarms";
import { SquadAlarmRequestDetail } from "@/components/squad-alarm-detail";
import { type SquadWaypoint, waypointDisplayName } from "@/lib/waypoints";
import type { OperationalEventSummary } from "@/lib/operational-events";
import {
  mapOperationalEventRow,
  type OperationalEventRow,
} from "@/lib/operational-events";
import {
  isOperationalEventActivatorSquad,
  OPERATIONAL_EVENT_ACTIVATOR_LABEL,
} from "@/lib/operational-event-activators";
import styles from "./toc-dashboard.module.css";

const TOC_PUSH_TITLE = "TOC — ALLARME";
const TOC_PUSH_BODY =
  "MESSAGGIO URGENTE DAL TACTICAL OPERATIONS CENTER. METTITI IN CONTATTO CON IL TOC.";
const PHOTO_NOTIFY_LABEL = "RICEZIONE FOTO DA SQUADRE";

type AlarmRow = {
  id: string;
  session_id: string;
  squad_code: string;
  squad_name: string;
  message: string | null;
  request_types?: unknown;
  other_detail?: string | null;
  created_at: string;
  acknowledged_at: string | null;
  operational_event_id?: string | null;
  operational_events?:
    | { display_number: number }
    | { display_number: number }[]
    | null;
};

function resolveAlarmOperationalNumber(
  alarm: AlarmRow,
  openEvents: OperationalEventSummary[],
): number | null {
  const embedded = alarm.operational_events;
  if (Array.isArray(embedded) && embedded[0]?.display_number != null) {
    return Number(embedded[0].display_number);
  }
  if (embedded && !Array.isArray(embedded) && embedded.display_number != null) {
    return Number(embedded.display_number);
  }
  const eventId = alarm.operational_event_id?.trim();
  if (!eventId) {
    return null;
  }
  return openEvents.find((event) => event.id === eventId)?.displayNumber ?? null;
}

type FieldPhotoLogRow = {
  id: string;
  squad_code: string;
  squad_name: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  note: string | null;
  status: string;
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
  const [statusMessage, setStatusMessage] = useState("");
  const [photoNotification, setPhotoNotification] = useState<{
    photoId: string;
  } | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [pushModalDrag, setPushModalDrag] = useState({ x: 0, y: 0 });
  const pushModalDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const [pushTitle, setPushTitle] = useState(TOC_PUSH_TITLE);
  const [pushBody, setPushBody] = useState(TOC_PUSH_BODY);
  const [pushAlert, setPushAlert] = useState<string | null>(null);
  const [pushSending, setPushSending] = useState(false);
  const [missionResetBusy, setMissionResetBusy] = useState<string | null>(null);
  const [pushTargetAll, setPushTargetAll] = useState(false);
  const [pushSelected, setPushSelected] = useState<Record<string, boolean>>({});
  const [pushTargetWaypointId, setPushTargetWaypointId] = useState("");
  const [selectedRouteAssignment, setSelectedRouteAssignment] =
    useState<SquadRouteAssignment | null>(null);
  const [routeAssignmentsBySession, setRouteAssignmentsBySession] = useState<
    Map<string, SquadRouteAssignment>
  >(new Map());
  const [activeAutoNotifies, setActiveAutoNotifies] = useState<
    ActiveAutoNotifyDelivery[]
  >([]);
  const [activeTocPushes, setActiveTocPushes] = useState<ActiveTocPushDelivery[]>(
    [],
  );
  const [pushHealth, setPushHealth] = useState<{
    supabaseServiceRole: boolean;
    firebaseAdmin: boolean;
    fcmTokenRows?: number;
    onlineSessions?: number;
    onlineSessionsWithToken?: number;
    onlineSquadsMissingPush?: string[];
    supabaseProject?: string | null;
  } | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<SquadWaypoint[]>([]);
  const [squadLogoutOpen, setSquadLogoutOpen] = useState(false);
  const [squadLogoutPickId, setSquadLogoutPickId] = useState<string | null>(null);
  const [squadLogoutBusy, setSquadLogoutBusy] = useState(false);
  const [onlineSessionsLogout, setOnlineSessionsLogout] = useState<LiveSquad[]>([]);
  const [openOperationalEvents, setOpenOperationalEvents] = useState<
    OperationalEventSummary[]
  >([]);
  const [operationalBusy, setOperationalBusy] = useState<string | null>(null);
  const [interventionDrafts, setInterventionDrafts] = useState<Record<string, string>>(
    {},
  );
  const [pushOperationalEventId, setPushOperationalEventId] = useState("");
  const [operationalEventsLoadError, setOperationalEventsLoadError] = useState<
    string | null
  >(null);

  const canForceSquadLogout = session?.role === "admin";
  const canOpenEventLogs = session ? canViewEventLogs(session.role) : false;
  const canOpenAlarmRouting = session ? canViewAlarmRouting(session.role) : false;

  const alarmingSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of alarms) {
      if (!a.acknowledged_at) {
        ids.add(a.session_id);
      }
    }
    return ids;
  }, [alarms]);

  const pendingAlarmSessionIds = useMemo(
    () => alarms.filter((a) => !a.acknowledged_at).map((a) => a.session_id),
    [alarms],
  );

  const squadsRef = useRef(squads);
  squadsRef.current = squads;

  const alarmsRef = useRef(alarms);
  alarmsRef.current = alarms;

  const activeAutoNotifyFetchSeq = useRef(0);
  const dashboardOpenedAtRef = useRef(new Date().toISOString());
  const lastPhotoPollIdRef = useRef<string | null>(null);

  const applyFieldPhotoNotification = useCallback((row: FieldPhotoLogRow) => {
    if (row.status !== "inviato") {
      return;
    }
    setPhotoNotification({ photoId: row.id });
  }, []);

  const pollFieldPhotoNotifications = useCallback(async () => {
    if (!supabase || !session) {
      return;
    }

    const courseId = session.golfCourseId ?? null;
    let squadCodes: string[] | null = null;
    if (courseId) {
      const squadIds = await fetchGolfCourseSquadIds(supabase, courseId);
      if (squadIds.length === 0) {
        return;
      }
      const { data: squadRows } = await supabase
        .from("squads")
        .select("squad_code")
        .in("id", squadIds);
      squadCodes =
        squadRows
          ?.map((r) => String(r.squad_code).trim().toUpperCase())
          .filter(Boolean) ?? [];
      if (squadCodes.length === 0) {
        return;
      }
    }

    let query = supabase
      .from("squad_field_photo_logs")
      .select(
        "id, squad_code, squad_name, latitude, longitude, accuracy_m, note, status, created_at",
      )
      .eq("status", "inviato")
      .gt("created_at", dashboardOpenedAtRef.current)
      .order("created_at", { ascending: false })
      .limit(1);

    if (squadCodes) {
      query = query.in("squad_code", squadCodes);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      return;
    }
    if (data.id === lastPhotoPollIdRef.current) {
      return;
    }
    lastPhotoPollIdRef.current = data.id;
    applyFieldPhotoNotification(data as FieldPhotoLogRow);
  }, [supabase, session, applyFieldPhotoNotification]);

  useEffect(() => {
    if (!session) {
      setPhotoNotification(null);
      lastPhotoPollIdRef.current = null;
      return;
    }
    dashboardOpenedAtRef.current = new Date().toISOString();
    lastPhotoPollIdRef.current = null;
    setPhotoNotification(null);
  }, [session]);

  useEffect(() => {
    if (!session || !supabase) {
      return;
    }
    void pollFieldPhotoNotifications();
    const timer = window.setInterval(() => void pollFieldPhotoNotifications(), 4_000);
    return () => window.clearInterval(timer);
  }, [session, supabase, pollFieldPhotoNotifications]);

  const onlineSessionIds = useMemo(
    () => new Set(squads.map((s) => s.sessionId)),
    [squads],
  );

  const onlineSessionIdsSig = useMemo(
    () => squads.map((s) => s.sessionId).sort().join("|"),
    [squads],
  );

  const mapAlarmingSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of alarmingSessionIds) {
      if (onlineSessionIds.has(id)) {
        ids.add(id);
      }
    }
    return ids;
  }, [alarmingSessionIds, onlineSessionIds]);

  const activeTocMissions = useMemo(
    () =>
      Array.from(routeAssignmentsBySession.values())
        .filter((assignment) => onlineSessionIds.has(assignment.sessionId))
        .map((assignment) => {
          const squad = squads.find((s) => s.sessionId === assignment.sessionId);
          return squad ? { assignment, squad } : null;
        })
        .filter(
          (
            row,
          ): row is { assignment: SquadRouteAssignment; squad: LiveSquad } =>
            row !== null,
        )
        .sort((a, b) =>
          a.squad.squadCode.localeCompare(b.squad.squadCode, "it"),
        ),
    [routeAssignmentsBySession, squads, onlineSessionIds],
  );

  const activeMissionCount =
    activeTocMissions.length + activeTocPushes.length + activeAutoNotifies.length;

  const pushSingleTarget = useMemo(() => {
    if (pushTargetAll) {
      return null;
    }
    const picked = squads.filter((s) => pushSelected[s.sessionId]);
    return picked.length === 1 ? picked[0]! : null;
  }, [pushTargetAll, pushSelected, squads]);

  const handleSquadRowSelect = useCallback((squad: LiveSquad) => {
    setSelectedSessionId(squad.sessionId);
    setSelectedRouteAssignment((prev) => {
      const next = routeAssignmentsBySession.get(squad.sessionId) ?? null;
      if (!prev && !next) {
        return prev;
      }
      if (prev && next && prev.id === next.id) {
        return prev;
      }
      return next;
    });
  }, [routeAssignmentsBySession]);

  useEffect(() => {
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

  const loadOpenOperationalEvents = useCallback(async () => {
    if (!session) {
      setOpenOperationalEvents([]);
      setOperationalEventsLoadError(null);
      return;
    }

    if (supabase) {
      let query = supabase
        .from("operational_events")
        .select(
          "id, display_number, intervention_ref, status, golf_course_id, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code",
        )
        .eq("status", "aperto")
        .order("display_number", { ascending: false });

      if (golfCourseId) {
        query = query.eq("golf_course_id", golfCourseId);
      }

      const { data, error } = await query;
      if (error) {
        const missing = error.message.includes("operational_events");
        setOperationalEventsLoadError(
          missing
            ? "Esegui sql/operational_events.sql su Supabase."
            : error.message,
        );
        setOpenOperationalEvents([]);
        return;
      }

      setOperationalEventsLoadError(null);
      const rows = ((data ?? []) as OperationalEventRow[]).map(mapOperationalEventRow);
      setOpenOperationalEvents(rows);
      setInterventionDrafts((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (next[row.id] === undefined) {
            next[row.id] = row.interventionRef ?? "";
          }
        }
        return next;
      });
      return;
    }

    const params = new URLSearchParams({ status: "aperto" });
    if (golfCourseId) {
      params.set("golfCourseId", golfCourseId);
    }
    try {
      const res = await fetch(`/api/operational-events?${params.toString()}`);
      const body = (await res.json()) as {
        rows?: OperationalEventSummary[];
        schemaMissing?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setOperationalEventsLoadError(body.error ?? `Errore HTTP ${res.status}`);
        setOpenOperationalEvents([]);
        return;
      }
      if (body.schemaMissing) {
        setOperationalEventsLoadError("Esegui sql/operational_events.sql su Supabase.");
        setOpenOperationalEvents([]);
        return;
      }
      const rows = [...(body.rows ?? [])].sort(
        (a, b) => b.displayNumber - a.displayNumber,
      );
      setOperationalEventsLoadError(null);
      setOpenOperationalEvents(rows);
      setInterventionDrafts((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (next[row.id] === undefined) {
            next[row.id] = row.interventionRef ?? "";
          }
        }
        return next;
      });
    } catch {
      setOperationalEventsLoadError("Impossibile caricare gli eventi operativi.");
      setOpenOperationalEvents([]);
    }
  }, [session, supabase, golfCourseId]);

  async function closeOperationalEvent(event: OperationalEventSummary) {
    if (!session) {
      return;
    }
    if (
      !window.confirm(
        `Chiudere evento operativo n° ${event.displayNumber}?\n` +
          "Non sarà più selezionabile per nuove missioni.",
      )
    ) {
      return;
    }
    setOperationalBusy(`close-${event.id}`);
    try {
      const res = await fetch("/api/operational-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          action: "close",
          operationalEventId: event.id,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatusMessage(payload.error ?? "Chiusura evento fallita.");
        return;
      }
      await loadOpenOperationalEvents();
      setStatusMessage(`Evento operativo n° ${event.displayNumber} chiuso.`);
    } catch {
      setStatusMessage("Chiusura evento: errore di rete.");
    } finally {
      setOperationalBusy(null);
    }
  }

  async function saveInterventionRef(event: OperationalEventSummary) {
    if (!session) {
      return;
    }
    setOperationalBusy(`intervention-${event.id}`);
    try {
      const res = await fetch("/api/operational-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          action: "intervention",
          operationalEventId: event.id,
          interventionRef: interventionDrafts[event.id] ?? "",
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        event?: OperationalEventSummary;
      };
      if (!res.ok) {
        setStatusMessage(payload.error ?? "Salvataggio N° intervento fallito.");
        return;
      }
      await loadOpenOperationalEvents();
      if (payload.event) {
        setInterventionDrafts((prev) => ({
          ...prev,
          [payload.event!.id]: payload.event!.interventionRef ?? "",
        }));
      }
      setStatusMessage(`N° intervento aggiornato — evento ${event.displayNumber}.`);
    } catch {
      setStatusMessage("N° intervento: errore di rete.");
    } finally {
      setOperationalBusy(null);
    }
  }

  function formatMissionOperationalEventLabel(
    eventNumber: number | null | undefined,
  ): string {
    return eventNumber != null ? String(eventNumber) : "—";
  }

  const loadSquads = useCallback(async () => {
    if (!supabase) {
      setStatusMessage("Configura NEXT_PUBLIC_SUPABASE_* in .env.local");
      return;
    }
    const rows = await fetchLiveSquads(supabase, golfCourseId);
    setSquads((prev) => (liveSquadsEqual(prev, rows) ? prev : rows));
    const squadCountLabel = `${rows.length} squadre online`;
    setStatusMessage((prev) => (prev === squadCountLabel ? prev : squadCountLabel));
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
    const baseSelect =
      "id, session_id, squad_code, squad_name, message, request_types, other_detail, created_at, acknowledged_at, squad_id, operational_event_id, operational_events(display_number)";
    let query = supabase
      .from("squad_alarms")
      .select(baseSelect)
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

    const { data: primaryData, error: primaryError } = await query;
    let rows: AlarmRow[] = (primaryData ?? []) as AlarmRow[];
    let error = primaryError;
    if (
      error &&
      /operational_event_id|operational_events|column/i.test(error.message)
    ) {
      let fallbackQuery = supabase
        .from("squad_alarms")
        .select(
          "id, session_id, squad_code, squad_name, message, request_types, other_detail, created_at, acknowledged_at, squad_id",
        )
        .order("created_at", { ascending: false })
        .limit(40);
      if (golfCourseId) {
        const squadIds = await fetchGolfCourseSquadIds(supabase, golfCourseId);
        if (squadIds.length === 0) {
          setAlarms([]);
          return;
        }
        fallbackQuery = fallbackQuery.in("squad_id", squadIds);
      }
      const fallback = await fallbackQuery;
      rows = (fallback.data ?? []) as AlarmRow[];
      error = fallback.error;
    }

    if (error) {
      return;
    }
    setAlarms(rows);
  }, [supabase, golfCourseId]);

  const ensureOperationalEventForActivatorAlarm = useCallback(
    async (row: AlarmRow) => {
      if (!session || !isOperationalEventActivatorSquad(row.squad_code)) {
        return;
      }
      try {
        const res = await fetch("/api/operational-events/open-from-squad-alarm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session, alarmId: row.id }),
        });
        const payload = (await res.json()) as {
          error?: string;
          event?: OperationalEventSummary;
          created?: boolean;
        };
        if (!res.ok) {
          setOperationalEventsLoadError(
            payload.error ?? "Apertura evento da squadra attivatore fallita.",
          );
          return;
        }
        await loadOpenOperationalEvents();
        await loadAlarms();
        if (payload.event) {
          setInterventionDrafts((prev) => ({
            ...prev,
            [payload.event!.id]: payload.event!.interventionRef ?? "",
          }));
          setStatusMessage(
            payload.created
              ? `EVENTO OPERATIVO n° ${payload.event.displayNumber} aperto da ${row.squad_code}.`
              : `EVENTO OPERATIVO n° ${payload.event.displayNumber} attivo (${row.squad_code}).`,
          );
        }
      } catch {
        setOperationalEventsLoadError(
          "Apertura evento da squadra attivatore: errore di rete.",
        );
      }
    },
    [session, loadOpenOperationalEvents, loadAlarms],
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

  const loadSelectedRouteAssignment = useCallback(async (extraSessionIds: string[] = []) => {
    if (!supabase) {
      setRouteAssignmentsBySession(new Map());
      setSelectedRouteAssignment(null);
      return;
    }
    const squadsSnapshot = squadsRef.current;
    const onlineIds = new Set(squadsSnapshot.map((s) => s.sessionId));
    const sessionIds = [
      ...new Set([
        ...squadsSnapshot.map((s) => s.sessionId),
        ...pendingAlarmSessionIds.filter((id) => onlineIds.has(id)),
        ...extraSessionIds,
      ]),
    ];
    if (sessionIds.length === 0) {
      return;
    }
    const { assignments, error } = await fetchActiveRouteAssignmentsForSessions(
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
    if (error) {
      setStatusMessage(`Via mappa: ${error}`);
    }
    const routeSessionId =
      (selectedSessionId && visibleAssignments.has(selectedSessionId)
        ? selectedSessionId
        : null) ??
      sessionIds.find((id) => visibleAssignments.has(id)) ??
      selectedSessionId ??
      null;
    if (!selectedSessionId && routeSessionId && visibleAssignments.has(routeSessionId)) {
      setSelectedSessionId(routeSessionId);
    }
    const nextSelectedRoute = routeSessionId
      ? (visibleAssignments.get(routeSessionId) ?? null)
      : null;
    setSelectedRouteAssignment((prev) => {
      if (!prev && !nextSelectedRoute) {
        return prev;
      }
      if (
        prev &&
        nextSelectedRoute &&
        prev.id === nextSelectedRoute.id &&
        prev.sessionId === nextSelectedRoute.sessionId
      ) {
        return prev;
      }
      return nextSelectedRoute;
    });
  }, [supabase, selectedSessionId, pendingAlarmSessionIds]);

  const loadActiveAutoNotifies = useCallback(async () => {
    if (!session) {
      setActiveAutoNotifies([]);
      setActiveTocPushes([]);
      return;
    }

    const seq = ++activeAutoNotifyFetchSeq.current;

    const eventIds = new Set<string>();
    if (activeEventId) {
      eventIds.add(activeEventId);
    }
    for (const squad of squadsRef.current) {
      if (squad.eventId) {
        eventIds.add(squad.eventId);
      }
    }

    const openAlarmIds = alarmsRef.current
      .filter((alarm) => !alarm.acknowledged_at)
      .map((alarm) => alarm.id);

    const params = new URLSearchParams();
    if (golfCourseId) {
      params.set("golfCourseId", golfCourseId);
    }
    if (eventIds.size > 0) {
      params.set("eventIds", [...eventIds].join(","));
    }
    if (openAlarmIds.length > 0) {
      params.set("alarmIds", openAlarmIds.join(","));
    }

    try {
      const res = await fetch(
        `/api/active-auto-notify-missions?${params.toString()}`,
      );
      if (seq !== activeAutoNotifyFetchSeq.current) {
        return;
      }
      if (!res.ok) {
        setStatusMessage(`Missioni GT: errore HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as {
        rows: ActiveAutoNotifyDelivery[];
        tocPushes?: ActiveTocPushDelivery[];
        error: string | null;
      };
      if (seq !== activeAutoNotifyFetchSeq.current) {
        return;
      }
      const nextAuto = body.rows ?? [];
      const nextPush = body.tocPushes ?? [];
      setActiveAutoNotifies((prev) =>
        activeAutoNotifySig(prev) === activeAutoNotifySig(nextAuto) ? prev : nextAuto,
      );
      setActiveTocPushes((prev) =>
        activeTocPushSig(prev) === activeTocPushSig(nextPush) ? prev : nextPush,
      );
      if (body.error) {
        setStatusMessage(body.error);
      }
    } catch {
      if (seq !== activeAutoNotifyFetchSeq.current) {
        return;
      }
      setStatusMessage("Missioni GT: impossibile caricare gli inoltri automatici.");
    }
  }, [session, activeEventId, golfCourseId]);

  const debouncedLoadActiveAutoNotifies = useMemo(() => {
    let timer: number | null = null;
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        void loadActiveAutoNotifies();
      }, 400);
    };
  }, [loadActiveAutoNotifies]);

  useEffect(() => {
    if (!session) {
      return;
    }
    void loadOpenOperationalEvents();
    const timer = window.setInterval(() => void loadOpenOperationalEvents(), 12_000);
    return () => window.clearInterval(timer);
  }, [session, loadOpenOperationalEvents]);

  useEffect(() => {
    if (!session) {
      return;
    }
    void loadActiveAutoNotifies();
    const timer = window.setInterval(() => void loadActiveAutoNotifies(), 5_000);
    return () => window.clearInterval(timer);
  }, [session, loadActiveAutoNotifies]);

  const openAlarmIdsSig = useMemo(
    () =>
      alarms
        .filter((alarm) => !alarm.acknowledged_at)
        .map((alarm) => alarm.id)
        .sort()
        .join("|"),
    [alarms],
  );

  useEffect(() => {
    if (!session) {
      return;
    }
    debouncedLoadActiveAutoNotifies();
  }, [session, openAlarmIdsSig, debouncedLoadActiveAutoNotifies]);

  useEffect(() => {
    void loadSelectedRouteAssignment();
  }, [loadSelectedRouteAssignment, onlineSessionIdsSig, pendingAlarmSessionIds]);

  const loadPushHealth = useCallback(async () => {
    if (!session) {
      return;
    }
    try {
      const q = golfCourseId
        ? `?golfCourseId=${encodeURIComponent(golfCourseId)}`
        : "";
      const res = await fetch(`/api/push-health${q}`);
      if (res.ok) {
        setPushHealth(await res.json());
      }
    } catch {
      setPushHealth(null);
    }
  }, [session, golfCourseId]);

  useEffect(() => {
    if (!session) {
      return;
    }
    void loadPushHealth();
    const timer = window.setInterval(() => void loadPushHealth(), 30_000);
    return () => window.clearInterval(timer);
  }, [session, loadPushHealth]);

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
        () => {
          void loadSquads();
          void loadSelectedRouteAssignment();
        },
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
            const detail = formatAlarmRequestDetail(row);
            if (isOperationalEventActivatorSquad(row.squad_code)) {
              setStatusMessage(
                `ALLARME ATTIVATORE ${row.squad_code} — ${detail} (apertura evento operativo…)`,
              );
              void ensureOperationalEventForActivatorAlarm(row);
              window.setTimeout(() => void loadOpenOperationalEvents(), 600);
            } else {
              setStatusMessage(`ALLARME: ${row.squad_code} — ${detail}`);
            }
            void loadSelectedRouteAssignment([row.session_id]);
            debouncedLoadActiveAutoNotifies();
          } else {
            void loadAlarms();
            void loadSelectedRouteAssignment();
            debouncedLoadActiveAutoNotifies();
          }
        },
      )
      .subscribe();

    const operationalEventsChannel = supabase
      .channel("gest-operational-events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operational_events" },
        () => {
          void loadOpenOperationalEvents();
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

    const autoNotifyChannel = supabase
      .channel("gest-alarm-auto-notify")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alarm_auto_notify_logs" },
        () => debouncedLoadActiveAutoNotifies(),
      )
      .subscribe();

    const mobileDismissChannel = supabase
      .channel("gest-mobile-dismiss")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "squad_mobile_dismiss_logs" },
        () => debouncedLoadActiveAutoNotifies(),
      )
      .subscribe();

    const tocPushChannel = supabase
      .channel("gest-toc-push-logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "toc_push_logs" },
        () => debouncedLoadActiveAutoNotifies(),
      )
      .subscribe();

    const fieldPhotoChannel = supabase
      .channel("gest-squad-field-photos")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "squad_field_photo_logs" },
        (payload) => {
          const row = payload.new as FieldPhotoLogRow;
          lastPhotoPollIdRef.current = row.id;
          applyFieldPhotoNotification(row);
        },
      )
      .subscribe();

    const timer = window.setInterval(() => void loadSquads(), MAP_SQUAD_POLL_MS);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(squadChannel);
      void supabase.removeChannel(alarmChannel);
      void supabase.removeChannel(operationalEventsChannel);
      void supabase.removeChannel(wpChannel);
      void supabase.removeChannel(routeChannel);
      void supabase.removeChannel(autoNotifyChannel);
      void supabase.removeChannel(mobileDismissChannel);
      void supabase.removeChannel(tocPushChannel);
      void supabase.removeChannel(fieldPhotoChannel);
    };
  }, [session, supabase, loadSquads, loadAlarms, loadActiveEventAndWaypoints, loadSelectedRouteAssignment, debouncedLoadActiveAutoNotifies, applyFieldPhotoNotification, loadOpenOperationalEvents, ensureOperationalEventForActivatorAlarm]);

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

    await clearRouteAssignmentForSession(supabase, squad.sessionId);
    await loadSquads();
    await loadSelectedRouteAssignment();
    await loadOnlineSessionsForLogout();
    if (selectedSessionId === squad.sessionId) {
      setSelectedSessionId(null);
      setSelectedRouteAssignment(null);
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

  async function closeSquadPanelOnMobile(sessionId: string) {
    if (!session) {
      return;
    }
    try {
      await fetch("/api/close-toc-squad-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, sessionId }),
      });
    } catch {
      /* best effort: il pannello mobile si aggiorna anche al prossimo poll */
    }
  }

  async function endTocMission(
    assignment: SquadRouteAssignment,
    squad: LiveSquad,
  ) {
    if (!supabase || !session || !activeEventId) {
      return;
    }
    if (
      !window.confirm(
        `Chiudere la missione TOC per ${squad.squadCode}?\n` +
          `Via ${assignment.routeCode}` +
          (assignment.targetLabel ? ` → ${assignment.targetLabel}` : "") +
          " verrà rimossa dalla mappa.",
      )
    ) {
      return;
    }

    const routeClear = await clearRouteAssignmentForSession(
      supabase,
      assignment.sessionId,
    );
    const { error: logErr } = await supabase.from("toc_mission_close_logs").insert({
      event_id: activeEventId,
      session_id: assignment.sessionId,
      squad_id: squad.squadId,
      squad_code: squad.squadCode,
      squad_name: squad.squadName,
      route_code: assignment.routeCode,
      target_waypoint_label: assignment.targetLabel,
      admin_code: session.code,
      operational_event_id: assignment.operationalEventId,
    });

    await loadSelectedRouteAssignment();
    if (selectedSessionId === assignment.sessionId) {
      setSelectedRouteAssignment(null);
    }
    await closeSquadPanelOnMobile(assignment.sessionId);

    const routeHint = ` Via ${assignment.routeCode} rimossa dalla mappa.`;
    if (logErr) {
      setStatusMessage(
        routeClear.error
          ? `Fine evento missione (errore via: ${routeClear.error}; log: ${logErr.message}).`
          : `Via rimossa; errore log missione: ${logErr.message}`,
      );
      return;
    }
    setStatusMessage(
      routeClear.error
        ? `Fine evento missione registrata (errore via: ${routeClear.error}).`
        : `Fine evento missione registrata — ${squad.squadCode}.${routeHint}`,
    );
  }

  async function forceMissionReset(
    busyKey: string,
    label: string,
    payload: Record<string, unknown>,
  ) {
    if (!session) {
      return;
    }
    if (
      !window.confirm(
        `Forzare reset notifica per ${label}?\n` +
          "La missione sparisce dalla colonna (come se il destinatario avesse premuto Reset sull'app).",
      )
    ) {
      return;
    }

    setMissionResetBusy(busyKey);
    try {
      const res = await fetch("/api/force-mission-dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, ...payload }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setStatusMessage(data.error ?? `Reset missione fallito (HTTP ${res.status}).`);
        return;
      }
      setStatusMessage(`Reset forzato — ${label}`);
      await loadActiveAutoNotifies();
    } catch {
      setStatusMessage("Reset missione: errore di rete.");
    } finally {
      setMissionResetBusy(null);
    }
  }

  async function acknowledgeAlarm(alarm: AlarmRow) {
    if (!supabase || !session) {
      return;
    }
    const activeRoute = routeAssignmentsBySession.get(alarm.session_id);
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
    await closeSquadPanelOnMobile(alarm.session_id);
    const routeHint = activeRoute ? ` Via ${activeRoute.routeCode} rimossa dalla mappa.` : "";
    setStatusMessage(
      routeClear.error
        ? `Fine evento — squadra non più in rosso (errore via: ${routeClear.error}).`
        : `Fine evento registrato — squadra non più in rosso.${routeHint}`,
    );
  }

  function openPushModal() {
    setPushTitle(tocPushTextUpper(readStoredPushTitle(TOC_PUSH_TITLE)));
    setPushBody(tocPushTextUpper(readStoredPushBody(TOC_PUSH_BODY)));
    setPushTargetWaypointId(waypoints[0]?.id ?? "");
    setPushOperationalEventId("");
    setPushAlert(null);
    setPushSending(false);
    setPushTargetAll(false);
    const initialSelected: Record<string, boolean> = {};
    const preselect =
      (selectedSessionId && squads.some((s) => s.sessionId === selectedSessionId)
        ? selectedSessionId
        : null) ?? squads[0]?.sessionId;
    if (preselect) {
      initialSelected[preselect] = true;
    }
    setPushSelected(initialSelected);
    setPushModalDrag({ x: 0, y: 0 });
    pushModalDragRef.current = null;
    setPushOpen(true);
    void loadPushHealth();
    void loadOpenOperationalEvents();
  }

  function onPushModalDragStart(e: React.PointerEvent<HTMLHeadingElement>) {
    if (e.button !== 0) {
      return;
    }
    pushModalDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: pushModalDrag.x,
      baseY: pushModalDrag.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPushModalDragMove(e: React.PointerEvent<HTMLHeadingElement>) {
    const drag = pushModalDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    setPushModalDrag({
      x: drag.baseX + (e.clientX - drag.startX),
      y: drag.baseY + (e.clientY - drag.startY),
    });
  }

  function onPushModalDragEnd(e: React.PointerEvent<HTMLHeadingElement>) {
    const drag = pushModalDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      return;
    }
    pushModalDragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
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
      setPushAlert("Seleziona una squadra destinataria.");
      return;
    }
    if (!pushTargetAll && targets.length !== 1) {
      setPushAlert("Seleziona una sola squadra, oppure attiva «Tutte le squadre online».");
      return;
    }

    const missingPushCodes = new Set(
      (pushHealth?.onlineSquadsMissingPush ?? []).map((c) => c.toUpperCase()),
    );
    const targetsWithoutPush = targets.filter((s) =>
      missingPushCodes.has(s.squadCode.toUpperCase()),
    );
    if (targetsWithoutPush.length > 0) {
      const names = targetsWithoutPush.map((s) => s.squadCode).join(", ");
      const proceed = window.confirm(
        `ATTENZIONE: ${names} risulta/e senza token push e NON riceverà la notifica.\n\nSul telefono: login, consenti notifiche, verifica "Push TOC: attiva" in verde.\n\nInviare comunque alle altre squadre?`,
      );
      if (!proceed) {
        return;
      }
    }

    setPushAlert(null);
    setPushSending(true);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];

    const pushWaypoint =
      !pushTargetAll && pushTargetWaypointId
        ? (waypoints.find((w) => w.id === pushTargetWaypointId) ?? null)
        : null;

    for (const squad of targets) {
      const res = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: session,
          sessionId: squad.sessionId,
          title,
          body,
          alarm: true,
          targetWaypointId: pushWaypoint?.id ?? null,
          targetWaypointLabel: pushWaypoint ? waypointDisplayName(pushWaypoint) : null,
          operationalEventId: pushOperationalEventId.trim() || null,
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
    if (fail === 0) {
      writeStoredPushMessage(title, body);
      setPushOpen(false);
      setStatusMessage(`Push inviate con successo: ${ok} squadra/e.`);
      debouncedLoadActiveAutoNotifies();
    } else {
      setStatusMessage(
        `Push: ${ok} ok, ${fail} errori. ${errors.slice(0, 2).join(" | ")}`,
      );
      if (ok > 0) {
        writeStoredPushMessage(title, body);
        debouncedLoadActiveAutoNotifies();
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
        <div className={styles.headerTop}>
          <div className={styles.headerLogoWrap}>
            <Image
              className={styles.headerLogo}
              src="/logo_open_golf_2026.png"
              alt="83 Open d'Italia 2026 — DS Automobiles"
              width={420}
              height={100}
              priority
            />
          </div>
          <div className={styles.headerCenterCluster}>
            <div className={styles.headerTitleBlock}>
              <h1>
                gestSQUADRE — TOC
                {session.golfCourseCode ? (
                  <span className={styles.courseTag}> · {session.golfCourseCode}</span>
                ) : null}
              </h1>
              <p className={styles.message}>{statusMessage}</p>
            </div>
          </div>
          <div className={styles.headerLogoWrapRight}>
            <Image
              className={styles.headerLogo}
              src="/logo_open_golf_2026.png"
              alt="83 Open d'Italia 2026 — DS Automobiles"
              width={420}
              height={100}
            />
          </div>
        </div>
        {photoNotification ? (
          <div className={styles.photoNotifyBannerWrap}>
            <Link
              href={`/logs?photoId=${encodeURIComponent(photoNotification.photoId)}`}
              className={styles.photoNotifyBanner}
              title="Apri Log eventi sulla foto ricevuta"
            >
              {PHOTO_NOTIFY_LABEL}
            </Link>
          </div>
        ) : null}
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
            Invia MISSIONI a squadre (push)
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
              Log eventi
            </Link>
          ) : null}
          {canOpenAlarmRouting ? (
            <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/alarm-routing">
              Destinatari allarme
            </Link>
          ) : null}
          <button className={`${styles.btn} ${styles.btnDanger}`} type="button" onClick={handleLogout}>
            Logout TOC
          </button>
        </div>
      </header>

      <section className={styles.operationalEventsPanel}>
        <div className={styles.operationalEventsHeader}>
          <h2 className={styles.operationalEventsTitle}>Eventi operativi</h2>
          {openOperationalEvents.length > 0 ? (
            <span className={styles.operationalEventsActiveBadge}>
              Attivi:{" "}
              {openOperationalEvents
                .map((event) => `N° ${event.displayNumber}`)
                .join(" · ")}
            </span>
          ) : null}
        </div>
        <p className={styles.operationalEventsHint}>
          Apertura automatica quando le squadre attivatore ({OPERATIONAL_EVENT_ACTIVATOR_LABEL})
          inviano allarme dal campo. Possono restare <strong>più eventi aperti</strong> insieme
          (ogni allarme attivatore apre un nuovo N°). Progressivo reset solo con «Resetta log eventi».
          N° intervento max 20 caratteri alfanumerici, modificabile finché l&apos;evento è aperto.
          Chiusura solo da TOC.
        </p>
        {openOperationalEvents.length === 0 ? (
          <p className={styles.operationalEventsEmpty}>
            Nessun evento operativo aperto. In attesa di allarme da{" "}
            {OPERATIONAL_EVENT_ACTIVATOR_LABEL}.
            {operationalEventsLoadError ? (
              <>
                {" "}
                <strong style={{ color: "#ffb74d" }}>{operationalEventsLoadError}</strong>
              </>
            ) : null}
          </p>
        ) : (
          <ul className={styles.operationalEventsList}>
            {openOperationalEvents.map((event) => (
              <li key={event.id} className={styles.operationalEventRow}>
                <span className={styles.operationalEventNumber}>N° {event.displayNumber}</span>
                <label className={styles.operationalInterventionField}>
                  N° intervento
                  <input
                    className={styles.operationalInterventionInput}
                    value={interventionDrafts[event.id] ?? ""}
                    maxLength={20}
                    onChange={(e) =>
                      setInterventionDrafts((prev) => ({
                        ...prev,
                        [event.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className={`${styles.btn} ${styles.btnSmallInline}`}
                  type="button"
                  disabled={operationalBusy === `intervention-${event.id}`}
                  onClick={() => void saveInterventionRef(event)}
                >
                  Salva
                </button>
                <button
                  className={`${styles.btn} ${styles.btnDanger}`}
                  type="button"
                  disabled={operationalBusy === `close-${event.id}`}
                  onClick={() => void closeOperationalEvent(event)}
                >
                  CHIUDI EVENTO
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.opsGrid}>
        <section className={styles.opsColumn}>
          <h2 className={styles.opsColumnTitle}>Squadre online ({squads.length})</h2>
          <p className={styles.opsColumnHint}>
            Clicca una squadra per evidenziarla negli altri elenchi.
          </p>
          <div className={styles.opsColumnBody}>
            <ul className={styles.squadList}>
              {squads.length === 0 ? (
                <li className={styles.squadRowMuted}>Nessuna squadra online.</li>
              ) : (
                squads.map((s) => {
                  const alarming = mapAlarmingSessionIds.has(s.sessionId);
                  const selected = selectedSessionId === s.sessionId;
                  return (
                    <li
                      key={s.sessionId}
                      className={
                        selected
                          ? `${styles.squadRow} ${styles.squadRowClickable} ${styles.opsRowSelected}`
                          : `${styles.squadRow} ${styles.squadRowClickable}`
                      }
                      onClick={() => handleSquadRowSelect(s)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSquadRowSelect(s);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            void forceLogoutSquad(s);
                          }}
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
        </section>

        <section className={styles.opsColumn}>
          <h2 className={styles.opsColumnTitle}>
            Allarmi volontario ({pendingAlarms.length} aperti)
          </h2>
          <p className={styles.opsColumnHint}>
            Segnalazioni dalla squadra sul campo. Nessuna push verso il TOC.
          </p>
          <div className={styles.opsColumnBody}>
            {pendingAlarms.length === 0 ? (
              <p className={styles.opsEmpty}>Nessun allarme attivo.</p>
            ) : (
              pendingAlarms.map((a) => {
                const eventNumber = resolveAlarmOperationalNumber(
                  a,
                  openOperationalEvents,
                );
                return (
                <div
                  key={a.id}
                  className={
                    selectedSessionId === a.session_id
                      ? `${styles.alarmItem} ${styles.opsRowSelected}`
                      : styles.alarmItem
                  }
                  onClick={() => {
                    setSelectedSessionId(a.session_id);
                    const squad = squads.find((s) => s.sessionId === a.session_id);
                    if (squad) {
                      handleSquadRowSelect(squad);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.alarmDot} aria-hidden>
                    !
                  </div>
                  <div className={styles.alarmBody}>
                    <p className={styles.alarmTitle}>
                      {a.squad_code} — {a.squad_name}
                      {eventNumber != null ? (
                        <span className={styles.alarmEventBadge}>
                          {" "}
                          · Ev. {eventNumber}
                        </span>
                      ) : null}
                    </p>
                    <p className={styles.alarmMessage}>
                      <SquadAlarmRequestDetail row={a} />
                    </p>
                    <p className={styles.alarmMeta}>
                      {new Date(a.created_at).toLocaleString("it-IT")}
                    </p>
                    <button
                      className={styles.btnSmall}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void acknowledgeAlarm(a);
                      }}
                    >
                      Fine evento
                    </button>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </section>

        <section className={styles.opsColumn}>
          <h2 className={styles.opsColumnTitle}>
            Missioni TOC attive ({activeMissionCount})
          </h2>
          <p className={styles.opsColumnHint}>
            Via TRK + target, push allarme inviata dal TOC, oppure inoltro automatico
            verso squadre GT (FIG/Sanitari). Sparisce con «Reset notifica» sull&apos;app
            oppure con <strong>Reset forzato TOC</strong> qui sotto.
          </p>
          <div className={styles.opsColumnBody}>
            {activeMissionCount === 0 ? (
              <p className={styles.opsEmpty}>
                Nessuna missione attiva, push TOC in attesa, né inoltro GT.
              </p>
            ) : (
              <>
                {activeTocMissions.map(({ assignment, squad }) => (
                  <div
                    key={assignment.id}
                    className={
                      selectedSessionId === squad.sessionId
                        ? `${styles.missionItem} ${styles.opsRowSelected}`
                        : styles.missionItem
                    }
                    onClick={() => handleSquadRowSelect(squad)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className={styles.missionDot} aria-hidden>
                      →
                    </div>
                    <div className={styles.alarmBody}>
                      <p className={styles.alarmTitle}>
                        {squad.squadCode} — {squad.squadName}
                        {" · "}
                        <span className={styles.missionEventRef}>
                          Ev. {formatMissionOperationalEventLabel(assignment.operationalEventNumber)}
                        </span>
                      </p>
                      <p className={styles.alarmMessage}>
                        Via <strong>{assignment.routeCode}</strong>
                        {assignment.targetLabel ? (
                          <>
                            {" "}
                            → target <strong>{assignment.targetLabel}</strong>
                          </>
                        ) : null}
                      </p>
                      <p className={styles.alarmMeta}>
                        Assegnata {new Date(assignment.assignedAt).toLocaleString("it-IT")}
                      </p>
                      <button
                        className={styles.btnSmall}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSessionId(squad.sessionId);
                          setSelectedRouteAssignment(assignment);
                          void endTocMission(assignment, squad);
                        }}
                      >
                        Fine evento
                      </button>
                    </div>
                  </div>
                ))}
                {activeTocPushes.map((row) => {
                  const recipientSquad =
                    (row.sessionId
                      ? squads.find((s) => s.sessionId === row.sessionId)
                      : null) ??
                    squads.find(
                      (s) =>
                        s.squadCode.trim().toUpperCase() ===
                        row.squadCode.trim().toUpperCase(),
                    );
                  const selected =
                    row.sessionId != null && selectedSessionId === row.sessionId;
                  return (
                    <div
                      key={row.id}
                      className={
                        selected
                          ? `${styles.tocPushMissionItem} ${styles.opsRowSelected}`
                          : styles.tocPushMissionItem
                      }
                      onClick={() => {
                        if (recipientSquad) {
                          handleSquadRowSelect(recipientSquad);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.tocPushMissionDot} aria-hidden>
                        TOC
                      </div>
                      <div className={styles.alarmBody}>
                        <p className={styles.alarmTitle}>
                          {row.squadCode} — {row.squadName}
                          {" · "}
                          <span className={styles.missionEventRef}>
                            Ev. {formatMissionOperationalEventLabel(row.operationalEventNumber)}
                          </span>
                        </p>
                        <p className={styles.alarmMessage}>
                          Push da <strong>{row.adminCode}</strong>
                          {" · "}
                          {formatTocPushMissionDetail(row)}
                        </p>
                        <p className={styles.alarmMeta}>
                          Inviato {new Date(row.createdAt).toLocaleString("it-IT")}
                          {!recipientSquad ? " · destinatario non online" : ""}
                        </p>
                        <p className={styles.autoNotifyHint}>
                          In attesa presa in carico (reset sul telefono destinatario)
                        </p>
                        <button
                          className={styles.btnSmall}
                          type="button"
                          disabled={missionResetBusy === `toc-push-${row.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void forceMissionReset(`toc-push-${row.id}`, row.squadCode, {
                              kind: "toc_push",
                              id: row.id,
                            });
                          }}
                        >
                          Reset forzato TOC
                        </button>
                      </div>
                    </div>
                  );
                })}
                {activeAutoNotifies.map((row) => {
                  const recipientSquad =
                    squads.find((s) => s.sessionId === row.recipientSessionId) ??
                    squads.find(
                      (s) =>
                        s.squadCode.trim().toUpperCase() ===
                        row.recipientSquadCode.trim().toUpperCase(),
                    );
                  const selected =
                    row.recipientSessionId != null &&
                    selectedSessionId === row.recipientSessionId;
                  return (
                    <div
                      key={autoNotifyMissionKey(row)}
                      className={
                        selected
                          ? `${styles.autoNotifyMissionItem} ${styles.opsRowSelected}`
                          : styles.autoNotifyMissionItem
                      }
                      onClick={() => {
                        if (recipientSquad) {
                          handleSquadRowSelect(recipientSquad);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className={styles.autoNotifyMissionDot} aria-hidden>
                        GT
                      </div>
                      <div className={styles.alarmBody}>
                        <p className={styles.alarmTitle}>
                          {row.recipientSquadCode}
                          {recipientSquad ? ` — ${recipientSquad.squadName}` : ""}
                        </p>
                        <p className={styles.alarmMessage}>
                          Allarme da <strong>{row.sourceSquadCode}</strong>
                          {" · "}
                          {formatAutoNotifyMissionDetail(row)}
                        </p>
                        <p className={styles.alarmMeta}>
                          Inviato {new Date(row.createdAt).toLocaleString("it-IT")}
                          {!recipientSquad ? " · destinatario non online" : ""}
                        </p>
                        <p className={styles.autoNotifyHint}>
                          In attesa presa in carico (reset sul telefono destinatario)
                        </p>
                        <button
                          className={styles.btnSmall}
                          type="button"
                          disabled={
                            missionResetBusy === `gt-${autoNotifyMissionKey(row)}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            void forceMissionReset(
                              `gt-${autoNotifyMissionKey(row)}`,
                              row.recipientSquadCode,
                              {
                                kind: "gt_notify",
                                id: row.id,
                                alarmId: row.alarmId,
                                recipientSquadCode: row.recipientSquadCode,
                                recipientSessionId: row.recipientSessionId,
                              },
                            );
                          }}
                        >
                          Reset forzato TOC
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </section>
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
          <div
            className={styles.modal}
            style={{
              left: `calc(50% + ${pushModalDrag.x}px)`,
              top: `calc(50% + ${pushModalDrag.y}px)`,
            }}
          >
            <h2
              className={styles.modalDragHandle}
              onPointerDown={onPushModalDragStart}
              onPointerMove={onPushModalDragMove}
              onPointerUp={onPushModalDragEnd}
              onPointerCancel={onPushModalDragEnd}
            >
              Invia MISSIONI a squadre (push)
            </h2>
            <p className={styles.pushHint}>
              Trascina dal titolo per spostare la finestra. Notifica con suono allarme sul
              cellulare (canale dedicato Android).
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
                      squadra/e online senza token push
                      {pushHealth.onlineSquadsMissingPush?.length
                        ? ` (${pushHealth.onlineSquadsMissingPush.join(", ")})`
                        : ""}
                      : sul telefono apri l&apos;app, consenti notifiche se richieste,
                      logout/login (o riapri l&apos;app dopo l&apos;ultimo APK).
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
                onChange={(e) => {
                  const all = e.target.checked;
                  setPushTargetAll(all);
                  if (!all) {
                    const preselect =
                      (selectedSessionId &&
                      squads.some((s) => s.sessionId === selectedSessionId)
                        ? selectedSessionId
                        : null) ?? squads[0]?.sessionId;
                    setPushSelected(preselect ? { [preselect]: true } : {});
                  }
                }}
              />{" "}
              Tutte le squadre online
            </label>
            {!pushTargetAll
              ? squads.map((s) => {
                  const missingPush = (pushHealth?.onlineSquadsMissingPush ?? []).some(
                    (code) => code.toUpperCase() === s.squadCode.toUpperCase(),
                  );
                  return (
                    <label key={s.sessionId} className={styles.squadCheck}>
                      <input
                        type="radio"
                        name="pushSquadTarget"
                        checked={Boolean(pushSelected[s.sessionId])}
                        onChange={() => setPushSelected({ [s.sessionId]: true })}
                      />{" "}
                      {s.squadCode} — {s.squadName}
                      {missingPush ? (
                        <strong style={{ color: "#ff5252" }}> (senza push)</strong>
                      ) : null}
                    </label>
                  );
                })
              : null}
            {pushSingleTarget ? (
              <>
                <p className={styles.pushHint}>
                  Destinatario: <strong>{pushSingleTarget.squadCode}</strong> — scegli il{" "}
                  <strong>target</strong> (waypoint) da indicare nella notifica.
                </p>
                {waypoints.length > 0 ? (
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
                ) : (
                  <p className={styles.pushHint} style={{ color: "#ffb74d" }}>
                    Nessun waypoint caricato: apri la pagina Waypoint o verifica l&apos;evento
                    attivo.
                  </p>
                )}
              </>
            ) : pushTargetAll ? (
              <p className={styles.pushHint}>
                Push verso tutte le squadre online ({squads.length}). Il target waypoint non si
                applica in invio multiplo.
              </p>
            ) : null}
            <label className={styles.pushField}>
              Evento operativo (missione)
              <select
                className={styles.pushInput}
                value={pushOperationalEventId}
                onChange={(e) => setPushOperationalEventId(e.target.value)}
              >
                <option value="">Nessuno</option>
                {openOperationalEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    Evento {event.displayNumber}
                    {event.interventionRef ? ` · ${event.interventionRef}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {openOperationalEvents.length === 0 ? (
              <p className={styles.pushHint} style={{ color: "#ffb74d" }}>
                Nessun evento operativo aperto. Si apre automaticamente con l&apos;allarme
                dalle squadre attivatore ({OPERATIONAL_EVENT_ACTIVATOR_LABEL}). Per push generica
                usa <strong>Nessuno</strong>.
              </p>
            ) : null}
            {operationalEventsLoadError ? (
              <p className={styles.pushAlert} role="alert">
                {operationalEventsLoadError}
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
                {pushSending ? "Invio in corso…" : "Invia missione (push)"}
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
