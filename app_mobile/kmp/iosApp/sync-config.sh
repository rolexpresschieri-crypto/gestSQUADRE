#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFINES="$ROOT/../gest_squadre/dart-defines.json"
OUT="$ROOT/iosApp/Configuration/Config.xcconfig"
JSON_OUT="$ROOT/iosApp/iosApp/supabase-config.json"
FIREBASE_OUT="$ROOT/iosApp/iosApp/firebase-config.json"

if [[ ! -f "$DEFINES" ]]; then
  echo "ERRORE: manca $DEFINES"
  echo "Copia dart-defines.json dal PC Windows in app_mobile/gest_squadre/"
  exit 1
fi

mkdir -p "$(dirname "$OUT")" "$(dirname "$JSON_OUT")" "$(dirname "$FIREBASE_OUT")"

GRADLE="$ROOT/androidApp/build.gradle.kts"
if [[ ! -f "$GRADLE" ]]; then
  echo "ERRORE: manca $GRADLE (versione iOS allineata ad Android)"
  exit 1
fi

python3 - "$DEFINES" "$OUT" "$JSON_OUT" "$FIREBASE_OUT" "$GRADLE" <<'PY'
import json
import re
import sys

defines_path, out_path, json_out_path, firebase_out_path, gradle_path = sys.argv[1:6]
with open(defines_path, encoding="utf-8-sig") as f:
    data = json.load(f)

url = data.get("SUPABASE_URL", "").strip()
key = data.get("SUPABASE_ANON_KEY", "").strip()
toc_backend = data.get("TOC_BACKEND_URL", "https://gest-squadre.vercel.app").strip()
if not url or not key:
    raise SystemExit("SUPABASE_URL e SUPABASE_ANON_KEY obbligatori in dart-defines.json")

with open(gradle_path, encoding="utf-8") as f:
    gradle = f.read()
marketing_match = re.search(r'versionName\s*=\s*"([^"]+)"', gradle)
build_match = re.search(r'versionCode\s*=\s*(\d+)', gradle)
if not marketing_match or not build_match:
    raise SystemExit(f"versionName/versionCode non trovati in {gradle_path}")
marketing_version = marketing_match.group(1)
current_project_version = build_match.group(1)

def xc_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'

content = f"""// Generato da sync-config.sh — non modificare a mano
SUPABASE_URL = {xc_quote(url)}
SUPABASE_ANON_KEY = {xc_quote(key)}
PRODUCT_BUNDLE_IDENTIFIER = com.ansmi.gestsquadre
MARKETING_VERSION = {marketing_version}
CURRENT_PROJECT_VERSION = {current_project_version}

#include? "Signing.xcconfig"
"""
with open(out_path, "w", encoding="utf-8") as f:
    f.write(content)

with open(json_out_path, "w", encoding="utf-8") as f:
    json.dump(
        {
            "SUPABASE_URL": url,
            "SUPABASE_ANON_KEY": key,
            "TOC_BACKEND_URL": toc_backend,
        },
        f,
        indent=2,
        ensure_ascii=False,
    )
    f.write("\n")

firebase_payload = {
    "FIREBASE_PROJECT_ID": data.get("FIREBASE_PROJECT_ID", "").strip(),
    "FIREBASE_IOS_APP_ID": data.get("FIREBASE_IOS_APP_ID", "").strip(),
    "FIREBASE_IOS_API_KEY": data.get("FIREBASE_IOS_API_KEY", "").strip(),
    "FIREBASE_MESSAGING_SENDER_ID": data.get("FIREBASE_MESSAGING_SENDER_ID", "").strip(),
    "FIREBASE_STORAGE_BUCKET": data.get("FIREBASE_STORAGE_BUCKET", "").strip(),
}
with open(firebase_out_path, "w", encoding="utf-8") as f:
    json.dump(firebase_payload, f, indent=2, ensure_ascii=False)
    f.write("\n")

with open(out_path, encoding="utf-8") as f:
    written = f.read()
if url not in written:
    raise SystemExit(
        "Config.xcconfig generato ma SUPABASE_URL troncato. "
        "Controlla dart-defines.json e le virgolette in xcconfig."
    )
if ".supabase.co" not in url:
    raise SystemExit("SUPABASE_URL non sembra un endpoint Supabase valido.")

print(f"OK: {out_path}")
print(f"OK: {json_out_path}")
print(f"OK: {firebase_out_path}")
print(f"    SUPABASE_URL = {url}")
print(f"    MARKETING_VERSION = {marketing_version} ({current_project_version})")
ios_id = firebase_payload["FIREBASE_IOS_APP_ID"]
if ios_id:
    print(f"    FIREBASE_IOS_APP_ID = {ios_id}")
else:
    print("    AVVISO: FIREBASE_IOS_APP_ID vuoto — push iOS disabilitata fino a configurazione Firebase.")
PY

ICON_SRC="$ROOT/../gest_squadre/assets/app_icon.png"
ICON_DEST="$ROOT/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset"
if [[ -f "$ICON_SRC" && -d "$ICON_DEST" ]]; then
  gen_icon() { sips -z "$2" "$2" "$ICON_SRC" --out "$ICON_DEST/$1" >/dev/null; }
  gen_icon "Icon-App-20x20@1x.png" 20
  gen_icon "Icon-App-20x20@2x.png" 40
  gen_icon "Icon-App-20x20@3x.png" 60
  gen_icon "Icon-App-29x29@1x.png" 29
  gen_icon "Icon-App-29x29@2x.png" 58
  gen_icon "Icon-App-29x29@3x.png" 87
  gen_icon "Icon-App-40x40@1x.png" 40
  gen_icon "Icon-App-40x40@2x.png" 80
  gen_icon "Icon-App-40x40@3x.png" 120
  gen_icon "Icon-App-60x60@2x.png" 120
  gen_icon "Icon-App-60x60@3x.png" 180
  gen_icon "Icon-App-76x76@1x.png" 76
  gen_icon "Icon-App-76x76@2x.png" 152
  gen_icon "Icon-App-83.5x83.5@2x.png" 167
  gen_icon "Icon-App-1024x1024@1x.png" 1024
  echo "OK: icone iOS da app_icon.png"
fi
