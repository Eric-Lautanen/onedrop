<#  dev: (re)draw server\onedrop.ico -- dark green disc, gold ring,
    a "1D" in gold, and a small green/red rasta bar. Safe to re-run. #>
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 7, 26, 18))
$ring = New-Object System.Drawing.Pen     ([System.Drawing.Color]::FromArgb(255, 246, 196, 69)), 4
$goldText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 210, 74))
$green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 41, 196, 106))
$red   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 215, 38, 61))

$g.FillEllipse($dark, 2, 2, 60, 60)
$g.DrawEllipse($ring, 5, 5, 54, 54)

$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'
$fmt.LineAlignment = 'Center'
$font = New-Object System.Drawing.Font('Arial', 22, [System.Drawing.FontStyle]::Bold)
$g.DrawString('1D', $font, $goldText, (New-Object System.Drawing.RectangleF(0, 6, 64, 34)), $fmt)

$g.FillRectangle($green, 20, 46, 24, 5)
$g.FillRectangle($red, 20, 53, 24, 5)
$g.Flush()

$dev  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $dev
$dest = Join-Path $repo 'server\onedrop.ico'
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($dest)
$icon.Save($fs)
$fs.Close()
Write-Host "wrote $dest"
