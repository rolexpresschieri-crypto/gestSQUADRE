"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canManageEventLogs,
  canViewEventLogs,
  isCampoGolfSession,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { fetchGolfCourseSquadIds } from "@/lib/golf-course-scope";
import {
  downloadTextFile,
  EVENT_LOG_ALARM_FILTER_OPTIONS,
  eventLogAlarmFilterLabel,
  eventLogsToCsv,
  filterUnifiedEventLogsByAlarmTypes,
  mergeEventLogs,
  printEventLogsAsPdf,
  sortUnifiedEventLogs,
  sortUnifiedEventLogsByColumn,
  type AlarmAutoNotifyLogRow,
  type EventLogAlarmFilterCode,
  type EventLogSortColumn,
  type OperationalEventLogMeta,
  type OperationalEventLogSourceRow,
  type SquadAlarmLogRow,
  type SquadFieldPhotoLogRow,
  type SquadMobileDismissLogRow,
  type SquadSessionAuthLogRow,
  type TocMissionCloseLogRow,
  type TocMissionForceDismissLogRow,
  type TocPushLogRow,
} from "@/lib/event-logs";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./event-logs-page.module.css";

export default function EventLogsPage() {
  const searchParams = useSearchParams();
  const highlightPhotoId = searchParams.get("photoId")?.trim() ?? "";
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [operationalEventMetaById, setOperationalEventMetaById] = useState<
    Map<string, OperationalEventLogMeta>
  >(new Map());
  const [operationalEventRows, setOperationalEventRows] = useState<
    OperationalEventLogSourceRow[]
  >([]);
  const [alarms, setAlarms] = useState<SquadAlarmLogRow[]>([]);
  const [pushes, setPushes] = useState<TocPushLogRow[]>([]);
  const [missionCloses, setMissionCloses] = useState<TocMissionCloseLogRow[]>([]);
  const [mobileDismisses, setMobileDismisses] = useState<SquadMobileDismissLogRow[]>([]);
  const [sessionAuthLogs, setSessionAuthLogs] = useState<SquadSessionAuthLogRow[]>([]);
  const [autoNotifies, setAutoNotifies] = useState<AlarmAutoNotifyLogRow[]>([]);
  const [forceDismisses, setForceDismisses] = useState<TocMissionForceDismissLogRow[]>([]);
  const [fieldPhotos, setFieldPhotos] = useState<SquadFieldPhotoLogRow[]>([]);
  const [photoDownloadBusy, setPhotoDownloadBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [exportAllLogs, setExportAllLogs] = useState(true);
  const [exportAlarmTypes, setExportAlarmTypes] = useState<
    Record<EventLogAlarmFilterCode, boolean>
  >({
    sanitario: false,
    security: false,
    vvf: false,
    strutture: false,
  });
  const [sortColumn, setSortColumn] = useState<EventLogSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const isAdmin = session ? canManageEventLogs(session.role) : false;

  const selectedAlarmFilterCodes = useMemo((): EventLogAlarmFilterCode[] | null => {
    if (exportAllLogs) {
      return null;
    }
    return EVENT_LOG_ALARM_FILTER_OPTIONS.filter((o) => exportAlarmTypes[o.code]).map(
      (o) => o.code,
    );
  }, [exportAllLogs, exportAlarmTypes]);

  const filterLabel = useMemo(
    () => eventLogAlarmFilterLabel(selectedAlarmFilterCodes),
    [selectedAlarmFilterCodes],
  );

  const photoHighlightDoneRef = useRef(false);

  useEffect(() => {
    photoHighlightDoneRef.current = false;
    if (highlightPhotoId) {
      setExportAllLogs(true);
    }
  }, [highlightPhotoId]);

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
    setAuthChecked(true);
  }, []);

  const refreshLogs = useCallback(async () => {
    if (!supabase) {
      setAlarms([]);
      setPushes([]);
      setMissionCloses([]);
      setMobileDismisses([]);
      setSessionAuthLogs([]);
      setAutoNotifies([]);
      setForceDismisses([]);
      setFieldPhotos([]);
      return;
    }

    const golfCourseId = session?.golfCourseId ?? null;
    let squadIds: string[] | null = null;
    if (golfCourseId) {
      squadIds = await fetchGolfCourseSquadIds(supabase, golfCourseId);
      if (squadIds.length === 0) {
        setAlarms([]);
        setPushes([]);
        setMissionCloses([]);
        setMobileDismisses([]);
        setSessionAuthLogs([]);
        setAutoNotifies([]);
        setForceDismisses([]);
        setFieldPhotos([]);
        setOperationalEventMetaById(new Map());
        setOperationalEventRows([]);
        return;
      }
    }

    let squadCodes: string[] | null = null;
    if (squadIds) {
      const { data: squadRows } = await supabase
        .from("squads")
        .select("squad_code")
        .in("id", squadIds);
      squadCodes =
        squadRows?.map((r) => String(r.squad_code).trim().toUpperCase()).filter(Boolean) ??
        [];
      if (squadCodes.length === 0) {
        setAlarms([]);
        setPushes([]);
        setMissionCloses([]);
        setMobileDismisses([]);
        setSessionAuthLogs([]);
        setAutoNotifies([]);
        setForceDismisses([]);
        setFieldPhotos([]);
        setOperationalEventMetaById(new Map());
        setOperationalEventRows([]);
        return;
      }
    }

    let opEventsQuery = supabase
      .from("operational_events")
      .select(
        "id, display_number, intervention_ref, status, opened_at, closed_at, opened_by_admin_code, closed_by_admin_code",
      )
      .order("display_number", { ascending: true });
    if (golfCourseId) {
      opEventsQuery = opEventsQuery.eq("golf_course_id", golfCourseId);
    }
    const { data: opEventRows } = await opEventsQuery;
    const metaById = new Map<string, OperationalEventLogMeta>();
    const opRows: OperationalEventLogSourceRow[] = [];
    for (const row of opEventRows ?? []) {
      const id = String(row.id);
      metaById.set(id, {
        displayNumber: Number(row.display_number),
        interventionRef: (row.intervention_ref as string | null)?.trim() || null,
      });
      opRows.push({
        id,
        display_number: Number(row.display_number),
        intervention_ref: (row.intervention_ref as string | null)?.trim() || null,
        status: String(row.status ?? "aperto"),
        opened_at: String(row.opened_at),
        closed_at: (row.closed_at as string | null) ?? null,
        opened_by_admin_code: String(row.opened_by_admin_code ?? "—"),
        closed_by_admin_code: (row.closed_by_admin_code as string | null) ?? null,
      });
    }
    setOperationalEventMetaById(metaById);
    setOperationalEventRows(opRows);

    let alarmQuery = supabase
      .from("squad_alarms")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let pushQuery = supabase
      .from("toc_push_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let missionCloseQuery = supabase
      .from("toc_mission_close_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let mobileDismissQuery = supabase
      .from("squad_mobile_dismiss_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let sessionAuthQuery = supabase
      .from("squad_session_auth_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let autoNotifyQuery = supabase
      .from("alarm_auto_notify_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let forceDismissQuery = supabase
      .from("toc_mission_force_dismiss_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    let fieldPhotoQuery = supabase
      .from("squad_field_photo_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (squadCodes) {
      alarmQuery = alarmQuery.in("squad_id", squadIds!);
      pushQuery = pushQuery.in("squad_id", squadIds!);
      missionCloseQuery = missionCloseQuery.in("squad_id", squadIds!);
      mobileDismissQuery = mobileDismissQuery.in("squad_id", squadIds!);
      sessionAuthQuery = sessionAuthQuery.in("squad_id", squadIds!);
      autoNotifyQuery = autoNotifyQuery.in("squad_code", squadCodes);
      forceDismissQuery = forceDismissQuery.in("squad_code", squadCodes);
      fieldPhotoQuery = fieldPhotoQuery.in("squad_code", squadCodes);
    }

    const [
      alarmRes,
      pushRes,
      missionCloseRes,
      mobileDismissRes,
      sessionAuthRes,
      autoNotifyRes,
      forceDismissRes,
      fieldPhotoRes,
    ] = await Promise.all([
      alarmQuery,
      pushQuery,
      missionCloseQuery,
      mobileDismissQuery,
      sessionAuthQuery,
      autoNotifyQuery,
      forceDismissQuery,
      fieldPhotoQuery,
    ]);

    if (alarmRes.error) {
      setStatus(`Errore allarmi: ${alarmRes.error.message}`);
    } else {
      setAlarms((alarmRes.data ?? []) as SquadAlarmLogRow[]);
    }

    if (pushRes.error) {
      setStatus(
        pushRes.error.message.includes("toc_push_logs")
          ? "Esegui sql/event_logs_and_campo.sql su Supabase per abilitare i log push."
          : `Errore push: ${pushRes.error.message}`,
      );
      setPushes([]);
    } else {
      setPushes((pushRes.data ?? []) as TocPushLogRow[]);
    }

    if (missionCloseRes.error) {
      if (missionCloseRes.error.message.includes("toc_mission_close_logs")) {
        setStatus(
          "Esegui sql/toc_mission_logs.sql su Supabase per i log «Fine evento missione».",
        );
      }
      setMissionCloses([]);
    } else {
      setMissionCloses((missionCloseRes.data ?? []) as TocMissionCloseLogRow[]);
    }

    if (mobileDismissRes.error) {
      if (mobileDismissRes.error.message.includes("squad_mobile_dismiss_logs")) {
        setStatus("Esegui sql/squad_event_flow.sql su Supabase per i log reset mobile.");
      }
      setMobileDismisses([]);
    } else {
      setMobileDismisses((mobileDismissRes.data ?? []) as SquadMobileDismissLogRow[]);
    }

    if (sessionAuthRes.error) {
      if (sessionAuthRes.error.message.includes("squad_session_auth_logs")) {
        setStatus(
          "Esegui sql/squad_session_auth_logs.sql su Supabase per i log login/logout.",
        );
      }
      setSessionAuthLogs([]);
    } else {
      setSessionAuthLogs((sessionAuthRes.data ?? []) as SquadSessionAuthLogRow[]);
    }

    if (autoNotifyRes.error) {
      if (autoNotifyRes.error.message.includes("alarm_auto_notify_logs")) {
        setStatus("Esegui sql/alarm_auto_notify.sql su Supabase per i log inoltro automatico.");
      }
      setAutoNotifies([]);
    } else {
      setAutoNotifies((autoNotifyRes.data ?? []) as AlarmAutoNotifyLogRow[]);
    }

    if (forceDismissRes.error) {
      if (forceDismissRes.error.message.includes("toc_mission_force_dismiss_logs")) {
        setStatus(
          "Esegui sql/toc_mission_force_dismiss_logs.sql su Supabase per i log reset forzato TOC.",
        );
      }
      setForceDismisses([]);
    } else {
      setForceDismisses((forceDismissRes.data ?? []) as TocMissionForceDismissLogRow[]);
    }

    if (fieldPhotoRes.error) {
      if (fieldPhotoRes.error.message.includes("squad_field_photo_logs")) {
        setStatus("Esegui sql/squad_field_photos.sql su Supabase per i log invio foto.");
      }
      setFieldPhotos([]);
    } else {
      setFieldPhotos((fieldPhotoRes.data ?? []) as SquadFieldPhotoLogRow[]);
    }
  }, [supabase, session?.golfCourseId]);

  useEffect(() => {
    if (!authChecked || !session || !supabase) {
      setLoading(false);
      return;
    }

    void (async () => {
      setLoading(true);
      const { data: ev, error } = await supabase
        .from("events")
        .select("id, title")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (error || !ev) {
        setEventTitle("—");
        setEventId(null);
      } else {
        setEventId(ev.id as string);
        setEventTitle((ev.title as string) ?? "Evento");
      }
      setLoading(false);
    })();
  }, [authChecked, session, supabase]);

  useEffect(() => {
    if (!authChecked || !session || !supabase) {
      return;
    }
    void refreshLogs();
  }, [authChecked, session, supabase, refreshLogs]);

  const unified = useMemo(
    () =>
      mergeEventLogs(
        alarms,
        pushes,
        missionCloses,
        mobileDismisses,
        sessionAuthLogs,
        autoNotifies,
        forceDismisses,
        fieldPhotos,
        operationalEventMetaById,
        operationalEventRows,
      ),
    [
      alarms,
      pushes,
      missionCloses,
      mobileDismisses,
      sessionAuthLogs,
      autoNotifies,
      forceDismisses,
      fieldPhotos,
      operationalEventMetaById,
      operationalEventRows,
    ],
  );

  const filteredUnified = useMemo(
    () => filterUnifiedEventLogsByAlarmTypes(unified, selectedAlarmFilterCodes),
    [unified, selectedAlarmFilterCodes],
  );

  const displayedUnified = useMemo(() => {
    if (!sortColumn) {
      return sortUnifiedEventLogs(filteredUnified);
    }
    return sortUnifiedEventLogsByColumn(filteredUnified, sortColumn, sortDirection);
  }, [filteredUnified, sortColumn, sortDirection]);

  function toggleSortColumn(column: EventLogSortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(column);
    setSortDirection("asc");
  }

  function resetSortOrder() {
    setSortColumn(null);
    setSortDirection("asc");
  }

  function renderSortIndicator(column: EventLogSortColumn) {
    if (sortColumn !== column) {
      return <span className={styles.sortIndicator}>↕</span>;
    }
    return (
      <span className={styles.sortIndicator} aria-hidden>
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  }

  useEffect(() => {
    if (!highlightPhotoId || loading || photoHighlightDoneRef.current) {
      return;
    }
    const row = document.getElementById(`log-row-squad_field_photo-${highlightPhotoId}`);
    if (!row) {
      return;
    }
    photoHighlightDoneRef.current = true;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightPhotoId, loading, displayedUnified]);

  function toggleExportAll(checked: boolean) {
    setExportAllLogs(checked);
    if (checked) {
      setExportAlarmTypes({
        sanitario: false,
        security: false,
        vvf: false,
        strutture: false,
      });
    }
  }

  function toggleExportAlarmType(code: EventLogAlarmFilterCode, checked: boolean) {
    setExportAllLogs(false);
    setExportAlarmTypes((prev) => ({ ...prev, [code]: checked }));
  }

  async function downloadFieldPhoto(photoId: string) {
    if (!session) {
      return;
    }
    setPhotoDownloadBusy(photoId);
    setStatus(null);
    try {
      const res = await fetch("/api/squad-field-photo/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, photoId }),
      });
      if (!res.ok) {
        let message = res.statusText;
        try {
          const payload = (await res.json()) as { error?: string };
          if (payload.error) {
            message = payload.error;
          }
        } catch {
          // body non JSON
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] ?? `gestSQUADRE_foto_${photoId.slice(0, 8)}.jpg`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Download foto fallito.");
    } finally {
      setPhotoDownloadBusy(null);
    }
  }

  function exportCsv() {
    if (!exportAllLogs && selectedAlarmFilterCodes?.length === 0) {
      setStatus("Seleziona almeno una tipologia allarme oppure «Tutti i log».");
      return;
    }
    const csv = eventLogsToCsv(
      displayedUnified,
      eventTitle,
      exportAllLogs ? undefined : filterLabel,
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const suffix = exportAllLogs ? "" : "-filtrato";
    downloadTextFile(`gestSQUADRE-log-${stamp}${suffix}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportPdf() {
    if (!exportAllLogs && selectedAlarmFilterCodes?.length === 0) {
      setStatus("Seleziona almeno una tipologia allarme oppure «Tutti i log».");
      return;
    }
    if (displayedUnified.length === 0) {
      setStatus("Nessun log da esportare con il filtro selezionato.");
      return;
    }
    const ok = printEventLogsAsPdf(
      displayedUnified,
      eventTitle,
      exportAllLogs ? undefined : filterLabel,
    );
    if (!ok) {
      setStatus("Impossibile avviare la stampa PDF. Riprova con un altro browser.");
      return;
    }
    setStatus(
      "Finestra di stampa aperta: scegli «Salva come PDF» o «Microsoft Print to PDF».",
    );
  }

  async function clearEventLogs() {
    if (!session || !isAdmin) {
      return;
    }
    if (
      !window.confirm(
        "Resettare TUTTI i log eventi e azzerare il progressivo N° evento operativo?\n" +
          "Verranno eliminati allarmi, push, missioni, login/logout e foto campo. Operazione irreversibile.",
      )
    ) {
      return;
    }

    setClearBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/event-logs/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, eventId: eventId ?? undefined }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? res.statusText);
      }
      await refreshLogs();
      setStatus("Log eventi resettati. Prossimo N° evento operativo: 1.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Errore cancellazione log.");
    } finally {
      setClearBusy(false);
    }
  }

  if (!authChecked) {
    return <div className={styles.root}>Caricamento…</div>;
  }

  if (!session || !canViewEventLogs(session.role)) {
    return (
      <div className={styles.root}>
        <div className={styles.panel}>
          <p>Accesso riservato agli operatori TOC.</p>
          <Link href="/">← Torna al login TOC</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <h1>
          Log eventi
          {session && isCampoGolfSession(session) && session.golfCourseCode ? (
            <span className={styles.campoTag}> · {session.golfCourseCode}</span>
          ) : null}
        </h1>
        <Link className={styles.backLink} href="/">
          ← Dashboard TOC
        </Link>
      </header>

      <div className={styles.panel}>
        <p className={styles.hint}>
          Giornata attiva: <strong>{eventTitle || "—"}</strong> · Log unificati (tutta la storia) ·
          ordine predefinito: <strong>N° evento</strong> (crescente, righe senza numero in fondo)
          poi <strong>data/ora</strong> (crescente). Clicca le intestazioni per ordinare manualmente.
          {session && isCampoGolfSession(session) ? (
            <>
              {" "}
              · Filtro campo: solo squadre del campo{" "}
              <strong>{session.golfCourseName ?? session.golfCourseCode ?? "golf"}</strong>
            </>
          ) : null}
        </p>
        <p className={styles.hintMuted}>
          Il GPS periodico non è nel log (solo posizione live sulla mappa). Se mancano login/logout,
          esegui <code>sql/squad_session_auth_logs.sql</code> su Supabase.
        </p>
        {status ? <p className={styles.status}>{status}</p> : null}

        <div className={styles.filterBox}>
          <p className={styles.filterTitle}>Esportazione log (CSV / PDF)</p>
          <label className={styles.filterAll}>
            <input
              type="checkbox"
              checked={exportAllLogs}
              onChange={(e) => toggleExportAll(e.target.checked)}
            />
            Tutti i log eventi (login, push, missioni, allarmi…)
          </label>
          <p className={styles.filterHint}>Oppure solo righe legate a tipologia allarme:</p>
          <div className={styles.filterGrid} role="group" aria-label="Tipologia allarme">
            {EVENT_LOG_ALARM_FILTER_OPTIONS.map((opt) => (
              <label key={opt.code} className={styles.filterOption}>
                <input
                  type="checkbox"
                  checked={!exportAllLogs && exportAlarmTypes[opt.code]}
                  disabled={exportAllLogs}
                  onChange={(e) => toggleExportAlarmType(opt.code, e.target.checked)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {!exportAllLogs ? (
            <p className={styles.filterActive}>
              Filtro attivo: <strong>{filterLabel}</strong> · {filteredUnified.length} righe
            </p>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btnPrimary} onClick={exportCsv} disabled={loading}>
            Esporta CSV
          </button>
          <button type="button" className={styles.btnYellow} onClick={exportPdf} disabled={loading}>
            Esporta PDF (stampa)
          </button>
          {isAdmin ? (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => void clearEventLogs()}
              disabled={loading || clearBusy}
            >
              {clearBusy ? "Reset in corso…" : "Resetta log eventi"}
            </button>
          ) : null}
          <button type="button" className={styles.btnGhost} onClick={() => void refreshLogs()}>
            Aggiorna
          </button>
        </div>

        {loading ? (
          <p>Caricamento log…</p>
        ) : filteredUnified.length === 0 ? (
          <p>
            {unified.length === 0
              ? "Nessun log registrato."
              : "Nessun log corrisponde al filtro tipologia selezionato."}
          </p>
        ) : (
          <>
            <div className={styles.tableToolbar}>
              <p className={styles.tableSortHint}>
                {sortColumn
                  ? `Ordinamento manuale: ${sortColumn} (${sortDirection === "asc" ? "crescente" : "decrescente"})`
                  : "Ordinamento predefinito attivo"}
              </p>
              {sortColumn ? (
                <button
                  type="button"
                  className={styles.btnSortReset}
                  onClick={resetSortOrder}
                >
                  Ripristina ordine predefinito
                </button>
              ) : null}
            </div>
            <div className={styles.tableShell}>
            <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "operationalEventNumber" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("operationalEventNumber")}
                  >
                    N° evento{renderSortIndicator("operationalEventNumber")}
                  </th>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "interventionRef" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("interventionRef")}
                  >
                    N° intervento{renderSortIndicator("interventionRef")}
                  </th>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "createdAt" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("createdAt")}
                  >
                    Data/ora{renderSortIndicator("createdAt")}
                  </th>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "summary" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("summary")}
                  >
                    Tipo{renderSortIndicator("summary")}
                  </th>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "squadCode" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("squadCode")}
                  >
                    Squadra{renderSortIndicator("squadCode")}
                  </th>
                  <th>Dettaglio messaggio</th>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "status" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("status")}
                  >
                    Stato{renderSortIndicator("status")}
                  </th>
                  <th
                    className={`${styles.sortableTh} ${sortColumn === "actor" ? styles.sortableThActive : ""}`}
                    onClick={() => toggleSortColumn("actor")}
                  >
                    Operatore{renderSortIndicator("actor")}
                  </th>
                  <th>Foto</th>
                </tr>
              </thead>
              <tbody>
                {displayedUnified.map((r) => (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    id={`log-row-${r.kind}-${r.id}`}
                    className={
                      highlightPhotoId && r.id === highlightPhotoId
                        ? styles.logRowPhotoHighlight
                        : undefined
                    }
                  >
                    <td>{r.operationalEventNumber ?? "—"}</td>
                    <td>{r.interventionRef?.trim() || "—"}</td>
                    <td>{new Date(r.createdAt).toLocaleString("it-IT")}</td>
                    <td>{r.summary}</td>
                    <td>
                      {r.squadCode}
                      {r.squadName !== "—" ? ` — ${r.squadName}` : ""}
                    </td>
                    <td className={styles.detailCell}>{r.detail}</td>
                    <td>{r.status}</td>
                    <td>{r.actor}</td>
                    <td>
                      {r.photoId ? (
                        <button
                          type="button"
                          className={styles.photoDownloadBtn}
                          disabled={photoDownloadBusy === r.photoId}
                          onClick={() => void downloadFieldPhoto(r.photoId!)}
                        >
                          {photoDownloadBusy === r.photoId ? "…" : "Scarica JPEG"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.tableScrollPad} aria-hidden="true" />
          </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
