#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== gestSQUADRE iOS — diagnostica build ==="
echo "Cartella: $ROOT"
echo

fail() {
  echo "ERRORE: $1" >&2
  exit 1
}

echo "--- 1) Java ---"
if ! command -v java >/dev/null 2>&1; then
  fail "Java non trovato. Installa JDK 17 (Android Studio lo include)."
fi
java -version
echo

echo "--- 2) dart-defines / Config ---"
DEFINES="$ROOT/../gest_squadre/dart-defines.json"
if [[ ! -f "$DEFINES" ]]; then
  fail "Manca $DEFINES — copialo dal PC Windows."
fi
bash "$ROOT/iosApp/sync-config.sh"
echo

echo "--- 3) Gradle wrapper ---"
[[ -f "$ROOT/gradlew" ]] || fail "Manca gradlew in $ROOT"
chmod +x "$ROOT/gradlew"
echo "OK: gradlew eseguibile"
echo

echo "--- 4) Android SDK (serve anche per build iOS KMP) ---"
LP="$ROOT/local.properties"
if [[ ! -f "$LP" ]]; then
  SDK_CANDIDATES=(
    "$HOME/Library/Android/sdk"
    "$HOME/Android/Sdk"
  )
  for sdk in "${SDK_CANDIDATES[@]}"; do
    if [[ -d "$sdk" ]]; then
      printf 'sdk.dir=%s\n' "$sdk" >"$LP"
      echo "Creato local.properties → $sdk"
      break
    fi
  done
fi
if [[ -f "$LP" ]]; then
  cat "$LP"
else
  echo "ATTENZIONE: local.properties assente."
  echo "Apri Android Studio una volta (Tools → SDK Manager) oppure crea:"
  echo "  echo 'sdk.dir=$HOME/Library/Android/sdk' > $LP"
fi
echo

echo "--- 5) Build framework Kotlin (stesso comando di Xcode) ---"
export OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED=NO
./gradlew :shared:embedAndSignAppleFrameworkForXcode \
  -PXCODE_CONFIGURATION=Debug \
  -PXCODE_SDK_NAME=iphonesimulator \
  -PXCODE_ARCHS=arm64 \
  --stacktrace

FW="$ROOT/shared/build/xcode-frameworks/Debug/iphonesimulator/shared.framework"
if [[ -d "$FW" ]]; then
  echo
  echo "OK: framework generato → $FW"
  echo "Ora in Xcode: Product → Clean Build Folder (⇧⌘K) poi Run (⌘R)"
else
  fail "Framework non trovato dopo Gradle."
fi
