# AI Dock 图标生成脚本
# 生成 resources/icon.png（256x256）与 resources/icon.ico（256x256 PNG 内嵌）
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$rect = New-RoundedRectPath 8 8 240 240 52

$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(0, 0, $size, $size)),
  [System.Drawing.Color]::FromArgb(255, 104, 150, 255),
  [System.Drawing.Color]::FromArgb(255, 46, 82, 205),
  45
)
$g.FillPath($gradient, $rect)

$font = New-Object System.Drawing.Font('Segoe UI', 96, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('AI', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, -6, $size, $size)), $sf)

$pngPath = Join-Path $PSScriptRoot '..\resources\icon.png'
$dir = Split-Path $pngPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()

# 构造 ICO：PNG 内嵌的 256x256 图标
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]1)
$bw.Write([byte]0)      # width 256
$bw.Write([byte]0)      # height 256
$bw.Write([byte]0)      # color count
$bw.Write([byte]0)      # reserved
$bw.Write([uint16]1)    # planes
$bw.Write([uint16]32)   # bit count
$bw.Write([uint32]$pngBytes.Length)
$bw.Write([uint32]22)   # data offset
$bw.Write($pngBytes)
$bw.Flush()
$icoPath = Join-Path $PSScriptRoot '..\resources\icon.ico'
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())
$bw.Dispose()
$ms.Dispose()

Write-Output "已生成：$pngPath"
Write-Output "已生成：$icoPath"
