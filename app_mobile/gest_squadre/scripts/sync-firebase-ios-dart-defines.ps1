# Aggiorna dart-defines.json da GoogleService-Info.plist (bundle com.ansmi.gestsquadre)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$plistPaths = @(
  (Join-Path $root "assets\firebase\GoogleService-Info.plist"),
  (Join-Path $root "ios\GoogleService-Info.plist")
)
$definesPath = Join-Path $root "dart-defines.json"
$expectedBundle = "com.ansmi.gestsquadre"

$plistPath = $plistPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $plistPath) {
  Write-Host "Manca GoogleService-Info.plist."
  Write-Host "Scaricalo da Firebase (app iOS gestSQUADRE) e copialo in:"
  Write-Host "  $([string]::Join([Environment]::NewLine + '  ', $plistPaths))"
  exit 1
}

$plist = Get-Content $plistPath -Raw -Encoding UTF8

function Get-PlistString([string]$content, [string]$key) {
  if ($content -match "(?s)<key>$([regex]::Escape($key))</key>\s*<string>([^<]+)</string>") {
    return $Matches[1].Trim()
  }
  return $null
}

$apiKey = Get-PlistString $plist "API_KEY"
$appId = Get-PlistString $plist "GOOGLE_APP_ID"
$bundleId = Get-PlistString $plist "BUNDLE_ID"
$senderId = Get-PlistString $plist "GCM_SENDER_ID"
$projectId = Get-PlistString $plist "PROJECT_ID"
$bucket = Get-PlistString $plist "STORAGE_BUCKET"

if (-not $apiKey -or -not $appId) {
  Write-Host "Plist non valido o incompleto: $plistPath"
  exit 1
}

if ($bundleId -and $bundleId -ne $expectedBundle) {
  Write-Host "ATTENZIONE: BUNDLE_ID nel plist e' '$bundleId' (atteso '$expectedBundle')."
}

if (-not (Test-Path $definesPath)) {
  Copy-Item (Join-Path $root "dart-defines.example.json") $definesPath
}

$defines = Get-Content $definesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$defines | Add-Member -NotePropertyName FIREBASE_IOS_API_KEY -NotePropertyValue $apiKey -Force
$defines | Add-Member -NotePropertyName FIREBASE_IOS_APP_ID -NotePropertyValue $appId -Force
if ($senderId) { $defines.FIREBASE_MESSAGING_SENDER_ID = "$senderId" }
if ($projectId) { $defines.FIREBASE_PROJECT_ID = $projectId }
if ($bucket) { $defines.FIREBASE_STORAGE_BUCKET = $bucket }

$defines | ConvertTo-Json -Depth 5 | Set-Content $definesPath -Encoding UTF8
Write-Host "OK: dart-defines.json aggiornato con Firebase iOS ($expectedBundle)."
Write-Host "    FIREBASE_IOS_APP_ID = $appId"
Write-Host "    File plist: $plistPath"
