"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canManageEventLogs,
  canViewEventLogs,
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
      return;
    }

    const golfCourseId = session?.golfCourseId ?? null;
    let squadIds: string[] | null = null;
    if (golfCourseId) {
      squadIds = await fetchGolfCourseSquadIds(supabase, golfCourseId);
      if (squadIds.length === 0) {
        setAlarms([]);
        setPushes([]);
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

    if (squadIds) {
      alarmQuery = alarmQuery.in("squad_id", squadIds);
      pushQuery = pushQuery.in("squad_id", squadIds);
    }

    const [alarmRes, pushRes] = await Promise.all([alarmQuery, pushQuery]);

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
    () => mergeEventLogs(alarms, pushes),
    [alarms, pushes],
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
        <h1>Log evento</h1>
        <Link className={styles.backLink} href="/">
          ← Dashboard TOC
        </Link>
      </header>

      <div className={styles.panel}>
        <p className={styles.hint}>
          Evento: <strong>{eventTitle || "—"}</strong> · Allarmi volontario → TOC · Messaggi e
          allarmi TOC → volontari (titolo e testo completi)
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
