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
facade.logoutSquad(session)
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

## iOS (fase 2 — Mac + Xcode)

Cartella **`iosApp/`** con progetto Xcode + SwiftUI (login Supabase).

```bash
cd app_mobile/kmp
chmod +x kmp-dev.sh iosApp/sync-config.sh
./kmp-dev.sh ios-open
```

In Xcode: simulatore iPhone → **Run** (⌘R). Stesso `dart-defines.json` dell’Android.

Il TOC resta su **Windows**; l’app parla solo con **Supabase** in cloud.

## Prossimi passi

- [x] UI Compose home + login (tema tactical, logo Open Golf, login/logout/allarme)
- [x] GPS periodico (expect/actual + invio Supabase come Flutter)
- [x] Mappa TOC (osmdroid: squadre, waypoint, stradale/ortofoto)
- [x] App iOS SwiftUI — login base (fase 2)
- [x] GPS iOS (CoreLocation)
- [x] Allarme mappa TOC (iOS — UI base, tema tactical in seguito)
- [x] Log-in / Log-out iOS (stessi pulsanti Android, UI base)
- [ ] Push FCM / APNs
- [ ] UI iOS completa (mappa, allarmi, pannello TOC)
