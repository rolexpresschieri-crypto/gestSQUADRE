"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ADMIN_SESSION_STORAGE_KEY, type AdminSessionData } from "@/lib/admin-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./campo-dashboard.module.css";

type CampoDashboardProps = {
  session: AdminSessionData;
  onLogout: () => void;
};

export default function CampoDashboard({ session, onLogout }: CampoDashboardProps) {
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [squadCount, setSquadCount] = useState(0);
  const [waypointCount, setWaypointCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const courseLabel =
    session.golfCourseName?.trim() ||
    session.golfCourseCode?.trim() ||
    "Campo golf";
  const courseCode = session.golfCourseCode?.trim() || "—";

  useEffect(() => {
    setSupabase(getSupabaseBrowserClient());
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!supabase || !session.golfCourseId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [squadsRes, eventRes] = await Promise.all([
      supabase
        .from("squads")
        .select("id", { count: "exact", head: true })
        .eq("golf_course_id", session.golfCourseId),
      supabase
        .from("events")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    setSquadCount(squadsRes.count ?? 0);

    const eventId = eventRes.data?.id as string | undefined;
    if (eventId) {
      const wpRes = await supabase
        .from("squad_map_points")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("golf_course_id", session.golfCourseId);
      setWaypointCount(wpRes.count ?? 0);
    } else {
      setWaypointCount(0);
    }

    setLoading(false);
  }, [supabase, session.golfCourseId]);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>gestSQUADRE — Gestione campo</p>
          <h1>{courseLabel}</h1>
          <p className={styles.sub}>
            Codice campo: <strong>{courseCode}</strong> · Operatore: {session.name}
          </p>
        </div>
        <button type="button" className={styles.logoutBtn} onClick={onLogout}>
          Logout
        </button>
      </header>

      <div className={styles.logoWrap}>
        <Image
          src="/logo_open_golf_2026.png"
          alt="Open Golf"
          width={720}
          height={172}
          priority
          className={styles.logo}
        />
      </div>

      <div className={styles.grid}>
        <Link className={styles.card} href="/waypoints">
          <h2>Waypoint</h2>
          <p>Buche, club house, punti di interesse del campo.</p>
          <span className={styles.count}>
            {loading ? "…" : `${waypointCount} waypoint`}
          </span>
        </Link>

        <Link className={styles.card} href="/campo/squads">
          <h2>Squadre</h2>
          <p>Inserisci, modifica o elimina le squadre di questo campo.</p>
          <span className={styles.count}>
            {loading ? "…" : `${squadCount} squadre`}
          </span>
        </Link>
      </div>

      <p className={styles.hint}>
        I waypoint e le squadre creati qui sono visibili al TOC solo per il campo{" "}
        <strong>{courseCode}</strong>. In futuro ogni campo avrà il proprio login.
      </p>
    </main>
  );
}

export function clearCampoSession() {
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}
