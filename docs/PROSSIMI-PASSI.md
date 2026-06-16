# gestSQUADRE — come procedere

## Stato attuale

| Componente | Stato |
|------------|--------|
| App Flutter (home, login, GPS, allarme mappa) | Pronta |
| App KMP iOS (login, log-out, GPS, allarme mappa) | Pronta (UI base) |
| App KMP Android | Pronta (UI tactical completa) |
| Backend TOC (mappa, rosso allarme, push) | Pronta |
| SQL Supabase `schema_v1.sql` | Da eseguire sul **nuovo** progetto |
| `dart-defines.json` | Da creare (non in git) |
| `.env.local` backend | Da creare |
| Firebase gestSQUADRE | Da creare (push TOC→cell) |
| Icona launcher | PNG in root → `apply-icon.bat` |

---

## Fase 1 — Supabase (obbligatoria, ~15 min)

1. [supabase.com](https://supabase.com) → **nuovo progetto** (non usare il DB di TocAppBuild).
2. SQL Editor → incolla ed esegui `sql/schema_v1.sql`.
3. **Database → Replication** → abilita `squad_sessions` e `squad_alarms`.
4. **Settings → API** → copia URL e `anon` key.

---

## Fase 2 — Solo cellulare (test campo)

```bat
cd app_mobile\gest_squadre
copy dart-defines.example.json dart-defines.json
```

Modifica `dart-defines.json`:

```json
{
  "SUPABASE_URL": "https://TUO-REF.supabase.co",
  "SUPABASE_ANON_KEY": "eyJ...",
  "TOC_BACKEND_URL": "https://10.0.2.2:3000"
}
```

(`10.0.2.2` = localhost del PC se usi emulatore Android.)

Icona (se cambi il PNG in root):

```bat
apply-icon.bat
```

Test:

```bat
run-cell.bat
```

Checklist: login SQD001/1234 → box verde → allarme → logout.

APK installabile:

```bat
build-apk.bat
```

→ `gestSQUADRE_1.0.0.apk`

---

## Fase 3 — Backend TOC sul PC

```bat
cd backend_toc
copy .env.example .env.local
```

In `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (stesso progetto)
- `SUPABASE_SERVICE_ROLE_KEY` (service role, solo server)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (fase 4, per push)

```bat
npm install
npm run dev
```

Browser: https://localhost:3000 — login **TOC01** / **toc123**.

Con squadra loggata dal telefono: vedi marker sulla mappa; **Segnala ALLARME** → cerchio rosso; **Preso in carico** → torna normale.

---

## Fase 4 — Push TOC → squadra (opzionale ma richiesta)

1. Console Firebase → progetto **nuovo** gestSQUADRE.
2. Aggiungi app Android `com.ansmi.gest_squadre`.
3. Scarica/configura e metti in `dart-defines.json`:
   - `FIREBASE_ANDROID_API_KEY`
   - `FIREBASE_ANDROID_APP_ID`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_PROJECT_ID`
4. Service account JSON → `FIREBASE_SERVICE_ACCOUNT_JSON` in `backend_toc/.env.local`.
5. Ricompila APK (`build-apk.bat`), login squadra, dal TOC **Invia allarme a squadre (push)**.

---

## Fase 5 — Produzione (quando tutto ok)

- Cambia password demo in Supabase (`squads`, `toc_admins`).
- Deploy backend: Vercel / server con `npm run build`.
- `TOC_BACKEND_URL` nell’APK = URL pubblico del TOC (es. `https://toc.tuodominio.it`).
- Versione APK: `pubspec.yaml` → `1.0.1+2` → `gestSQUADRE_1.0.1.apk`.

---

## Ordine consigliato oggi

1. Supabase + `dart-defines.json`
2. `apply-icon.bat` + `build-apk.bat` → installa sul telefono
3. Test login + allarme
4. `backend_toc` + verifica cerchio rosso
5. Firebase quando serve la push

---

## Fase 6 — App iOS (Mac)

```bash
cd app_mobile/kmp
./kmp-dev.sh ios-open
```

1. Xcode → **Signing** → Personal Team + iPhone collegato.
2. **⌘R** su simulatore o iPhone fisico.
3. Checklist: **Log-in** SQD001/1234 → GPS su mappa TOC → **INVIA ALLARME** → cerchio rosso → **Log-out**.

Log eventi TOC (menu **Log evento**): compare l’allarme inviato dall’iPhone (tabella `squad_alarms`).
