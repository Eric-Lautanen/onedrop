# Read-only: did this machine's GPU reset recently, and when?
#   Windows records a hung GPU as a LiveKernelEvent (P1 = 141,
#   VIDEO_ENGINE_TIMEOUT_DETECTED) plus a live dump under
#   C:\Windows\LiveKernelReports, and sometimes a Display 4101 "driver
#   stopped responding and has recovered". A dead browser GPU process
#   instead shows up as an Application Error 1000 from the browser.
# ASCII only: PowerShell 5.1 reads .ps1 as ANSI, so non-ASCII breaks parsing.
param([int]$Hours = 10)

Write-Output "=== adapter ==="
Get-CimInstance Win32_VideoController | ForEach-Object {
  Write-Output ("  {0}  driver {1}  at {2}x{3}" -f $_.Name, $_.DriverVersion,
    $_.CurrentHorizontalResolution, $_.CurrentVerticalResolution)
}

$since = (Get-Date).AddHours(-$Hours)

Write-Output "=== LiveKernelEvent reports (GPU hang) in the last $Hours h ==="
$app = Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=$since} -ErrorAction SilentlyContinue
$lk = $app | Where-Object { $_.Id -eq 1001 -and $_.Message -match 'LiveKernelEvent' }
if (-not $lk) { Write-Output "  (none)" }
foreach ($e in ($lk | Sort-Object TimeCreated -Descending)) {
  $m = $e.Message
  $p1 = if ($m -match 'P1:\s*(\S+)') { $matches[1] } else { '?' }
  $dump = if ($m -match '(WATCHDOG-[0-9\-]+\.dmp)') { $matches[1] } else { '' }
  Write-Output ("  {0}  P1={1}  {2}" -f $e.TimeCreated, $p1, $dump)
}

Write-Output "=== Display / AMD driver events in the last $Hours h ==="
$sys = Get-WinEvent -FilterHashtable @{LogName='System'; StartTime=$since} -ErrorAction SilentlyContinue
$disp = $sys | Where-Object { $_.ProviderName -match 'Display|amd' }
if (-not $disp) { Write-Output "  (none: no 4101 recovery event was logged)" }
foreach ($e in ($disp | Sort-Object TimeCreated -Descending)) {
  Write-Output ("  {0}  [{1}] {2} {3}" -f $e.TimeCreated, $e.Id, $e.LevelDisplayName, $e.ProviderName)
}

Write-Output "=== browser process faults in the last $Hours h ==="
$faults = $app | Where-Object { $_.Id -eq 1000 }
if (-not $faults) { Write-Output "  (none)" }
foreach ($e in ($faults | Sort-Object TimeCreated -Descending | Select-Object -First 10)) {
  Write-Output ("  {0}  {1}" -f $e.TimeCreated, (($e.Message -split "`r?`n")[0]))
}

Write-Output "=== live dumps on disk (listing needs elevation) ==="
$dumps = Get-ChildItem 'C:\WINDOWS\LiveKernelReports' -Recurse -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 15
if (-not $dumps) { Write-Output "  (not readable without elevation)" }
foreach ($f in $dumps) {
  Write-Output ("  {0}  {1} KB  {2}" -f $f.LastWriteTime, [int]($f.Length / 1KB), $f.FullName)
}
