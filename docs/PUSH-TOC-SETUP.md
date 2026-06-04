# Push TOC → cellulare (perché non arriva)

## Checklist

### 1. Backend (`backend_toc/.env.local`)

```env
SUPABASE_URL=https://TUO-REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
FIREBASE_SERVICE_ACCOUNT_PATH=C:\Users\TUO\Downloads\progetto-firebase-adminsdk-xxxxx.json
# oppure, su una sola riga:
# FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

**Consigliato (Windows):** `FIREBASE_SERVICE_ACCOUNT_PATH` = percorso completo al file `.json` scaricato (non incollare altre righe `.env` nella stessa riga).

Alternativa: `FIREBASE_SERVICE_ACCOUNT_JSON` = **solo** il contenuto del file JSON (una riga).

Dopo modifica: **riavvia** `npm run dev`.

Verifica: apri https://localhost:3000/api/push-health  
Deve rispondere `"firebaseAdmin": true`.

### 2. App Android (`dart-defines.json` + `google-services.json`)

Stesso progetto Firebase **`allarme-app-2026-b9f74`**, ma serve un’**app Android dedicata** con package `com.ansmi.gest_squadre` (vedi `docs/FIREBASE-CELL-APP.md`).

Dopo aver scaricato `google-services.json`:

```powershell
cd app_mobile\gest_squadre
.\scripts\sync-firebase-dart-defines.ps1
```

Poi `dart-defines.json` con:

```json
"FIREBASE_ANDROID_API_KEY": "...",
"FIREBASE_ANDROID_APP_ID": "1:...:android:...",
"FIREBASE_MESSAGING_SENDER_ID": "...",
"FIREBASE_PROJECT_ID": "..."
```

Poi **ricompila** e reinstalla (`build-apk-no-clean.bat` o `run-cell.bat`).

### 3. Sul telefono

1. Login squadra (registra token in `squad_fcm_tokens`)
2. Impostazioni → notifiche **consentite** per gestSQUADRE
3. Dal TOC: squadra deve risultare **online**

### 4. Errore tipico in dashboard

| Codice | Significato |
|--------|-------------|
| `FIREBASE_ADMIN_NOT_CONFIGURED` | Manca JSON in `.env.local` |
| `NO_FCM_TOKEN` | Telefono senza Firebase o non rifatto login dopo build |
| `FCM_SEND_FAILED` | Progetto Firebase / chiavi non allineate |

In Supabase → tabella `squad_fcm_tokens`: deve esserci una riga per la sessione attiva.
