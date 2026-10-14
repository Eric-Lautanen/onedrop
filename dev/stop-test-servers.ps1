# dev-only: stop any leftover hidden serve.ps1 watchdogs from testing
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -match 'serve\.ps1' -and $_.CommandLine -match 'WaitWindow' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('stopped ' + $_.ProcessId) }
Write-Host 'cleanup done'
