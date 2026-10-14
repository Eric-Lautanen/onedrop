@echo off
REM ---------------------------------------------------------------
REM  ONE DROP PINBALL  --  launcher (Windows)
REM  Double-click this file, or run it from the Games folder:
REM      serve.bat
REM  Extra arguments are passed through, e.g.  serve.bat --port 9000
REM  Uses Python when available, otherwise PowerShell.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"
title ONE DROP PINBALL - server

set "PY="
where python >nul 2>nul && set "PY=python"
if not defined PY ( where py >nul 2>nul && set "PY=py" )
if not defined PY ( where python3 >nul 2>nul && set "PY=python3" )

if defined PY (
  %PY% serve.py %*
  echo.
  echo Server stopped.
  pause
  exit /b 0
)

echo Python was not found - using the built-in PowerShell server instead.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
pause
