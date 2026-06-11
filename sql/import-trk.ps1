param(
    [Parameter(Mandatory = $true)][string]$TrkPath,
    [Parameter(Mandatory = $true)][string]$CourseCode,
    [string]$RouteCode = "",
    [string]$RouteName = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TrkPath)) {
    Write-Error "File non trovato: $TrkPath"
}

$fileName = [System.IO.Path]::GetFileNameWithoutExtension($TrkPath)
if ([string]::IsNullOrWhiteSpace($RouteCode)) {
    $RouteCode = $fileName.ToUpper()
}
# Normalizza TG_V_xx -> GT_V_xx su golf_torino (typo export Garmin)
if ($CourseCode -eq "golf_torino" -and $RouteCode -match "^TG_V_") {
    $RouteCode = $RouteCode -replace "^TG_", "GT_"
}

$lines = Get-Content -LiteralPath $TrkPath -Encoding UTF8
$colorHex = "#079B42"
$points = New-Object System.Collections.Generic.List[object]

foreach ($line in $lines) {
    if ($line -match "^C\s+(\d+)\s+(\d+)\s+(\d+)") {
        $r = [int]$Matches[1]
        $g = [int]$Matches[2]
        $b = [int]$Matches[3]
        $colorHex = "#{0:X2}{1:X2}{2:X2}" -f $r, $g, $b
    }
    if ($line -match "T\s+A\s+([\d.]+).?N\s+([\d.]+).?E") {
        $lat = [double]$Matches[1]
        $lng = [double]$Matches[2]
        $points.Add([ordered]@{ lat = $lat; lng = $lng })
    }
}

if ($points.Count -lt 2) {
    Write-Error "Nessun punto GPS valido in $TrkPath"
}

if ([string]::IsNullOrWhiteSpace($RouteName)) {
    $RouteName = $RouteCode
}

$pointsJson = ($points | ConvertTo-Json -Compress)
$escapedName = $RouteName.Replace("'", "''")
$escapedCode = $RouteCode.Replace("'", "''")
$escapedCourse = $CourseCode.Replace("'", "''")

$sql = @"
-- Import $escapedCode da $(Split-Path $TrkPath -Leaf) ($($points.Count) punti)
insert into map_routes (golf_course_id, route_code, route_name, color_hex, points)
select
  gc.id,
  '$escapedCode',
  '$escapedName',
  '$colorHex',
  '$($pointsJson.Replace("'", "''"))'::jsonb
from golf_courses gc
where gc.course_code = '$escapedCourse'
on conflict (golf_course_id, route_code) do update set
  route_name = excluded.route_name,
  color_hex = excluded.color_hex,
  points = excluded.points,
  is_enabled = true;
"@

return $sql
