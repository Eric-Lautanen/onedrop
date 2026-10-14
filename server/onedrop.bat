@echo off
REM ---------------------------------------------------------------
REM  ONE DROP PINBALL -- desktop-app launcher (double-click me)
REM  Opens the game in an app-style window with no browser chrome.
REM  Closing that window shuts the hidden server down automatically.
REM ---------------------------------------------------------------
setlocal
set "HERE=%~dp0"
set "PWSH=powershell"
where pwsh >nul 2>nul && set "PWSH=pwsh"
start "onedrop" /min %PWSH% -NoProfile -ExecutionPolicy Bypass -File "%HERE%launch-app.ps1"
exit /b 0
