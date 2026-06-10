"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canManageEventLogs,
  canViewEventLogs,
  normalizeAdminRole,
  type AdminSessionData,
} from "@/lib/admin-auth";
import {
  downloadTextFile,
  eventLogsToCsv,
  mergeEventLogs,
  type SquadAlarmLogRow,
  type TocPushLogRow,
  type UnifiedEventLog,
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
      try {
        const parsed = JSON.parse(raw) as AdminSessionData;
        setSession({
          code: parsed.code,
          name: parsed.name,
          role: normalizeAdminRole(parsed.role),
          adminId: parsed.adminId,
        });
      } catch {
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

    const [alarmRes, pushRes] = await Promise.all([
      supabase
        .from("squad_alarms")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("toc_push_logs")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(500),
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
  }, [supabase, eventId]);

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
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      setStatus("Consenti i popup per esportare il PDF.");
      return;
    }

    const rows = unified
      .map(
        (r) =>
          `<tr>
            <td>${new Date(r.createdAt).toLocaleString("it-IT")}</td>
            <td>${r.summary}</td>
            <td>${r.squadCode}</td>
            <td>${r.squadName}</td>
            <td>${r.detail}</td>
            <td>${r.status}</td>
            <td>${r.actor}</td>
          </tr>`,
      )
      .join("");

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Log evento gestSQUADRE</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        h1{font-size:18px} table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}
        th{background:#eee}
      </style></head><body>
      <h1>Log evento: ${eventTitle}</h1>
      <p>Esportato: ${new Date().toLocaleString("it-IT")}</p>
      <table><thead><tr>
        <th>Data/ora</th><th>Tipo</th><th>Squadra</th><th>Nome</th>
        <th>Dettaglio</th><th>Stato</th><th>Operatore</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
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
          Evento: <strong>{eventTitle || "—"}</strong> · Allarmi squadra → TOC + push TOC →
          squadre
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
                  <th>Dettaglio</th>
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
