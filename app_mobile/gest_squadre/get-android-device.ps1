# Restituisce l'id del primo device Android (stdout) per run-cell.bat
$ErrorActionPreference = 'SilentlyContinue'

try {
  $raw = flutter devices --machine 2>$null
  if ($raw) {
    $list = $raw | ConvertFrom-Json
    if ($list -isnot [array]) {
      $list = @($list)
    }
    $android = $list | Where-Object { $_.targetPlatform -match 'android' } | Select-Object -First 1
    if ($android -and $android.id) {
      Write-Output ($android.id.ToString().Trim())
      exit 0
    }
  }
} catch {
  # fallback adb
}

$line = adb devices 2>$null | Where-Object { $_ -match '^\S+\s+device\s*$' } | Select-Object -First 1
if ($line) {
  $id = ($line -split '\s+', 2)[0].Trim()
  if ($id) {
    Write-Output $id
    exit 0
  }
}

exit 1
