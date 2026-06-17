# Push TOC → cellulare: perché `squad_fcm_tokens` è vuota

Il server TOC (Firebase Admin) può essere **OK** (`push-health` → `firebaseAdmin: true`) ma senza token sul telefono la tabella resta **vuota** e la push fallisce con `NO_FCM_TOKEN`.

## Causa più comune

In `app_mobile/gest_squadre/dart-defines.json` i campi `FIREBASE_*` sono **vuoti** → l’app non inizializza Firebase → nessun token FCM → nessun insert in `squad_fcm_tokens`.

Le notifiche Android “attive” non bastano: serve anche l’**app registrata in Firebase** con package **`com.ansmi.gest_squadre`**.

## Procedura (una volta)

1. [Firebase Console](https://console.firebase.google.com/) → progetto **`allarme-app-2026-b9f74`** (stesso del service account TOC).
2. **Aggiungi app** → Android → package name: **`com.ansmi.gest_squadre`**
3. Scarica **`google-services.json`**
4. Copia il file in **entrambe** le cartelle:
   - `app_mobile/gest_squadre/android/app/google-services.json`
   - `app_mobile/gest_squadre/assets/firebase/google-services.json`
5. Da PowerShell:

```powershell
cd c:\Users\rronc\gestSQUADRE\app_mobile\gest_squadre
.\scripts\sync-firebase-dart-defines.ps1
```

6. **Ricompila e reinstalla** (`run-cell.bat` o `build-apk-no-clean.bat`).
7. Sul telefono: **logout** squadra → **login** di nuovo (registra il token).
8. Supabase → `squad_fcm_tokens` deve avere **1 riga** per sessione.
9. TOC → **Invia allarme a squadre (push)** (pulsante rosso, testo bianco).

## Verifica

- `https://localhost:3000/api/push-health` → `fcmTokenRows` ≥ 1 dopo login sul cell.
- In app, dopo login: non deve comparire *“Push TOC disabilitata…”*.

## iOS (gestSQUADRE KMP)

1. Firebase Console → app **gestSQUADRE iOS** (`com.ansmi.gestsquadre`) → scarica `GoogleService-Info.plist`
2. Copia in `app_mobile/gest_squadre/assets/firebase/GoogleService-Info.plist`
3. Da PowerShell:

```powershell
cd app_mobile\gest_squadre
.\scripts\sync-firebase-ios-dart-defines.ps1
```

4. Sul Mac: `cd app_mobile/kmp && ./iosApp/sync-config.sh` prima del build Xcode su iPhone fisico.

Guida completa: `docs/PUSH-IOS-SETUP.md`.
