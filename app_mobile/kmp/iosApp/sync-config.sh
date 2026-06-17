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

python3 - "$DEFINES" "$OUT" "$JSON_OUT" "$FIREBASE_OUT" <<'PY'
import json
import sys

defines_path, out_path, json_out_path, firebase_out_path = sys.argv[1:5]
with open(defines_path, encoding="utf-8-sig") as f:
    data = json.load(f)

url = data.get("SUPABASE_URL", "").strip()
key = data.get("SUPABASE_ANON_KEY", "").strip()
if not url or not key:
    raise SystemExit("SUPABASE_URL e SUPABASE_ANON_KEY obbligatori in dart-defines.json")

def xc_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'

content = f"""// Generato da sync-config.sh — non modificare a mano
SUPABASE_URL = {xc_quote(url)}
SUPABASE_ANON_KEY = {xc_quote(key)}
PRODUCT_BUNDLE_IDENTIFIER = com.ansmi.gestsquadre
MARKETING_VERSION = 1.0.2
CURRENT_PROJECT_VERSION = 1

#include? "Signing.xcconfig"
"""
with open(out_path, "w", encoding="utf-8") as f:
    f.write(content)

with open(json_out_path, "w", encoding="utf-8") as f:
    json.dump(
        {"SUPABASE_URL": url, "SUPABASE_ANON_KEY": key},
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
ios_id = firebase_payload["FIREBASE_IOS_APP_ID"]
if ios_id:
    print(f"    FIREBASE_IOS_APP_ID = {ios_id}")
else:
    print("    AVVISO: FIREBASE_IOS_APP_ID vuoto — push iOS disabilitata fino a configurazione Firebase.")
PY
