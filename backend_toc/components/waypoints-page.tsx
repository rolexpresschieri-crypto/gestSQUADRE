"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canManageWaypoints,
  isCampoGolfSession,
  type AdminSessionData,
} from "@/lib/admin-auth";
import { restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  formatWaypointTimestamp,
  sortWaypointsAlphabetically,
  waypointDisplayName,
  waypointSourceLabel,
  waypointsFromRows,
  type SquadWaypoint,
} from "@/lib/waypoints";
import {
  WAYPOINT_ICON_OPTIONS,
  type WaypointIconKey,
} from "@/lib/waypoint-icons";
import styles from "./waypoints-page.module.css";

export default function WaypointsPage() {
  const searchParams = useSearchParams();
  const deepLinkEditDoneRef = useRef<string | null>(null);

  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [activeEventTitle, setActiveEventTitle] = useState<string>("");

  const [waypoints, setWaypoints] = useState<SquadWaypoint[]>([]);
  const [waypointLabel, setWaypointLabel] = useState("");
  const [waypointIconKey, setWaypointIconKey] = useState<WaypointIconKey>("buche");
  const [waypointLat, setWaypointLat] = useState("");
  const [waypointLon, setWaypointLon] = useState("");
  const [editingWaypointId, setEditingWaypointId] = useState<string | null>(null);
  const [waypointBusy, setWaypointBusy] = useState(false);
  const [waypointFormError, setWaypointFormError] = useState<string | null>(null);
  const [waypointFeedError, setWaypointFeedError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canEdit = session ? canManageWaypoints(session.role) : false;
  const waypointSource = session?.golfCourseId ? "golf_campo" : "toc_backend";

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

  const refreshWaypoints = useCallback(async () => {
    if (!supabase || !activeEventId) {
      setWaypoints([]);
      return;
    }
    let query = supabase
      .from("squad_map_points")
      .select("*")
      .eq("event_id", activeEventId);
    if (session?.golfCourseId) {
      query = query.eq("golf_course_id", session.golfCourseId);
    }
    const { data, error } = await query.limit(400);

    if (!error && data) {
      setWaypoints(waypointsFromRows(data as Record<string, unknown>[]));
      setWaypointFeedError(null);
    } else if (error) {
      setWaypointFeedError(`Lettura waypoint: ${error.message}`);
    }
  }, [supabase, activeEventId, session?.golfCourseId]);

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

      if (error) {
        setWaypointFeedError(error.message);
        setLoading(false);
        return;
      }
      if (!ev) {
        setWaypointFeedError("Nessun evento attivo. Attiva un evento in Supabase.");
        setLoading(false);
        return;
      }

      setActiveEventId(ev.id as string);
      setActiveEventTitle((ev.title as string) ?? "Evento");
      setLoading(false);
    })();
  }, [authChecked, session, supabase]);

  useEffect(() => {
    if (!activeEventId) {
      return;
    }
    void refreshWaypoints();
  }, [activeEventId, refreshWaypoints]);

  useEffect(() => {
    if (!supabase || !activeEventId) {
      return;
    }
    const ch = supabase
      .channel("gest-waypoints-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_map_points" },
        () => void refreshWaypoints(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, activeEventId, refreshWaypoints]);

  const waypointsOrdered = useMemo(
    () => sortWaypointsAlphabetically(waypoints),
    [waypoints],
  );

  function resetWaypointForm() {
    setEditingWaypointId(null);
    setWaypointLabel("");
    setWaypointIconKey("buche");
    setWaypointLat("");
    setWaypointLon("");
    setWaypointFormError(null);
  }

  function beginEditWaypoint(waypoint: SquadWaypoint) {
    setEditingWaypointId(waypoint.id);
    setWaypointLabel(waypoint.label?.trim() ?? "");
    setWaypointIconKey(waypoint.iconKey);
    setWaypointLat(String(waypoint.latitude));
    setWaypointLon(String(waypoint.longitude));
    setWaypointFormError(null);
  }

  useEffect(() => {
    const editId = searchParams.get("edit")?.trim();
    if (!editId || waypointsOrdered.length === 0) {
      return;
    }
    if (deepLinkEditDoneRef.current === editId) {
      return;
    }
    const wp = waypointsOrdered.find((w) => w.id === editId);
    if (wp) {
      beginEditWaypoint(wp);
      deepLinkEditDoneRef.current = editId;
    }
  }, [searchParams, waypointsOrdered]);

  async function handleWaypointSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !session || !canEdit || !activeEventId) {
      return;
    }

    const nameTrim = waypointLabel.trim();
    const latTrim = waypointLat.trim();
    const lonTrim = waypointLon.trim();
    if (!nameTrim) {
      setWaypointFormError("Inserisci il nome della buca.");
      return;
    }
    if (!latTrim || !lonTrim) {
      setWaypointFormError("Inserisci latitudine e longitudine.");
      return;
    }

    const lat = Number(latTrim.replace(",", "."));
    const lon = Number(lonTrim.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setWaypointFormError("Latitudine e longitudine devono essere numeri validi.");
      return;
    }

    setWaypointBusy(true);
    setWaypointFormError(null);

    try {
      if (editingWaypointId) {
        let updateQuery = supabase
          .from("squad_map_points")
          .update({
            latitude: lat,
            longitude: lon,
            label: nameTrim,
            icon_key: waypointIconKey,
          })
          .eq("id", editingWaypointId);
        if (session.golfCourseId) {
          updateQuery = updateQuery.eq("golf_course_id", session.golfCourseId);
        }
        const { error } = await updateQuery;

        if (error) {
          throw error;
        }
        setToast("Waypoint aggiornato.");
      } else {
        const { error } = await supabase.from("squad_map_points").insert({
          event_id: activeEventId,
          latitude: lat,
          longitude: lon,
          label: nameTrim,
          icon_key: waypointIconKey,
          created_by_admin_code: session.code,
          source: waypointSource,
          golf_course_id: session.golfCourseId ?? null,
        });

        if (error) {
          throw error;
        }
        setToast("Waypoint salvato.");
      }

      resetWaypointForm();
      await refreshWaypoints();
    } catch (err) {
      setWaypointFormError(
        err instanceof Error ? err.message : "Errore sconosciuto.",
      );
    } finally {
      setWaypointBusy(false);
    }
  }

  async function handleDeleteWaypoint(waypoint: SquadWaypoint) {
    if (!supabase || !canEdit) {
      return;
    }
    if (
      !window.confirm(
        `Eliminare la buca "${waypointDisplayName(waypoint)}"?`,
      )
    ) {
      return;
    }

    setWaypointBusy(true);
    try {
      let deleteQuery = supabase.from("squad_map_points").delete().eq("id", waypoint.id);
      if (session?.golfCourseId) {
        deleteQuery = deleteQuery.eq("golf_course_id", session.golfCourseId);
      }
      const { error } = await deleteQuery;
      if (error) {
        throw error;
      }
      if (editingWaypointId === waypoint.id) {
        resetWaypointForm();
      }
      setToast("Waypoint eliminato.");
      await refreshWaypoints();
    } catch (err) {
      setWaypointFormError(
        err instanceof Error ? err.message : "Errore eliminazione.",
      );
    } finally {
      setWaypointBusy(false);
    }
  }

  if (!authChecked) {
    return <div className={styles.root}>Caricamento…</div>;
  }

  if (!session) {
    return (
      <div className={styles.root}>
        <div className={styles.loginHint}>
          <p>
            <Link href="/">Accedi al TOC</Link> per gestire i waypoint.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.topBar}>
        <h1>Waypoint tattici</h1>
        <Link className={styles.backLink} href="/">
          ← Dashboard TOC
        </Link>
      </header>

      <div className={styles.scroll}>
        <div className={styles.maxWidth}>
          {toast ? (
            <div className={styles.toast} role="status">
              {toast}
              <button
                type="button"
                onClick={() => setToast(null)}
                style={{ marginLeft: 12, background: "none", border: "none", color: "inherit", cursor: "pointer" }}
              >
                Chiudi
              </button>
            </div>
          ) : null}

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Waypoint fissi</h2>
              <p>
                Evento attivo: <strong>{activeEventTitle || "—"}</strong>
                {isCampoGolfSession(session) ? (
                  <>
                    {" "}
                    · Campo: <strong>{session.golfCourseCode}</strong>
                  </>
                ) : null}
                {" "}
                · Solo latitudine e longitudine (senza quota).
              </p>
            </div>

            {loading ? (
              <p className={styles.emptyState}>Caricamento…</p>
            ) : (
              <div className={styles.registryForm}>
                <div className={styles.messageBox}>
                  {waypoints.length} waypoint · Ordine A–Z · Icona selezionabile per ogni punto.
                </div>

                {waypointFeedError ? (
                  <div className={styles.messageBox} style={{ borderColor: "#ffa726" }}>
                    {waypointFeedError}
                    {waypointFeedError.includes("squad_map_points") ? (
                      <p style={{ marginTop: 8 }}>
                        Esegui <code>sql/squad_map_points.sql</code> su Supabase.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {waypointFormError ? (
                  <div className={styles.messageBox} style={{ borderColor: "#d91f2a" }}>
                    {waypointFormError}
                  </div>
                ) : null}

                {canEdit && activeEventId ? (
                  <form noValidate onSubmit={(e) => void handleWaypointSubmit(e)}>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="wp-label">Nome buca</label>
                      <input
                        id="wp-label"
                        placeholder="Es. BUCA 1"
                        value={waypointLabel}
                        onChange={(e) => setWaypointLabel(e.target.value)}
                        required
                      />
                    </div>
                    <div className={styles.fieldGroup}>
                      <span className={styles.iconPickerLabel}>Icona sulla mappa</span>
                      <div className={styles.iconPicker} role="radiogroup" aria-label="Icona waypoint">
                        {WAYPOINT_ICON_OPTIONS.map((opt) => (
                          <label
                            key={opt.key}
                            className={
                              waypointIconKey === opt.key
                                ? `${styles.iconOption} ${styles.iconOptionActive}`
                                : styles.iconOption
                            }
                          >
                            <input
                              type="radio"
                              name="wp-icon"
                              value={opt.key}
                              checked={waypointIconKey === opt.key}
                              onChange={() => setWaypointIconKey(opt.key)}
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={opt.mapUrl} alt="" width={40} height={40} />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className={styles.formGrid}>
                      <div className={styles.fieldGroup}>
                        <label htmlFor="wp-lat">Latitudine</label>
                        <input
                          id="wp-lat"
                          placeholder="es. 45.12345"
                          value={waypointLat}
                          onChange={(e) => setWaypointLat(e.target.value)}
                        />
                      </div>
                      <div className={styles.fieldGroup}>
                        <label htmlFor="wp-lon">Longitudine</label>
                        <input
                          id="wp-lon"
                          placeholder="es. 7.98765"
                          value={waypointLon}
                          onChange={(e) => setWaypointLon(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.formActions}>
                      <button className={styles.mapAction} type="submit" disabled={waypointBusy}>
                        {editingWaypointId ? "Salva modifiche" : "Aggiungi waypoint"}
                      </button>
                      {editingWaypointId ? (
                        <button
                          className={styles.ghostButton}
                          type="button"
                          disabled={waypointBusy}
                          onClick={resetWaypointForm}
                        >
                          Annulla modifica
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : (
                  <div className={styles.emptyState}>
                    {session.role === "viewer"
                      ? "Profilo viewer: sola lettura."
                      : "Evento attivo mancante."}
                  </div>
                )}

                <div className={styles.listBody}>
                  {waypointsOrdered.length === 0 ? (
                    <div className={styles.emptyState}>Nessun waypoint.</div>
                  ) : (
                    waypointsOrdered.map((wp) => (
                      <article className={styles.listItem} key={wp.id}>
                        <div className={styles.listRow}>
                          <div className={styles.listRowMain}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className={styles.listIconThumb}
                              src={
                                WAYPOINT_ICON_OPTIONS.find((o) => o.key === wp.iconKey)
                                  ?.mapUrl ?? "/map/buca_02.png"
                              }
                              alt=""
                              width={40}
                              height={40}
                            />
                            <div>
                            <div className={styles.listCode}>
                              {waypointDisplayName(wp)}
                            </div>
                            <div className={styles.missionText}>
                              {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)} · Icona:{" "}
                              {WAYPOINT_ICON_OPTIONS.find((o) => o.key === wp.iconKey)?.label ??
                                wp.iconKey}
                            </div>
                            <div className={styles.missionText}>
                              {waypointSourceLabel(wp.source)} ·{" "}
                              {formatWaypointTimestamp(wp.createdAt)}
                              {wp.createdByAdminCode ? ` · ${wp.createdByAdminCode}` : ""}
                            </div>
                            </div>
                          </div>
                          {canEdit ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                className={styles.inlineButton}
                                disabled={waypointBusy}
                                onClick={() => beginEditWaypoint(wp)}
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                className={styles.inlineButton}
                                disabled={waypointBusy}
                                style={{ color: "#ff8a80" }}
                                onClick={() => void handleDeleteWaypoint(wp)}
                              >
                                Elimina
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
