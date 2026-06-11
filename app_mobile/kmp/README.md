# gestSQUADRE — Kotlin Multiplatform (fase 1)

Modulo **`shared`** con la stessa logica di `gest_squadre` (Flutter APK **1.0.12** operativa).

## Cosa c'è

| Modulo | Ruolo |
|--------|--------|
| `shared` | Login, logout, GPS, allarme, token FCM → Supabase (Ktor) |
| `androidApp` | UI Compose — app operativa (`com.ansmi.gest_squadre`, Firebase **gestSQUADRE**) |

Sostituisce l'APK Flutter: stesso package e push Firebase.

## API condivisa

```kotlin
val facade = GestSquadreFacade(
    GestSquadreConfig(supabaseUrl, supabaseAnonKey)
)
facade.loginSquad("SQD001", "1234")
facade.sendAlarm(session)
facade.logoutSquad(sessionId)
```

## Build Android (dev)

1. Android Studio **Ladybug+** o JDK 17 + Android SDK.
2. Stesso `dart-defines.json` di Flutter in `../gest_squadre/`.
3. Da questa cartella:

```bat
kmp-dev.bat
```

Installa sul telefono collegato:

```bat
kmp-dev.bat install
```

APK dev (nome fisso): `gestSQUADRE_KMP_dev_1.0.x.apk` nella cartella `kmp/`  
Versione `x` da `androidApp/build.gradle.kts` → `versionName` (es. `1.0.0`).

## iOS (fase 2, serve Mac)

Target `iosArm64` / `iosSimulatorArm64` già definiti in `shared`.  
Su Mac: framework Kotlin + app SwiftUI che importa `GestSquadreFacade`.

## Prossimi passi

- [x] UI Compose home + login (tema tactical, logo Open Golf, login/logout/allarme)
- [x] GPS periodico (expect/actual + invio Supabase come Flutter)
- [x] Mappa TOC (osmdroid: squadre, waypoint, stradale/ortofoto)
- [ ] Push FCM / APNs
- [ ] App iOS SwiftUI
