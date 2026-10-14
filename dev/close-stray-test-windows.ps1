# dev-only: several flag-test windows were opened while tuning launch-app.
# Close every ONE DROP app window except the newest (that one is the
# launcher's own and stays).
$wins = @()
Get-Process msedge -ErrorAction SilentlyContinue | ForEach-Object {
  $h = $_.MainWindowHandle
  if ($h -ne 0 -and $_.MainWindowTitle -match 'ONE DROP') {
    $wins += [pscustomobject]@{ Proc = $_; Handle = $h; Started = $_.StartTime }
  }
}
Write-Host ('ONE DROP windows: ' + $wins.Count)
$keep = $wins | Sort-Object Started | Select-Object -Last 1
$wins | Where-Object { $_.Handle -ne $keep.Handle } | ForEach-Object {
  $_.Proc.CloseMainWindow() | Out-Null
  Write-Host ('closed test window pid ' + $_.Proc.Id)
}
Write-Host ('kept pid ' + $keep.Proc.Id + ' titled "' + $keep.Proc.MainWindowTitle + '"')
