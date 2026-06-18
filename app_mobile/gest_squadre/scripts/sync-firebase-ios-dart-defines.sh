#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
defines_path="$root/dart-defines.json"
expected_bundle="com.ansmi.gestsquadre"

plist_path=""
for candidate in \
  "$root/assets/firebase/GoogleService-Info.plist" \
  "$root/ios/GoogleService-Info.plist"; do
  if [[ -f "$candidate" ]]; then
    plist_path="$candidate"
    break
  fi
done

if [[ -z "$plist_path" ]]; then
  echo "ERRORE: manca GoogleService-Info.plist"
  echo "Copialo in: $root/assets/firebase/GoogleService-Info.plist"
  exit 1
fi

python3 - "$plist_path" "$defines_path" "$expected_bundle" <<'PY'
import json
import re
import sys

plist_path, defines_path, expected_bundle = sys.argv[1:4]
plist = open(plist_path, encoding="utf-8").read()

def get(key: str) -> str:
    match = re.search(rf"<key>{re.escape(key)}</key>\s*<string>([^<]+)</string>", plist)
    return match.group(1).strip() if match else ""

api_key = get("API_KEY")
app_id = get("GOOGLE_APP_ID")
bundle_id = get("BUNDLE_ID")
sender_id = get("GCM_SENDER_ID")
project_id = get("PROJECT_ID")
bucket = get("STORAGE_BUCKET")

if not api_key or not app_id:
    raise SystemExit(f"Plist incompleto: {plist_path}")

if bundle_id and bundle_id != expected_bundle:
    print(f"ATTENZIONE: BUNDLE_ID '{bundle_id}' (atteso '{expected_bundle}')")

if not __import__("pathlib").Path(defines_path).exists():
    import shutil
    shutil.copy(__import__("pathlib").Path(defines_path).with_name("dart-defines.example.json"), defines_path)

with open(defines_path, encoding="utf-8-sig") as f:
    defines = json.load(f)

defines["FIREBASE_IOS_API_KEY"] = api_key
defines["FIREBASE_IOS_APP_ID"] = app_id
if sender_id:
    defines["FIREBASE_MESSAGING_SENDER_ID"] = sender_id
if project_id:
    defines["FIREBASE_PROJECT_ID"] = project_id
if bucket:
    defines["FIREBASE_STORAGE_BUCKET"] = bucket

with open(defines_path, "w", encoding="utf-8") as f:
    json.dump(defines, f, indent=4, ensure_ascii=False)
    f.write("\n")

print(f"OK: dart-defines.json aggiornato con Firebase iOS ({expected_bundle}).")
print(f"    FIREBASE_IOS_APP_ID = {app_id}")
print(f"    plist: {plist_path}")
PY
