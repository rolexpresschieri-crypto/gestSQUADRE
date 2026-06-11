param(
    [Parameter(Mandatory = $true)][string]$CourseCode,
    [Parameter(Mandatory = $true)][string]$TrkDir,
    [Parameter(Mandatory = $true)][string]$OutFile
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$importOne = Join-Path $scriptDir "import-trk.ps1"

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("-- Eseguire su Supabase dopo map_routes.sql")
[void]$sb.AppendLine("")

$files = Get-ChildItem -LiteralPath $TrkDir -Filter "*.trk" | Sort-Object Name
if ($files.Count -eq 0) {
    Write-Error "Nessun file .trk in $TrkDir"
}

foreach ($file in $files) {
    $sql = & $importOne -TrkPath $file.FullName -CourseCode $CourseCode
    [void]$sb.AppendLine($sql)
    [void]$sb.AppendLine("")
}

[System.IO.File]::WriteAllText($OutFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: $OutFile ($($files.Count) vie)"
