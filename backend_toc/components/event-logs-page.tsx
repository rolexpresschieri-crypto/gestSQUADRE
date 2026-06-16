"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  eventLogsToCsv,
  mergeEventLogs,
  printEventLogsAsPdf,
  type SquadAlarmLogRow,
  type SquadMobileDismissLogRow,
  type SquadSessionAuthLogRow,
  type TocMissionCloseLogRow,
  type TocPushLogRow,
} from "@/lib/event-logs";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./event-logs-page.module.css";

export default function EventLogsPage() {
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [alarms, setAlarms] = useState<SquadAlarmLogRow[]>([]);
  const [pushes, setPushes] = useState<TocPushLogRow[]>([]);
  const [missionCloses, setMissionCloses] = useState<TocMissionCloseLogRow[]>([]);
  const [mobileDismisses, setMobileDismisses] = useState<SquadMobileDismissLogRow[]>([]);
  const [sessionAuthLogs, setSessionAuthLogs] = useState<SquadSessionAuthLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  const isAdmin = session ? canManageEventLogs(session.role) : false;

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
    if (!supabase || !eventId) {
      setAlarms([]);
      setPushes([]);
      setMissionCloses([]);
      setMobileDismisses([]);
      setSessionAuthLogs([]);
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
        return;
      }
    }

    let alarmQuery = supabase
      .from("squad_alarms")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(500);
    let pushQuery = supabase
      .from("toc_push_logs")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(500);
    let missionCloseQuery = supabase
      .from("toc_mission_close_logs")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(500);
    let mobileDismissQuery = supabase
      .from("squad_mobile_dismiss_logs")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(500);
    let sessionAuthQuery = supabase
      .from("squad_session_auth_logs")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (squadIds) {
      alarmQuery = alarmQuery.in("squad_id", squadIds);
      pushQuery = pushQuery.in("squad_id", squadIds);
      missionCloseQuery = missionCloseQuery.in("squad_id", squadIds);
      mobileDismissQuery = mobileDismissQuery.in("squad_id", squadIds);
      sessionAuthQuery = sessionAuthQuery.in("squad_id", squadIds);
    }

    const [alarmRes, pushRes, missionCloseRes, mobileDismissRes, sessionAuthRes] =
      await Promise.all([
      alarmQuery,
      pushQuery,
      missionCloseQuery,
      mobileDismissQuery,
      sessionAuthQuery,
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
  }, [supabase, eventId, session?.golfCourseId]);

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
        setStatus("Nessun evento attivo.");
        setLoading(false);
        return;
      }

      setEventId(ev.id as string);
      setEventTitle((ev.title as string) ?? "Evento");
      setLoading(false);
    })();
  }, [authChecked, session, supabase]);

  useEffect(() => {
    if (!eventId) {
      return;
    }
    void refreshLogs();
  }, [eventId, refreshLogs]);

  const unified = useMemo(
    () => mergeEventLogs(alarms, pushes, missionCloses, mobileDismisses, sessionAuthLogs),
    [alarms, pushes, missionCloses, mobileDismisses, sessionAuthLogs],
  );

  function exportCsv() {
    const csv = eventLogsToCsv(unified, eventTitle);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`gestSQUADRE-log-${stamp}.csv`, csv, "text/csv;charset=utf-8");
  }

  function exportPdf() {
    if (unified.length === 0) {
      setStatus("Nessun log da esportare.");
      return;
    }
    const ok = printEventLogsAsPdf(unified, eventTitle);
    if (!ok) {
      setStatus("Impossibile avviare la stampa PDF. Riprova con un altro browser.");
      return;
    }
    setStatus(
      "Finestra di stampa aperta: scegli «Salva come PDF» o «Microsoft Print to PDF».",
    );
  }

  async function clearEventLogs() {
    if (!session || !eventId || !isAdmin) {
      return;
    }
    if (
      !window.confirm(
        `Cancellare TUTTI i log dell'evento "${eventTitle}"?\n` +
          "Verranno eliminati allarmi squadra e push TOC. Operazione irreversibile.",
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
        body: JSON.stringify({ session, eventId }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? res.statusText);
      }
      await refreshLogs();
      setStatus("Log evento cancellati.");
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
          Log evento
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
          Evento: <strong>{eventTitle || "—"}</strong> · Login/logout squadra · Allarmi · Missioni · Push
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
              disabled={loading || clearBusy || !eventId}
            >
              {clearBusy ? "Cancellazione…" : "Cancella log evento"}
            </button>
          ) : null}
          <button type="button" className={styles.btnGhost} onClick={() => void refreshLogs()}>
            Aggiorna
          </button>
        </div>

        {loading ? (
          <p>Caricamento log…</p>
        ) : unified.length === 0 ? (
          <p>Nessun log registrato per questo evento.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data/ora</th>
                  <th>Tipo</th>
                  <th>Squadra</th>
                  <th>Dettaglio messaggio</th>
                  <th>Stato</th>
                  <th>Operatore</th>
                </tr>
              </thead>
              <tbody>
                {unified.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>{new Date(r.createdAt).toLocaleString("it-IT")}</td>
                    <td>{r.summary}</td>
                    <td>
                      {r.squadCode}
                      {r.squadName !== "—" ? ` — ${r.squadName}` : ""}
                    </td>
                    <td>{r.detail}</td>
                    <td>{r.status}</td>
                    <td>{r.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
