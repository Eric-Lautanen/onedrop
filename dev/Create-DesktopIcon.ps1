<#
  ONE DROP PINBALL -- desktop icon installer
  ==========================================
  Creates "ONE DROP Pinball" on the user's Desktop. Double-clicking it:
    1. starts the local server hidden (no console window),
    2. opens the game in a borderless app-style window (Edge --app mode),
    3. shuts the server down when that window closes.

  Run once:  powershell -ExecutionPolicy Bypass -File Create-DesktopIcon.ps1
#>
$ErrorActionPreference = 'Stop'

$dev  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $dev
$bat  = Join-Path $repo 'server\onedrop.bat'
$ico  = Join-Path $repo 'server\onedrop.ico'

if (-not (Test-Path $bat)) { throw "launcher not found: $bat" }
if (-not (Test-Path $ico)) { throw "icon not found: $ico (run dev\make_desktop_icon.ps1 first)" }

$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'ONE DROP Pinball.lnk'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath       = $bat

$lnk.WorkingDirectory = $repo
$lnk.IconLocation     = "$ico,0"
$lnk.Description       = 'ONE DROP reggae pinball -- local game launcher'
$lnk.WindowStyle       = 7   # minimized: the console flash stays out of the way
$lnk.Save()

Write-Host "Desktop icon created: $lnkPath"
Write-Host "Double-click it to play. Closing the game window stops the server."
