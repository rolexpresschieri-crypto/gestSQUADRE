#!/usr/bin/env bash
# Compila shared.framework e lo copia dove Xcode lo cerca.
set -euo pipefail

KMP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$KMP_ROOT"
chmod +x ./gradlew

if [[ "YES" == "${OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED:-}" ]]; then
  echo "Skipping Gradle build (OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED=YES)"
  exit 0
fi

CONFIGURATION="${CONFIGURATION:-Debug}"
SDK_NAME="${SDK_NAME:-iphonesimulator}"

case "$CONFIGURATION" in
  Release|release) BUILD_TYPE="release" ;;
  *) BUILD_TYPE="debug" ;;
esac

OUT_DIR="$KMP_ROOT/shared/build/xcode-frameworks/$CONFIGURATION/$SDK_NAME"
DEST="$OUT_DIR/shared.framework"
mkdir -p "$OUT_DIR"

if [[ "$SDK_NAME" == *simulator* ]]; then
  if [[ "$BUILD_TYPE" == "release" ]]; then
    GRADLE_TASK=":shared:linkReleaseFrameworkIosSimulatorArm64"
    SRC="$KMP_ROOT/shared/build/bin/iosSimulatorArm64/releaseFramework/shared.framework"
  else
    GRADLE_TASK=":shared:linkDebugFrameworkIosSimulatorArm64"
    SRC="$KMP_ROOT/shared/build/bin/iosSimulatorArm64/debugFramework/shared.framework"
  fi
else
  if [[ "$BUILD_TYPE" == "release" ]]; then
    GRADLE_TASK=":shared:linkReleaseFrameworkIosArm64"
    SRC="$KMP_ROOT/shared/build/bin/iosArm64/releaseFramework/shared.framework"
  else
    GRADLE_TASK=":shared:linkDebugFrameworkIosArm64"
    SRC="$KMP_ROOT/shared/build/bin/iosArm64/debugFramework/shared.framework"
  fi
fi

echo "Kotlin framework:"
echo "  CONFIGURATION=$CONFIGURATION"
echo "  SDK_NAME=$SDK_NAME"
echo "  GRADLE_TASK=$GRADLE_TASK"
echo "  DEST=$DEST"

./gradlew "$GRADLE_TASK" --no-daemon

if [[ ! -d "$SRC" ]]; then
  echo "ERRORE: framework non trovato in $SRC" >&2
  exit 1
fi

rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "OK: $DEST"
