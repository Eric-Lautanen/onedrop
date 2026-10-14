# dev-only: find the ONE DROP Edge app window and report its placement
Add-Type '
using System;
using System.Runtime.InteropServices;
public class Win32Query {
  [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT p);
  [StructLayout(LayoutKind.Sequential)] public struct WINDOWPLACEMENT {
    public int length; public int flags; public int showCmd;
    public POINT ptMinPosition; public POINT ptMaxPosition; public RECT rcNormalPosition;
  }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
}'
$place = New-Object Win32Query+WINDOWPLACEMENT
$found = $false
Get-Process msedge -ErrorAction SilentlyContinue | ForEach-Object {
  if (-not $found -and $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle) {
    $place.length = [System.Runtime.InteropServices.Marshal]::SizeOf($place)
    [Win32Query]::GetWindowPlacement($_.MainWindowHandle, [ref]$place) | Out-Null
    # showCmd: 3 = SW_SHOWMAXIMIZED, 1 = normal
    Write-Host ('window found: showCmd=' + $place.showCmd + ' (3 = maximized)')
    Write-Host ('rect: ' + $place.rcNormalPosition.L + ',' + $place.rcNormalPosition.T + ' -> ' + $place.rcNormalPosition.R + ',' + $place.rcNormalPosition.B)
    $found = $true
  }
}
if (-not $found) { Write-Host 'no ONE DROP edge window found' }
