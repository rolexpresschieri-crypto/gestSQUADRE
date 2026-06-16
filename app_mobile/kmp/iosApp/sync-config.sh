#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFINES="$ROOT/../gest_squadre/dart-defines.json"
OUT="$ROOT/iosApp/Configuration/Config.xcconfig"

if [[ ! -f "$DEFINES" ]]; then
  echo "ERRORE: manca $DEFINES"
  echo "Copia dart-defines.example.json in gest_squadre/dart-defines.json"
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

python3 - "$DEFINES" "$OUT" <<'PY'
import json
import sys

defines_path, out_path = sys.argv[1], sys.argv[2]
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
MARKETING_VERSION = 1.0.15
CURRENT_PROJECT_VERSION = 15
"""
with open(out_path, "w", encoding="utf-8") as f:
    f.write(content)

print(f"OK: {out_path}")
PY
