#!/usr/bin/env bash
# Build IPA per iPhone fisico (equivalente APK Android).
# Output: gestSQUADRE_iOS_<versione>.ipa nella cartella kmp/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
IOS_APP="$ROOT/iosApp"
EXPORT_METHOD="${1:-development}"

if [[ "$EXPORT_METHOD" != "development" && "$EXPORT_METHOD" != "ad-hoc" ]]; then
  echo "Uso: $0 [development|ad-hoc]"
  echo "  development  ? installazione via Xcode / Apple Configurator (default)"
  echo "  ad-hoc       ? distribuzione a dispositivi registrati nel profilo Apple"
  exit 1
fi

echo "============================================"
echo "  gestSQUADRE � build IPA iOS ($EXPORT_METHOD)"
echo "============================================"
echo

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "ERRORE: Xcode non trovato. Installa Xcode dal Mac App Store."
  exit 1
fi

DEFINES="$ROOT/../gest_squadre/dart-defines.json"
if [[ ! -f "$DEFINES" ]]; then
  echo "ERRORE: manca $DEFINES"
  echo "Copia dart-defines.example.json ? dart-defines.json in gest_squadre/"
  exit 1
fi

bash "$IOS_APP/sync-config.sh"

CONFIG_XC="$IOS_APP/Configuration/Config.xcconfig"
MARKETING_VERSION="$(awk -F'= ' '/^MARKETING_VERSION/ {gsub(/ /, "", $2); print $2; exit}' "$CONFIG_XC")"
if [[ -z "$MARKETING_VERSION" ]]; then
  MARKETING_VERSION="1.0.1"
fi

OUTPUT_IPA="$ROOT/gestSQUADRE_iOS_${MARKETING_VERSION}.ipa"
ARCHIVE_DIR="$ROOT/build/ios-archive"
ARCHIVE_PATH="$ARCHIVE_DIR/gestSQUADRE.xcarchive"
EXPORT_DIR="$ROOT/build/ios-ipa-export"
EXPORT_PLIST="$IOS_APP/ExportOptions-${EXPORT_METHOD}.plist"

rm -rf "$ARCHIVE_DIR" "$EXPORT_DIR"
mkdir -p "$ARCHIVE_DIR"

# Java per Gradle (framework Kotlin)
if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
  for jhome in \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "$(/usr/libexec/java_home -v 17 2>/dev/null || true)" \
    "$(/usr/libexec/java_home 2>/dev/null || true)"; do
    if [[ -n "$jhome" && -x "$jhome/bin/java" ]]; then
      export JAVA_HOME="$jhome"
      break
    fi
  done
fi
if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

TEAM_ID="${DEVELOPMENT_TEAM:-}"
if [[ -z "$TEAM_ID" && -f "$IOS_APP/Configuration/Signing.xcconfig" ]]; then
  TEAM_ID="$(awk -F'= ' '/^DEVELOPMENT_TEAM/ {gsub(/ /, "", $2); print $2; exit}' "$IOS_APP/Configuration/Signing.xcconfig")"
fi
if [[ -z "$TEAM_ID" ]]; then
  TEAM_ID="$(xcodebuild -showBuildSettings \
    -project "$IOS_APP/iosApp.xcodeproj" \
    -scheme iosApp \
    -configuration Release 2>/dev/null \
    | awk -F' = ' '/DEVELOPMENT_TEAM/ {print $2; exit}')"
fi

XCODE_ARGS=(
  -project "$IOS_APP/iosApp.xcodeproj"
  -scheme iosApp
  -configuration Release
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE_PATH"
  -allowProvisioningUpdates
)

if [[ -n "$TEAM_ID" && "$TEAM_ID" != "" ]]; then
  XCODE_ARGS+=(DEVELOPMENT_TEAM="$TEAM_ID")
  echo "Team Apple: $TEAM_ID"
else
  echo "AVVISO: DEVELOPMENT_TEAM non impostato."
  echo "  1) cp iosApp/Configuration/Signing.xcconfig.example iosApp/Configuration/Signing.xcconfig"
  echo "     inserisci il Team ID Apple (10 caratteri)"
  echo "  2) oppure: DEVELOPMENT_TEAM=XXXXXXXXXX ./build-ios-ipa.sh"
  echo "  3) oppure Xcode: iosApp target -> Signing & Capabilities -> Team"
  echo
fi

echo "Compilazione archive Release (dispositivo fisico)..."
echo "  versione: $MARKETING_VERSION"
echo

cd "$IOS_APP"
xcodebuild archive "${XCODE_ARGS[@]}"

echo
echo "Export IPA ($EXPORT_METHOD)..."
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates

BUILT_IPA="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' -print -quit)"
if [[ -z "$BUILT_IPA" || ! -f "$BUILT_IPA" ]]; then
  echo "ERRORE: IPA non trovato in $EXPORT_DIR"
  exit 1
fi

cp -f "$BUILT_IPA" "$OUTPUT_IPA"

echo
echo "============================================"
echo "  BUILD OK"
echo "  $OUTPUT_IPA"
echo "============================================"
echo
echo "Installazione su iPhone fisico:"
echo "  A) Xcode ? Window ? Devices and Simulators ? trascina l'IPA"
echo "  B) Apple Configurator 2 ? Aggiungi app"
echo "  C) Cavo USB: ./kmp-dev.sh ios-device (se collegato)"
echo
if [[ "$EXPORT_METHOD" == "development" ]]; then
  echo "Nota: IPA development richiede il dispositivo registrato nel tuo Team Apple."
fi
if [[ "$EXPORT_METHOD" == "ad-hoc" ]]; then
  echo "Nota: ad-hoc richiede UDID del telefono nel portale Apple Developer."
fi
echo
