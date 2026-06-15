#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBX="$ROOT/iosApp/iosApp.xcodeproj/project.pbxproj"
WORKSPACE="$ROOT/iosApp/iosApp.xcodeproj/project.xcworkspace"

echo "=== gestSQUADRE iOS repair ==="
cd "$ROOT/.."
REPO_ROOT="$(pwd)"
echo "Repo: $REPO_ROOT"

echo "1) Aggiorno da GitHub (scarta modifiche locali ai file tracciati)..."
git fetch origin
git reset --hard origin/main

echo "2) Rimuovo workspace Xcode corrotto (se presente)..."
rm -rf "$WORKSPACE"
rm -rf "$ROOT/iosApp/iosApp.xcodeproj/xcuserdata"

echo "3) Config Supabase..."
bash "$ROOT/iosApp/sync-config.sh"

echo "4) Verifico project.pbxproj..."
if ! plutil -lint "$PBX" >/dev/null 2>&1; then
  echo "ATTENZIONE: plutil segnala un problema su project.pbxproj"
  plutil -lint "$PBX" || true
else
  echo "OK: project.pbxproj valido"
fi

echo "5) Apro Xcode sul file .xcodeproj (non .xcworkspace)..."
open "$ROOT/iosApp/iosApp.xcodeproj"
echo "Fatto. In Xcode: simulatore iPhone → Product → Run (⌘R)"
