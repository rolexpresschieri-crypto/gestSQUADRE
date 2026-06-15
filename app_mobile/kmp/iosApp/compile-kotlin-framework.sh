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

echo "Kotlin framework: CONFIGURATION=$CONFIGURATION SDK_NAME=$SDK_NAME ARCHS=$ARCHS"
echo "TARGET_BUILD_DIR=$TARGET_BUILD_DIR"

./gradlew :shared:embedAndSignAppleFrameworkForXcode
