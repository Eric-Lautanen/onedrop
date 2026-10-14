# dev-only: open the game in an Edge --app window against the running
# Freebuff dev server, maximized the same way launch-app.ps1 does, so the
# maximize behavior can be confirmed without going through the desktop icon.
$edge = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe').'(default)'
$proc = Start-Process $edge -ArgumentList @(
  '--app=http://127.0.0.1:8642/index.html?v=36',
  ('--user-data-dir=' + (Join-Path $env:TEMP 'onedrop-edge-profile-test'))
) -PassThru

Add-Type '
using System;
using System.Runtime.InteropServices;
public class Win32Show {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}'
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 250
  $proc.Refresh()
  if ($proc.HasExited) { break }
  if ($proc.MainWindowHandle -ne 0) {
    [Win32Show]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null
    break
  }
}
Write-Host 'test window launched maximized -- check it, then close it'
