# Copia app-release.apk -> gestSQUADRE_1.0.xx.apk (versione da pubspec.yaml)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

$content = Get-Content -LiteralPath (Join-Path $root 'pubspec.yaml') -Raw
$m = [regex]::Match($content, '(?m)^version:\s*(?<ver>\d+\.\d+\.\d+)')
if (-not $m.Success) {
  Write-Host 'Avviso: versione non trovata in pubspec.yaml, salto gestSQUADRE_1.0.xx.apk'
  exit 0
}

$v = $m.Groups['ver'].Value
$src = Join-Path $root 'build\app\outputs\flutter-apk\app-release.apk'
$dstDir = Split-Path $src -Parent
$dst = Join-Path $dstDir "gestSQUADRE_$v.apk"

if (-not (Test-Path -LiteralPath $src)) {
  Write-Host "ERRORE: manca $src"
  exit 1
}

Copy-Item -LiteralPath $src -Destination $dst -Force
Write-Host "Copia con nome progetto: $dst"
