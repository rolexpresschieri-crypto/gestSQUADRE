# gestSQUADRE

App **nuova e separata** da TocAppBuild: tracking squadre, allarme verso TOC, backend web TOC con mappa e messaggi push.

## Struttura

| Cartella | Contenuto |
|----------|-----------|
| `app_mobile/gest_squadre/` | App Flutter Android (squadre + ingresso TOC) |
| `backend_toc/` | Backoffice Next.js (mappa, allarmi realtime, messaggi FCM) |
| `sql/schema_v1.sql` | Schema Supabase **dedicato** |

**Non modificare** `TocAppBuild`: copiare solo asset/codice quando serve.

## Requisiti confermati

1. GPS: **solo posizione attuale** (aggiornamento periodico su `squad_sessions`)
2. Notifiche: **realtime + FCM** (squadra→TOC via Supabase Realtime sul web; TOC→squadra via FCM)
3. Dati: **solo Supabase** (nuovo progetto)

### Allarme squadra → solo backend (mappa)

- Dal cellulare: **solo segnalazione su Supabase** (conferma manuale). Nessun SMS, nessuna push al TOC.
- Sul backend: **cerchio rosso + etichetta bianca** sulla mappa; si azzera con **Preso in carico**.

### Messaggio TOC → squadra (push)

- Push FCM su canale **`gest_squadre_toc_alarm_v2`** con sirena **`siren.mp3`** (come AllarmeApp).

## Setup rapido

### 1. Supabase

1. Crea un **nuovo** progetto Supabase.
2. Esegui `sql/schema_v1.sql` nel SQL Editor.
3. In **Database → Replication**, verifica `squad_sessions` e `squad_alarms` in realtime.
4. Copia URL e anon key.

### 2. App mobile

```bash
cd app_mobile/gest_squadre
copy dart-defines.example.json dart-defines.json
# Compila dart-defines.json con SUPABASE_* e FIREBASE_* (progetto Firebase dedicato gestSQUADRE)
flutter pub get
flutter run --dart-define-from-file=dart-defines.json
```

### 3. Backend TOC

```bash
cd backend_toc
copy .env.example .env.local
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_*, FIREBASE_SERVICE_ACCOUNT_JSON
npm install
npm run dev
```

Apri **https://localhost:3000** (HTTPS in dev; vedi `docs/HTTPS-BACKEND-TOC.md`). Login TOC (`TOC01` / `toc123` demo).

**Accesso da Internet (telefoni, altri PC):** deploy su **Vercel** → `docs/DEPLOY-VERCEL.md` (HTTPS automatico, URL tipo `https://xxx.vercel.app`).

## Credenziali demo (dopo schema_v1)

| Ruolo | Codice | Password |
|-------|--------|----------|
| Squadra | SQD001 | 1234 |
| TOC | TOC01 | toc123 |

## Test solo cellulare

```bat
cd app_mobile\gest_squadre
run-cell.bat
```

Vedi `app_mobile/gest_squadre/TEST-CELLULARE.md`.

## Build APK

```bat
cd app_mobile\gest_squadre
build-apk.bat
```

Crea anche `gestSQUADRE_1.0.xx.apk` (xx da `version` in `pubspec.yaml`, es. `1.0.0` → `gestSQUADRE_1.0.0.apk`).
