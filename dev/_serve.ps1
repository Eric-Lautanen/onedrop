$ErrorActionPreference = 'Stop'
$root = 'C:\Users\tonyb\OneDrive\Desktop\Games\onedrop'
$h = New-Object System.Net.HttpListener
$h.Prefixes.Add('http://127.0.0.1:8642/')
$h.Start()
Set-Content -Path (Join-Path $env:TEMP 'dmdsrv.flag') -Value 'ready'
try {
  while ($h.IsListening) {
    $c = $h.GetContext()
    $p = $c.Request.Url.AbsolutePath.TrimStart('/')
    if ($p -eq '') { $p = 'index.html' }
    $f = Join-Path $root $p
    if (Test-Path $f -PathType Leaf) {
      $ct = 'application/octet-stream'
      switch -Wildcard ($f) {
        '*.css' { $ct = 'text/css' }
        '*.js'  { $ct = 'text/javascript' }
        '*.png' { $ct = 'image/png' }
        '*.jpg' { $ct = 'image/jpeg' }
        '*.html'{ $ct = 'text/html' }
      }
      $b = [IO.File]::ReadAllBytes($f)
      $c.Response.ContentType = $ct
      $c.Response.ContentLength64 = $b.Length
      $c.Response.Headers['Cache-Control'] = 'no-store'
      $c.Response.OutputStream.Write($b, 0, $b.Length)
      $c.Response.OutputStream.Close()
    } else {
      $c.Response.StatusCode = 404
      $c.Response.Close()
    }
  }
} finally { $h.Stop() }
