#!/usr/bin/env bash
# Usato da Xcode (Run Script) e da diagnose-build.sh sul Mac.
set -euo pipefail

KMP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$KMP_ROOT"
chmod +x ./gradlew

if [[ "YES" == "${OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED:-}" ]]; then
  echo "Skipping Gradle build (OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED=YES)"
  exit 0
fi

export CONFIGURATION="${CONFIGURATION:-Debug}"
export SDK_NAME="${SDK_NAME:-iphonesimulator}"
export ARCHS="${ARCHS:-arm64}"
export TARGET_BUILD_DIR="${TARGET_BUILD_DIR:-$KMP_ROOT/shared/build/xcode-frameworks/$CONFIGURATION/$SDK_NAME}"
export FRAMEWORKS_FOLDER_PATH="${FRAMEWORKS_FOLDER_PATH:-$TARGET_BUILD_DIR}"
mkdir -p "$TARGET_BUILD_DIR"

case "$CONFIGURATION" in
  Release|release)
    export KOTLIN_FRAMEWORK_BUILD_TYPE="${KOTLIN_FRAMEWORK_BUILD_TYPE:-release}"
    ;;
  *)
    export KOTLIN_FRAMEWORK_BUILD_TYPE="${KOTLIN_FRAMEWORK_BUILD_TYPE:-debug}"
    ;;
esac

echo "Kotlin framework:"
echo "  CONFIGURATION=$CONFIGURATION"
echo "  SDK_NAME=$SDK_NAME"
echo "  ARCHS=$ARCHS"
echo "  KOTLIN_FRAMEWORK_BUILD_TYPE=$KOTLIN_FRAMEWORK_BUILD_TYPE"
echo "  TARGET_BUILD_DIR=$TARGET_BUILD_DIR"

./gradlew :shared:embedAndSignAppleFrameworkForXcode

DEST="$TARGET_BUILD_DIR/shared.framework"
if [[ -d "$DEST" ]]; then
  echo "OK: $DEST"
  exit 0
fi

echo "embedAndSign non ha creato il framework — fallback link Gradle..."

if [[ "$SDK_NAME" == *simulator* ]]; then
  if [[ "$KOTLIN_FRAMEWORK_BUILD_TYPE" == "release" ]]; then
    ./gradlew :shared:linkReleaseFrameworkIosSimulatorArm64
    SRC="$KMP_ROOT/shared/build/bin/iosSimulatorArm64/releaseFramework/shared.framework"
  else
    ./gradlew :shared:linkDebugFrameworkIosSimulatorArm64
    SRC="$KMP_ROOT/shared/build/bin/iosSimulatorArm64/debugFramework/shared.framework"
  fi
else
  if [[ "$KOTLIN_FRAMEWORK_BUILD_TYPE" == "release" ]]; then
    ./gradlew :shared:linkReleaseFrameworkIosArm64
    SRC="$KMP_ROOT/shared/build/bin/iosArm64/releaseFramework/shared.framework"
  else
    ./gradlew :shared:linkDebugFrameworkIosArm64
    SRC="$KMP_ROOT/shared/build/bin/iosArm64/debugFramework/shared.framework"
  fi
fi

if [[ ! -d "$SRC" ]]; then
  echo "ERRORE: framework non trovato in $SRC" >&2
  exit 1
fi

rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "OK: framework copiato in $DEST"
