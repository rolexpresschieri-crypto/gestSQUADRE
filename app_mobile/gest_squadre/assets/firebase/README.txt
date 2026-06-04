Metti qui google-services.json per com.ansmi.gest_squadre

1. Firebase Console -> progetto allarme-app-2026-b9f74
2. Aggiungi app Android con package: com.ansmi.gest_squadre
3. Scarica google-services.json
4. Copia in:
   - assets/firebase/google-services.json  (questa cartella)
   - android/app/google-services.json
5. Esegui: scripts\sync-firebase-dart-defines.ps1
6. Ricompila: run-cell.bat (logout + login squadra)
