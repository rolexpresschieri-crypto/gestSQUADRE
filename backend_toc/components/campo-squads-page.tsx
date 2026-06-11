"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { restoreAdminSessionFromStorage } from "@/lib/campo-login";
import {
  canManageSquadsForCourse,
  deleteSquadForCourse,
} from "@/lib/golf-course-scope";
import { downloadSquadsPdf, type SquadExportRow } from "@/lib/squad-export";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./campo-squads-page.module.css";

type SquadRow = {
  id: string;
  squad_code: string;
  squad_name: string;
  password_hash: string;
  map_color: string | null;
  is_enabled: boolean;
  created_at: string;
};

const DEFAULT_COLORS = ["#079B42", "#1E88E5", "#E0BE3A", "#C62828", "#6A1B9A"];

export default function CampoSquadsPage() {
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [squadCode, setSquadCode] = useState("");
  const [squadName, setSquadName] = useState("");
  const [squadPassword, setSquadPassword] = useState("");
  const [mapColor, setMapColor] = useState(DEFAULT_COLORS[0]);
  const [isEnabled, setIsEnabled] = useState(true);

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

  const refreshSquads = useCallback(async () => {
    if (!supabase || !session?.golfCourseId) {
      setSquads([]);
      return;
    }
    const { data, error } = await supabase
      .from("squads")
      .select("*")
      .eq("golf_course_id", session.golfCourseId)
      .order("squad_code", { ascending: true });

    if (!error && data) {
      setSquads(data as SquadRow[]);
    }
  }, [supabase, session?.golfCourseId]);

  useEffect(() => {
    if (!authChecked || !session || !supabase) {
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      await refreshSquads();
      setLoading(false);
    })();
  }, [authChecked, session, supabase, refreshSquads]);

  function resetForm() {
    setEditingId(null);
    setSquadCode("");
    setSquadName("");
    setSquadPassword("");
    setMapColor(DEFAULT_COLORS[squads.length % DEFAULT_COLORS.length]);
    setIsEnabled(true);
    setFormError(null);
  }

  function beginEdit(row: SquadRow) {
    setEditingId(row.id);
    setSquadCode(row.squad_code);
    setSquadName(row.squad_name);
    setSquadPassword(row.password_hash);
    setMapColor(row.map_color?.trim() || DEFAULT_COLORS[0]);
    setIsEnabled(row.is_enabled);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const golfCourseId = session?.golfCourseId;
    if (!supabase || !golfCourseId || !canManageSquadsForCourse(session)) {
      return;
    }

    const code = squadCode.trim().toUpperCase();
    const name = squadName.trim();
    const pwd = squadPassword.trim();
    if (!code || !name || !pwd) {
      setFormError("Compila codice, nome e password squadra.");
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("squads")
          .update({
            squad_name: name,
            password_hash: pwd,
            map_color: mapColor,
            is_enabled: isEnabled,
          })
          .eq("id", editingId)
          .eq("golf_course_id", golfCourseId);

        if (error) {
          throw error;
        }
        setToast("Squadra aggiornata.");
      } else {
        const { error } = await supabase.from("squads").insert({
          squad_code: code,
          squad_name: name,
          password_hash: pwd,
          map_color: mapColor,
          is_enabled: isEnabled,
          golf_course_id: golfCourseId,
        });

        if (error) {
          throw error;
        }
        setToast("Squadra creata.");
      }

      resetForm();
      await refreshSquads();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore salvataggio.");
    } finally {
      setBusy(false);
    }
  }

  async function exportSquadsPdf() {
    if (squads.length === 0) {
      setFormError("Nessuna squadra da esportare.");
      return;
    }
    const courseLabel = session?.golfCourseName || session?.golfCourseCode || "Campo";
    const courseCode = session?.golfCourseCode || "—";
    const rows: SquadExportRow[] = squads.map((row) => ({
      squadCode: row.squad_code.toUpperCase(),
      squadName: row.squad_name,
      isEnabled: row.is_enabled,
    }));

    setBusy(true);
    setFormError(null);
    try {
      const result = await downloadSquadsPdf(rows, courseLabel, courseCode);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setToast(`PDF scaricato: ${result.filename}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEnabled(row: SquadRow) {
    const golfCourseId = session?.golfCourseId;
    if (!supabase || !golfCourseId) {
      return;
    }

    const nextEnabled = !row.is_enabled;
    const label = nextEnabled ? "attivare" : "disabilitare";
    if (
      !window.confirm(
        `${nextEnabled ? "Attivare" : "Disabilitare"} la squadra ${row.squad_code} — ${row.squad_name}?\n` +
          (nextEnabled
            ? "Potrà di nuovo fare login dall'app."
            : "Non potrà più fare login (sessioni già aperte restano fino al logout)."),
      )
    ) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const { error } = await supabase
        .from("squads")
        .update({ is_enabled: nextEnabled })
        .eq("id", row.id)
        .eq("golf_course_id", golfCourseId);

      if (error) {
        throw error;
      }
      if (editingId === row.id) {
        setIsEnabled(nextEnabled);
      }
      setToast(nextEnabled ? "Squadra attivata." : "Squadra disabilitata.");
      await refreshSquads();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Errore: impossibile ${label} la squadra.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row: SquadRow) {
    const golfCourseId = session?.golfCourseId;
    if (!supabase || !golfCourseId) {
      return;
    }
    if (
      !window.confirm(
        `Eliminare la squadra ${row.squad_code} — ${row.squad_name}?\n` +
          "Se è online sul telefono, il login non funzionerà più.",
      )
    ) {
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const { error } = await deleteSquadForCourse(supabase, row.id, golfCourseId);
      if (error) {
        setFormError(error);
        return;
      }
      if (editingId === row.id) {
        resetForm();
      }
      setToast("Squadra eliminata.");
      await refreshSquads();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore eliminazione.");
    } finally {
      setBusy(false);
    }
  }

  if (!authChecked) {
    return <div className={styles.root}>Caricamento…</div>;
  }

  if (!session || !canManageSquadsForCourse(session)) {
    return (
      <div className={styles.root}>
        <div className={styles.panel}>
          <p>Accesso riservato agli operatori con campo golf associato.</p>
          <Link href="/">← Dashboard TOC</Link>
        </div>
      </div>
    );
  }

  const courseLabel = session.golfCourseName || session.golfCourseCode || "Campo";

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <div>
          <h1>Squadre — {courseLabel}</h1>
          <p className={styles.sub}>Campo: {session.golfCourseCode}</p>
        </div>
        <Link className={styles.backLink} href="/">
          ← Dashboard TOC
        </Link>
      </header>

      <div className={styles.scroll}>
        <div className={styles.maxWidth}>
          {toast ? (
            <div className={styles.toast} role="status">
              {toast}
              <button type="button" onClick={() => setToast(null)}>
                Chiudi
              </button>
            </div>
          ) : null}

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelHeaderText}>
                <h2>Anagrafica squadre</h2>
                <p>
                  Le squadre create qui sono legate al campo{" "}
                  <strong>{session.golfCourseCode}</strong>{" "}
                  e possono fare login dall&apos;app mobile.
                </p>
              </div>
              <button
                type="button"
                className={styles.btnExportPdf}
                onClick={exportSquadsPdf}
                disabled={loading || busy || squads.length === 0}
              >
                Esporta PDF
              </button>
            </div>

            {formError ? <p className={styles.error}>{formError}</p> : null}

            <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
              <div className={styles.fieldRow}>
                <label>
                  Codice squadra
                  <input
                    value={squadCode}
                    onChange={(e) => setSquadCode(e.target.value.toUpperCase())}
                    disabled={Boolean(editingId) || busy}
                    placeholder="Es. SQD003"
                    required
                  />
                </label>
                <label>
                  Nome squadra
                  <input
                    value={squadName}
                    onChange={(e) => setSquadName(e.target.value)}
                    disabled={busy}
                    placeholder="Es. Squadra Charlie"
                    required
                  />
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label>
                  Password app
                  <input
                    type="text"
                    value={squadPassword}
                    onChange={(e) => setSquadPassword(e.target.value)}
                    disabled={busy}
                    required
                  />
                </label>
                <label>
                  Colore mappa
                  <input
                    type="color"
                    value={mapColor}
                    onChange={(e) => setMapColor(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  disabled={busy}
                />
                Stato: abilitata al login (se disabilitata, l&apos;app rifiuta il login)
              </label>
              <div className={styles.formActions}>
                <button type="submit" className={styles.btnPrimary} disabled={busy}>
                  {editingId ? "Salva modifiche" : "Aggiungi squadra"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={resetForm}
                    disabled={busy}
                  >
                    Annulla
                  </button>
                ) : null}
              </div>
            </form>

            {loading ? (
              <p className={styles.empty}>Caricamento…</p>
            ) : squads.length === 0 ? (
              <p className={styles.empty}>Nessuna squadra per questo campo.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Codice</th>
                    <th>Nome</th>
                    <th>Password</th>
                    <th>Stato</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {squads.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={styles.colorDot}
                          style={{ background: row.map_color ?? "#079B42" }}
                        />
                        {row.squad_code}
                      </td>
                      <td>{row.squad_name}</td>
                      <td>{row.password_hash}</td>
                      <td>
                        <button
                          type="button"
                          className={
                            row.is_enabled ? styles.statusActive : styles.statusDisabled
                          }
                          onClick={() => void handleToggleEnabled(row)}
                          disabled={busy}
                          title="Clicca per attivare o disabilitare il login"
                        >
                          {row.is_enabled ? "Attiva" : "Disabilitata"}
                        </button>
                      </td>
                      <td className={styles.rowActions}>
                        <button type="button" onClick={() => beginEdit(row)} disabled={busy}>
                          Modifica
                        </button>
                        <button
                          type="button"
                          className={styles.btnDanger}
                          onClick={() => void handleDelete(row)}
                          disabled={busy}
                        >
                          Elimina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
