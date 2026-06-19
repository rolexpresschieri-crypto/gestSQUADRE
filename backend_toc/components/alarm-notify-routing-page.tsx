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
  ALARM_NOTIFY_SQUAD_CODE_PREFIX,
  buildRoutingSet,
  ROUTING_ALARM_ROWS,
  routingKey,
  type SquadRecipientRow,
} from "@/lib/alarm-notify-admin";
import { restoreAdminSessionFromStorage } from "@/lib/campo-login";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./alarm-notify-routing-page.module.css";

type RoutingRow = {
  alarm_type: string;
  recipient_squad_code?: string | null;
  admin_code?: string | null;
  is_enabled: boolean;
};

type OnlineSessionRow = {
  id: string;
  squads: { squad_code: string } | { squad_code: string }[] | null;
};

function squadCodeFromSession(row: OnlineSessionRow): string {
  const squads = row.squads;
  if (!squads) {
    return "";
  }
  if (Array.isArray(squads)) {
    return String(squads[0]?.squad_code ?? "").trim().toUpperCase();
  }
  return String(squads.squad_code ?? "").trim().toUpperCase();
}

function routingRecipientCode(row: RoutingRow): string {
  return (row.recipient_squad_code ?? row.admin_code ?? "").trim().toUpperCase();
}

export default function AlarmNotifyRoutingPage() {
  const [supabase, setSupabase] = useState<ReturnType<typeof getSupabaseBrowserClient>>(null);
  const [session, setSession] = useState<AdminSessionData | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [recipients, setRecipients] = useState<SquadRecipientRow[]>([]);
  const [routing, setRouting] = useState<Set<string>>(new Set());
  const [phonesOnline, setPhonesOnline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [usesLegacyAdminColumn, setUsesLegacyAdminColumn] = useState(false);

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
      setRecipients([]);
      setRouting(new Set());
      setPhonesOnline(new Set());
      return;
    }

    const squadsRes = await supabase
      .from("squads")
      .select("squad_code, squad_name, is_enabled")
      .like("squad_code", `${ALARM_NOTIFY_SQUAD_CODE_PREFIX}%`)
      .order("squad_code", { ascending: true });

    let routingRes = await supabase
      .from("alarm_notify_routing")
      .select("alarm_type, recipient_squad_code, is_enabled");

    if (routingRes.error?.message.includes("recipient_squad_code")) {
      setUsesLegacyAdminColumn(true);
      routingRes = await supabase
        .from("alarm_notify_routing")
        .select("alarm_type, admin_code, is_enabled");
    } else {
      setUsesLegacyAdminColumn(false);
    }

    const sessionsRes = await supabase
      .from("squad_sessions")
      .select("id, squads(squad_code)")
      .eq("is_online", true);

    const squadMap = new Map<string, SquadRecipientRow>();
    if (!squadsRes.error) {
      for (const row of squadsRes.data ?? []) {
        const code = String(row.squad_code ?? "").trim().toUpperCase();
        if (!code) {
          continue;
        }
        squadMap.set(code, {
          squad_code: code,
          squad_name: String(row.squad_name ?? "").trim(),
          is_enabled: row.is_enabled !== false,
        });
      }
    }

    if (!routingRes.error) {
      for (const row of (routingRes.data ?? []) as RoutingRow[]) {
        const code = routingRecipientCode(row);
        if (!code || squadMap.has(code)) {
          continue;
        }
        squadMap.set(code, {
          squad_code: code,
          squad_name: code,
          is_enabled: true,
        });
      }
    }

    const recipientList = [...squadMap.values()]
      .filter((row) => row.is_enabled)
      .sort((a, b) => a.squad_code.localeCompare(b.squad_code));

    if (squadsRes.error) {
      setStatus(
        squadsRes.error.message.includes("squads")
          ? "Errore caricamento squadre."
          : squadsRes.error.message,
      );
      setRecipients([]);
    } else {
      setRecipients(recipientList);
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

    const onlineCodes = new Set<string>();
    const sessionIds: string[] = [];
    if (!sessionsRes.error) {
      for (const row of (sessionsRes.data ?? []) as OnlineSessionRow[]) {
        const code = squadCodeFromSession(row);
        if (code) {
          sessionIds.push(String(row.id));
        }
      }
    }

    if (sessionIds.length > 0) {
      const tokensRes = await supabase
        .from("squad_fcm_tokens")
        .select("session_id")
        .in("session_id", sessionIds);

      if (!tokensRes.error) {
        const sessionsWithToken = new Set(
          (tokensRes.data ?? []).map((r) => String(r.session_id)),
        );
        for (const row of (sessionsRes.data ?? []) as OnlineSessionRow[]) {
          if (!sessionsWithToken.has(String(row.id))) {
            continue;
          }
          const code = squadCodeFromSession(row);
          if (code) {
            onlineCodes.add(code);
          }
        }
      }
    }
    setPhonesOnline(onlineCodes);
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

  const recipientCodes = useMemo(
    () => recipients.map((row) => row.squad_code),
    [recipients],
  );

  async function toggleCell(alarmType: string, squadCode: string, next: boolean) {
    if (!supabase || !canEdit) {
      return;
    }
    const key = routingKey(alarmType, squadCode);
    setBusyKey(key);
    setStatus(null);

    if (next) {
      const upsertRes = usesLegacyAdminColumn
        ? await supabase.from("alarm_notify_routing").upsert(
            {
              alarm_type: alarmType,
              admin_code: squadCode,
              is_enabled: true,
            },
            { onConflict: "alarm_type,admin_code" },
          )
        : await supabase.from("alarm_notify_routing").upsert(
            {
              alarm_type: alarmType,
              recipient_squad_code: squadCode,
              is_enabled: true,
            },
            { onConflict: "alarm_type,recipient_squad_code" },
          );
      const { error } = upsertRes;
      if (error) {
        setStatus(error.message);
      } else {
        setRouting((prev) => new Set([...prev, key]));
      }
    } else {
      const column = usesLegacyAdminColumn ? "admin_code" : "recipient_squad_code";
      const { error } = await supabase
        .from("alarm_notify_routing")
        .delete()
        .eq("alarm_type", alarmType)
        .eq(column, squadCode);
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
            Le caselle qui sotto definiscono a quali <strong>squadre FIG/Sanitari (GT_*)</strong>{" "}
            il sistema tenta l&apos;
            <strong>inoltro push automatico sul telefono</strong>. La push arriva se la squadra
            ha fatto <strong>login squadra</strong> nell&apos;app (stesso flusso dei volontari:
            mappa, allarmi, ecc.). <strong>Non serve il TOC web.</strong>
          </p>
          <p>
            Regola: unione delle tipologie selezionate (es. Sanitario + Security → tutti i
            destinatari marcati per entrambe le righe, senza duplicati).
          </p>
        </div>

        {loading ? (
          <p className={styles.status}>Caricamento…</p>
        ) : recipientCodes.length === 0 ? (
          <p className={styles.status}>
            Nessuna squadra GT_* trovata in anagrafica squads.
          </p>
        ) : (
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th className={styles.rowHead}>Tipologia allarme</th>
                  {recipients.map((row) => (
                    <th key={row.squad_code}>
                      <span className={styles.operatorCode}>{row.squad_code}</span>
                      <span className={styles.operatorName}>{row.squad_name}</span>
                      {phonesOnline.has(row.squad_code) ? (
                        <span className={styles.phoneOk}>App online · push OK</span>
                      ) : (
                        <span className={styles.phoneMissing}>Non online / senza push</span>
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
                    {recipients.map((recipient) => {
                      const key = routingKey(row.code, recipient.squad_code);
                      const checked = routing.has(key);
                      const busy = busyKey === key;
                      return (
                        <td key={recipient.squad_code}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={checked}
                            disabled={!canEdit || busy}
                            onChange={(e) =>
                              void toggleCell(row.code, recipient.squad_code, e.target.checked)
                            }
                            aria-label={`${row.label} → ${recipient.squad_code}`}
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
