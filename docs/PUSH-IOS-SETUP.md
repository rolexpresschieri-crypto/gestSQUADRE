# Push TOC ? iPhone (FCM + APNs)

Stesso backend di Android: il TOC invia su `squad_fcm_tokens` tramite **Firebase Admin**. Su iOS l’app registra un **token FCM** (Firebase usa APNs sotto il cofano).

## Prerequisiti

- Progetto Firebase **`allarme-app-2026-b9f74`** (stesso del TOC e Android)
- Account **Apple Developer** (push non funzionano sul simulatore)
- iPhone fisico con app installata da Xcode

## 1. Firebase Console — app iOS

1. [Firebase Console](https://console.firebase.google.com/) ? progetto `allarme-app-2026-b9f74`
2. **Aggiungi app** ? **iOS**
3. Bundle ID: **`com.ansmi.gestsquadre`**
4. Scarica `GoogleService-Info.plist` (opzionale: l’app usa anche `firebase-config.json` generato da `dart-defines.json`)

## 2. Chiave APNs in Firebase

1. [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) ? **Keys** ? nuova chiave con **Apple Push Notifications service (APNs)**
2. Scarica il file `.p8`
3. Firebase ? **Project settings** ? **Cloud Messaging** ? **Apple app configuration**
4. Carica la chiave APNs (Key ID, Team ID, bundle `com.ansmi.gestsquadre`)

Senza questo passaggio FCM non consegna push su iPhone.

## 3. `dart-defines.json` (Mac)

Aggiungi i campi iOS (da `GoogleService-Info.plist`):

```json
"FIREBASE_IOS_API_KEY": "AIza...",
"FIREBASE_IOS_APP_ID": "1:250732909266:ios:XXXXXXXX",
"FIREBASE_MESSAGING_SENDER_ID": "250732909266",
"FIREBASE_PROJECT_ID": "allarme-app-2026-b9f74",
"FIREBASE_STORAGE_BUCKET": "allarme-app-2026-b9f74.firebasestorage.app"
```

Poi sul Mac:

```bash
cd app_mobile/kmp
./iosApp/sync-config.sh
```

In Xcode: **??K** ? **?R** su **iPhone fisico**.

## 4. Sul telefono

1. All’avvio/login: consenti **notifiche**
2. Dopo login: in home deve comparire *«Push TOC: attiva…»* (verde)
3. Supabase ? `squad_fcm_tokens` ? 1 riga per la sessione
4. Dal TOC: invia messaggio push alla squadra

## 5. Verifica / errori

| Sintomo | Causa |
|---------|--------|
| «Push TOC disabilitata (Firebase iOS non configurato)» | `FIREBASE_IOS_*` vuoti in `dart-defines.json` |
| `NO_FCM_TOKEN` dal TOC | Login non fatto o token non registrato |
| Token ok ma push non arriva | APNs key mancante in Firebase, o build su simulatore |
| Pannello blu si aggiorna ma niente banner | Notifiche disabilitate in Impostazioni iOS |

## Simulatore

Le **remote push non sono affidabili** sul simulatore iOS. Per test end-to-end usa sempre un **iPhone reale**.
