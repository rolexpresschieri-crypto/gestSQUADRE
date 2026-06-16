#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

MODE="${1:-help}"

case "$MODE" in
  ios-sync)
    bash iosApp/sync-config.sh
    ;;
  ios-open)
    bash iosApp/sync-config.sh
    rm -rf iosApp/iosApp.xcodeproj/project.xcworkspace
    rm -rf iosApp/iosApp.xcodeproj/xcuserdata
    open iosApp/iosApp.xcodeproj
    ;;
  ios-repair)
    bash iosApp/repair-and-open.sh
    ;;
  ios-framework)
    bash iosApp/sync-config.sh
    bash iosApp/compile-kotlin-framework.sh
    echo "Framework OK. Apri Xcode: ./kmp-dev.sh ios-open"
    ;;
  install|build)
    bash "$0" android
    ;;
  android)
    DEFINES="../gest_squadre/dart-defines.json"
    if [[ ! -f "$DEFINES" ]]; then
      echo "ERRORE: manca $DEFINES"
      exit 1
    fi
    ./gradlew :androidApp:assembleDebug --rerun-tasks --no-daemon
    ;;
  *)
    cat <<'EOF'
gestSQUADRE KMP — Mac

  ./kmp-dev.sh ios-sync      → Supabase da dart-defines.json → Config.xcconfig
  ./kmp-dev.sh ios-framework → compila modulo Kotlin shared per iOS
  ./kmp-dev.sh ios-open      → sync config + apre Xcode
  ./kmp-dev.sh android       → APK debug Android

Prima build iOS in Xcode:
  1. ./kmp-dev.sh ios-open
  2. Seleziona simulatore iPhone
  3. Product → Run (⌘R)
  4. In Signing: scegli il tuo Team Apple (per iPhone fisico)
EOF
    ;;
esac
