<#
  ONE DROP PINBALL  --  PowerShell launcher (no Python, no Node required)
  ======================================================================
  Windows ships with PowerShell, so this serves the game even on a
  machine with nothing else installed.

      powershell -ExecutionPolicy Bypass -File serve.ps1
      powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000
      powershell -ExecutionPolicy Bypass -File serve.ps1 -NoBrowser
      powershell -ExecutionPolicy Bypass -File serve.ps1 -Root ..\Pinball
#>
param(
  [int]$Port = 8080,
  [string]$Root = "",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Find-Root([string]$explicit) {
  if ($explicit -and $explicit.Trim() -ne "") {
    return (Resolve-Path $explicit).Path
  }
  $cands = @(
    (Join-Path $here 'Pinball'),
    $here,
    (Join-Path (Split-Path -Parent $here) 'Pinball')
  )
  foreach ($c in $cands) {
    if (Test-Path (Join-Path $c 'index.html')) { return (Resolve-Path $c).Path }
  }
  return $null
}

function Get-FreePort([int]$start) {
  for ($p = $start; $p -lt ($start + 40); $p++) {
    try {
      $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
      $l.Start(); $l.Stop(); return $p
    } catch { }
  }
  return 0
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.bmp'  = 'image/bmp'
  '.webp' = 'image/webp'
  '.mp3'  = 'audio/mpeg'
  '.ogg'  = 'audio/ogg'
  '.wav'  = 'audio/wav'
  '.txt'  = 'text/plain; charset=utf-8'
  '.wasm' = 'application/wasm'
  '.map'  = 'application/json'
}

function Send-Response($stream, [int]$code, [string]$text, [string]$ctype, [byte[]]$body, [bool]$headOnly) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("HTTP/1.1 $code $text`r`n")
  [void]$sb.Append("Content-Type: $ctype`r`n")
  [void]$sb.Append("Content-Length: $($body.Length)`r`n")
  [void]$sb.Append("Cache-Control: no-store, no-cache, must-revalidate, max-age=0`r`n")
  [void]$sb.Append("Access-Control-Allow-Origin: *`r`n")
  [void]$sb.Append("Connection: close`r`n`r`n")
  $head = [System.Text.Encoding]::ASCII.GetBytes($sb.ToString())
  $stream.Write($head, 0, $head.Length)
  if (-not $headOnly -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Handle-Client($client, [string]$root) {
  try {
    $client.ReceiveTimeout = 4000
    $client.SendTimeout = 8000
    $stream = $client.GetStream()

    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $line = $reader.ReadLine()
    if (-not $line) { return }
    $parts = $line.Split(' ')
    if ($parts.Length -lt 2) { return }
    $method = $parts[0].ToUpper()
    $rawPath = $parts[1]

    while ($true) {
      $h = $reader.ReadLine()
      if ($null -eq $h -or $h -eq '') { break }
    }

    $path = $rawPath.Split('?')[0]
    if ($path -eq '/favicon.ico') {
      Send-Response $stream 204 'No Content' 'image/x-icon' ([byte[]]@()) $false
      return
    }
    $path = [System.Uri]::UnescapeDataString($path)
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $rel = $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $full = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

    if (-not $full.StartsWith($root)) {
      Send-Response $stream 403 'Forbidden' 'text/plain' ([System.Text.Encoding]::UTF8.GetBytes('forbidden')) $false
      return
    }
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
      Send-Response $stream 404 'Not Found' 'text/plain' ([System.Text.Encoding]::UTF8.GetBytes("404 $rel")) $false
      Write-Host "  404  $rel"
      return
    }

    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $ctype = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($full)
    $headOnly = ($method -eq 'HEAD')
    Send-Response $stream 200 'OK' $ctype $bytes $headOnly
    Write-Host ("  200  {0,-34} {1,9:N0} bytes" -f $rel, $bytes.Length)
  } catch {
    # a browser hanging up is normal; never let it kill the server
  } finally {
    try { $client.Close() } catch { }
  }
}

# ------------------------------------------------------------------ main
$root = Find-Root $Root
if (-not $root) {
  Write-Host "Could not find index.html next to this script." -ForegroundColor Red
  Write-Host "Try:  powershell -File serve.ps1 -Root path\to\Pinball"
  exit 1
}

$port = Get-FreePort $Port
if ($port -eq 0) { Write-Host "No free port near $Port" -ForegroundColor Red; exit 1 }

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
try {
  $listener.Start()
} catch {
  Write-Host "Could not bind port $port : $_" -ForegroundColor Red
  exit 1
}

$url = "http://127.0.0.1:$port/"

Write-Host ""
Write-Host "  ____  _  _ ___    ___  ___  ___  ___" -ForegroundColor Yellow
Write-Host " / __ \| \| | __|  |   \| _ \/ _ \| _ \" -ForegroundColor Green
Write-Host "| (_) | .` | _|   | |) |   / (_) |  _/" -ForegroundColor Red
Write-Host " \___/|_|\_|___|  |___/|_|_\\___/|_|" -ForegroundColor Yellow
Write-Host "  R O O T S   *   D U B   *   S K A N K" -ForegroundColor Green
Write-Host ""
Write-Host "  serving : $root"
Write-Host "  address : $url"
Write-Host "  stop    : Ctrl+C"
Write-Host ""
Write-Host "  Z / LEFT = left flipper    / / RIGHT = right flipper"
Write-Host "  SPACE hold + release = plunge     A / D = nudge"
Write-Host "  M = sound    P = pause    F = fullscreen"
Write-Host ""

if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    Handle-Client $client $root
  }
} finally {
  $listener.Stop()
  Write-Host "`n  later, dread. one love." -ForegroundColor Green
}
