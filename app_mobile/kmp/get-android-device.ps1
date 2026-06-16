# Primo device Android via adb (KMP install, senza Flutter).
$ErrorActionPreference = 'SilentlyContinue'

$lines = adb devices 2>$null
if (-not $lines) {
  exit 1
}

foreach ($line in $lines) {
  if ($line -match '^\s*(\S+)\s+device\s*$') {
    Write-Output $Matches[1]
    exit 0
  }
}

exit 1
