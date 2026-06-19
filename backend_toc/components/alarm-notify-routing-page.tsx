"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_SESSION_STORAGE_KEY,
  canManageAlarmRouting,
  canViewAlarmRouting,
  normalizeAdminRole,
  type AdminSessionData,
} from "@/lib/admin-auth";
import {
  buildRoutingSet,
  ROUTING_ALARM_ROWS,
  routingKey,
  type TocOperatorRow,
} from "@/lib/alarm-notify-admin";
import { restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./alarm-notify-routing-page.module.css";

type RoutingRow = {
  alarm_type: string;
  admin_code: string;
  is_enabled: boolean;
};

type TokenRow = {
  admin_code: string;
};

export default function AlarmNotifyRoutingPage() {
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [operators, setOperators] = useState<TocOperatorRow[]>([]);
  const [routing, setRouting] = useState<Set<string>>(new Set());
  const [phonesRegistered, setPhonesRegistered] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const role = session ? normalizeAdminRole(session.role) : "admin";
  const canView = canViewAlarmRouting(role);
  const canEdit = canManageAlarmRouting(role);

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

  const refresh = useCallback(async () => {
    if (!supabase || !canView) {
      setOperators([]);
      setRouting(new Set());
      setPhonesRegistered(new Set());
      return;
    }

    const [opsRes, routingRes, tokensRes] = await Promise.all([
      supabase
        .from("toc_admins")
        .select("admin_code, admin_name, is_enabled, role")
        .in("role", ["admin", "viewer"])
        .order("admin_code", { ascending: true }),
      supabase
        .from("alarm_notify_routing")
        .select("alarm_type, admin_code, is_enabled"),
      supabase.from("toc_admin_fcm_tokens").select("admin_code"),
    ]);

    if (opsRes.error) {
      setStatus(
        opsRes.error.message.includes("toc_admins")
          ? "Errore caricamento operatori."
          : opsRes.error.message,
      );
      setOperators([]);
    } else {
      setOperators(
        (opsRes.data ?? [])
          .filter((row) => row.is_enabled !== false)
          .map((row) => ({
            admin_code: String(row.admin_code).trim().toUpperCase(),
            admin_name: String(row.admin_name ?? "").trim(),
            is_enabled: row.is_enabled !== false,
          })),
      );
    }

    if (routingRes.error) {
      if (routingRes.error.message.includes("alarm_notify_routing")) {
        setStatus("Esegui sql/alarm_auto_notify.sql su Supabase.");
      } else {
        setStatus(routingRes.error.message);
      }
      setRouting(new Set());
    } else {
      setRouting(buildRoutingSet((routingRes.data ?? []) as RoutingRow[]));
    }

    if (!tokensRes.error) {
      const codes = new Set<string>();
      for (const row of (tokensRes.data ?? []) as TokenRow[]) {
        const code = String(row.admin_code ?? "").trim().toUpperCase();
        if (code) {
          codes.add(code);
        }
      }
      setPhonesRegistered(codes);
    }
  }, [supabase, canView]);

  useEffect(() => {
    if (!authChecked) {
      return;
    }
    void (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [authChecked, refresh]);

  const operatorCodes = useMemo(
    () => operators.map((op) => op.admin_code),
    [operators],
  );

  async function toggleCell(alarmType: string, adminCode: string, next: boolean) {
    if (!supabase || !canEdit) {
      return;
    }
    const key = routingKey(alarmType, adminCode);
    setBusyKey(key);
    setStatus(null);

    if (next) {
      const { error } = await supabase.from("alarm_notify_routing").upsert(
        {
          alarm_type: alarmType,
          admin_code: adminCode,
          is_enabled: true,
        },
        { onConflict: "alarm_type,admin_code" },
      );
      if (error) {
        setStatus(error.message);
      } else {
        setRouting((prev) => new Set([...prev, key]));
      }
    } else {
      const { error } = await supabase
        .from("alarm_notify_routing")
        .delete()
        .eq("alarm_type", alarmType)
        .eq("admin_code", adminCode);
      if (error) {
        setStatus(error.message);
      } else {
        setRouting((prev) => {
          const copy = new Set(prev);
          copy.delete(key);
          return copy;
        });
      }
    }

    setBusyKey(null);
  }

  if (!authChecked) {
    return null;
  }

  if (!session || !canView) {
    return (
      <main className={styles.root}>
        <div className={styles.loginCard}>
          <h1>Destinatari allarme automatico</h1>
          <p>Accedi al TOC (admin o viewer) per visualizzare la matrice.</p>
          <p>
            <Link href="/">Torna al login TOC</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.root}>
      <header className={styles.topBar}>
        <div>
          <h1>
            Destinatari allarme automatico
            {!canEdit ? <span className={styles.readonlyTag}>Sola lettura</span> : null}
          </h1>
          <p className={styles.sub}>
            Matrice globale (tutti i campi) · operatore: {session.code}
          </p>
        </div>
        <Link className={styles.backLink} href="/">
          ← Dashboard TOC
        </Link>
      </header>

      <div className={styles.scroll}>
        <div className={styles.note}>
          <p>
            Quando un volontario segnala allarme, il <strong>TOC riceve sempre</strong> la
            segnalazione (mappa rossa, colonna allarmi, stato in attesa).
          </p>
          <p>
            Le caselle qui sotto definiscono a quali operatori il sistema tenta l&apos;
            <strong>inoltro push automatico sul telefono</strong>. La push arriva solo se
            l&apos;operatore ha registrato il cellulare dall&apos;app («Operatore TOC:
            registra notifiche allarme»).{" "}
            <strong>Non serve essere loggati sul TOC web.</strong>
          </p>
          <p>
            Regola: unione delle tipologie selezionate (es. Sanitario + Security → tutti i
            destinatari marcati per entrambe le righe, senza duplicati).
          </p>
        </div>

        {loading ? (
          <p className={styles.status}>Caricamento…</p>
        ) : operatorCodes.length === 0 ? (
          <p className={styles.status}>
            Nessun operatore TOC (admin/viewer) trovato in anagrafica.
          </p>
        ) : (
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th className={styles.rowHead}>Tipologia allarme</th>
                  {operators.map((op) => (
                    <th key={op.admin_code}>
                      <span className={styles.operatorCode}>{op.admin_code}</span>
                      <span className={styles.operatorName}>{op.admin_name}</span>
                      {phonesRegistered.has(op.admin_code) ? (
                        <span className={styles.phoneOk}>Telefono OK</span>
                      ) : (
                        <span className={styles.phoneMissing}>Telefono non registrato</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROUTING_ALARM_ROWS.map((row) => (
                  <tr key={row.code}>
                    <td className={styles.rowHead}>
                      {row.label}
                      <span style={{ color: "#9baccc", fontWeight: 400 }}> ({row.code})</span>
                    </td>
                    {operators.map((op) => {
                      const key = routingKey(row.code, op.admin_code);
                      const checked = routing.has(key);
                      const busy = busyKey === key;
                      return (
                        <td key={op.admin_code}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={checked}
                            disabled={!canEdit || busy}
                            onChange={(e) =>
                              void toggleCell(row.code, op.admin_code, e.target.checked)
                            }
                            aria-label={`${row.label} → ${op.admin_code}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {status ? (
          <p className={`${styles.status} ${styles.statusError}`}>{status}</p>
        ) : null}
      </div>
    </main>
  );
}
