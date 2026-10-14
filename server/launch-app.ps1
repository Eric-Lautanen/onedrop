<#
  ONE DROP PINBALL -- app launcher (called by onedrop.bat)
  ========================================================
  Starts the static server hidden, waits for it to answer, then opens the
  game in an Edge --app window (borderless, no address bar). The server
  runs with -WaitWindow: when the app window closes, the page stops
  pinging /ping and the server's idle watchdog (20 s) shuts it down.

  -Test   verifies the whole chain WITHOUT opening a window (for CI/dev).
#>
param([switch]$Test)
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here

function Get-FreePort([int]$start) {
  for ($p = $start; $p -lt ($start + 40); $p++) {
    try {
      $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
      $l.Start(); $l.Stop(); return $p
    } catch { }
  }
  return 0
}

$port = Get-FreePort 8103
if ($port -eq 0) { throw "no free port near 8103" }

# 1. hidden server. One string so quoted paths stay intact.
$serverArgs = '-NoProfile -ExecutionPolicy Bypass -File "{0}\serve.ps1" -Port {1} -NoBrowser -WaitWindow -Root "{2}"' -f $here, $port, $repo
Start-Process powershell -WindowStyle Hidden -ArgumentList $serverArgs | Out-Null

# 2. wait until it answers
$url = "http://127.0.0.1:$port/"
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 2 | Out-Null
    $up = $true; break
  } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $up) { throw "server did not come up at $url" }

if ($Test) {
  # clean up the hidden server before reporting
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*serve.ps1*' -and $_.CommandLine -like "* $port *" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Write-Host "TEST-OK $url"
  exit 0
}

# 3. Edge app window. msedge.exe is found through App Paths, which works
#    even when it is not on PATH (Windows always has Edge).
$edge = $null
try {
  $edge = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe' -ErrorAction Stop).'(default)'
} catch { }
if (-not $edge -or -not $edge) {
  $edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
$proc = Start-Process $edge -ArgumentList @(
  ('--app=' + $url),
  ('--user-data-dir=' + (Join-Path $env:TEMP 'onedrop-edge-profile'))
) -PassThru

# 4. maximize the app window (not fullscreen). --start-maximized is
#    flaky in --app mode, and Edge hands starts off to a running browser
#    instance, so the Process object we launched may not own the window
#    at all. The dependable way: poll ALL msedge processes for the game
#    window by its page title, then ShowWindow(SW_SHOWMAXIMIZED).
Add-Type '
using System;
using System.Runtime.InteropServices;
public class Win32Show {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}'
$SW_MAXIMIZE = 3
$done = $false
for ($i = 0; $i -lt 60 -and -not $done; $i++) {
  Start-Sleep -Milliseconds 500
  Get-Process msedge -ErrorAction SilentlyContinue | ForEach-Object {
    if (-not $done -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'ONE DROP') {
      [Win32Show]::ShowWindow($_.MainWindowHandle, $SW_MAXIMIZE) | Out-Null
      $done = $true
    }
  }
}

exit 0
