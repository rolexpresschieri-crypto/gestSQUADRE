Firebase iOS — gestSQUADRE

1. Firebase Console ? progetto allarme-app-2026-b9f74
2. App Apple ? gestSQUADRE iOS (com.ansmi.gestsquadre)
3. Scarica GoogleService-Info.plist
4. Copia il file QUI in questa cartella:
   app_mobile/gest_squadre/assets/firebase/GoogleService-Info.plist

5. Da PowerShell (Windows):
   cd app_mobile\gest_squadre
   .\scripts\sync-firebase-ios-dart-defines.ps1

6. Sul Mac (dopo git pull):
   cd app_mobile/kmp
   ./iosApp/sync-config.sh
