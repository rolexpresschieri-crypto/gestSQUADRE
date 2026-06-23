#!/usr/bin/env bash
# Build + install su simulatore senza passare dal pulsante Run di Xcode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS="$ROOT/iosApp"
SIM_ID="${1:-0FB0E253-A2CD-4F4D-B1F4-F5064D77543E}"

echo "=== gestSQUADRE iOS simulatore (CLI) ==="

killall SWBBuildService 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/iosApp-*

bash "$IOS/sync-config.sh"
SDK_NAME=iphonesimulator CONFIGURATION=Debug bash "$IOS/compile-kotlin-framework.sh"

FW_SRC="$ROOT/shared/build/xcode-frameworks/Debug/iphonesimulator/shared.framework"
FW_DST_DIR="$ROOT/shared/build/xcode-frameworks/Debug/iphonesimulator26.5"
mkdir -p "$FW_DST_DIR"
rm -rf "$FW_DST_DIR/shared.framework"
cp -R "$FW_SRC" "$FW_DST_DIR/shared.framework"

xcrun simctl boot "$SIM_ID" 2>/dev/null || true
open -a Simulator

echo "Rimuovo vecchia app dal simulatore..."
xcrun simctl uninstall "$SIM_ID" com.ansmi.gestsquadre 2>/dev/null || true

cd "$IOS"
xcodebuild \
  -project iosApp.xcodeproj \
  -scheme iosApp \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIM_ID" \
  -jobs 1 \
  SWIFT_ENABLE_EXPLICIT_MODULES=NO \
  build

APP="$(find ~/Library/Developer/Xcode/DerivedData/iosApp-*/Build/Products/Debug-iphonesimulator -maxdepth 1 -name 'gestSQUADRE.app' -print -quit)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "ERRORE: gestSQUADRE.app non trovato dopo build"
  exit 1
fi

xcrun simctl install "$SIM_ID" "$APP"
xcrun simctl launch "$SIM_ID" com.ansmi.gestsquadre
echo "OK: app avviata sul simulatore $SIM_ID"
echo "Verifica in home: build label 'iOS 1.0.2 (4)' in fondo"
