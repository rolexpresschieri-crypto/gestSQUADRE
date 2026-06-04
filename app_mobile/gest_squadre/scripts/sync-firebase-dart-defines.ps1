# Aggiorna dart-defines.json da android/app/google-services.json (package com.ansmi.gest_squadre)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$gsPath = Join-Path $root "android\app\google-services.json"
$definesPath = Join-Path $root "dart-defines.json"

if (-not (Test-Path $gsPath)) {
  Write-Host "Manca: $gsPath"
  Write-Host "Registra l'app Android com.ansmi.gest_squadre in Firebase e scarica google-services.json."
  exit 1
}

$gs = Get-Content $gsPath -Raw | ConvertFrom-Json
$pkg = "com.ansmi.gest_squadre"
$client = $gs.client | Where-Object { $_.client_info.android_client_info.package_name -eq $pkg } | Select-Object -First 1
if (-not $client) {
  Write-Host "Nel JSON non c'e' il package $pkg. Aggiungi l'app in Firebase Console."
  exit 1
}

$apiKey = $client.api_key[0].current_key
$appId = $client.client_info.mobilesdk_app_id
$projectId = $gs.project_info.project_id
$senderId = $gs.project_info.project_number
$bucket = $gs.project_info.storage_bucket

if (-not (Test-Path $definesPath)) {
  Copy-Item (Join-Path $root "dart-defines.example.json") $definesPath
}
$defines = Get-Content $definesPath -Raw | ConvertFrom-Json
$defines.FIREBASE_ANDROID_API_KEY = $apiKey
$defines.FIREBASE_ANDROID_APP_ID = $appId
$defines.FIREBASE_MESSAGING_SENDER_ID = "$senderId"
$defines.FIREBASE_PROJECT_ID = $projectId
$defines.FIREBASE_STORAGE_BUCKET = $bucket
$defines | ConvertTo-Json -Depth 5 | Set-Content $definesPath -Encoding UTF8
Write-Host "OK: dart-defines.json aggiornato con Firebase ($pkg)."
