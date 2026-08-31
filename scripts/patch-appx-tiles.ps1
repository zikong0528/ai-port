# AI Port 商店包磁贴图标修复脚本
# 问题：electron-builder 给 appx 生成的磁贴是默认占位图（微软认证 10.1.1.11 驳回）
# 做法：用 resources/icon.png 生成全套磁贴 → 解包 → 替换+补全 → 补 manifest → makeappx 重打包
# 用法（每次 npm run dist:store 后执行）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/patch-appx-tiles.ps1
param([string]$Proj = 'E:\deep seek Harness\ai-port')
$ErrorActionPreference = 'Stop'

$appx = Join-Path $Proj 'release\AI Port 0.1.3.appx'
if (-not (Test-Path $appx)) { throw "找不到 appx: $appx" }
$icon = Join-Path $Proj 'resources\icon.png'
$makeappx = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign*" -Recurse -Filter 'makeappx.exe' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1 -ExpandProperty FullName
if (-not $makeappx) { throw '找不到 makeappx.exe' }
Write-Output "makeappx: $makeappx"

$work = Join-Path $env:TEMP 'appx-patch'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $work | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

# 1) 生成全套磁贴（图标居中、留 24% 边距、透明背景）
$tileSizes = [ordered]@{
  'StoreLogo.png'          = @(50, 50)
  'Square44x44Logo.png'    = @(44, 44)
  'Square71x71Logo.png'    = @(71, 71)
  'Square150x150Logo.png'  = @(150, 150)
  'Square310x310Logo.png'  = @(310, 310)
  'Wide310x150Logo.png'    = @(310, 150)
}
$src = [System.Drawing.Image]::FromFile($icon)
$assetsDir = Join-Path $work 'assets'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
foreach ($name in $tileSizes.Keys) {
  $w = $tileSizes[$name][0]; $h = $tileSizes[$name][1]
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $target = [Math]::Min($w, $h) * 0.76
  $dx = ($w - $target) / 2; $dy = ($h - $target) / 2
  $g.DrawImage($src, [float]$dx, [float]$dy, [float]$target, [float]$target)
  $g.Dispose()
  $bmp.Save((Join-Path $assetsDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$src.Dispose()

# 2) 解包（从源包备份解压，避免重复运行时从已改包解压）
#    注意：electron-builder 把含空格的 exe 名存成了 URL 编码（AI%20Port.exe），
#    必须解码回空格（AI Port.exe）才能与 manifest 里的 Executable 对应，makeappx 才找得到。
$bak = "$appx.orig.bak"
if (-not (Test-Path $bak)) { Copy-Item $appx $bak }
$extractRoot = Join-Path $work 'extract'
$zip = [System.IO.Compression.ZipFile]::OpenRead($bak)
try {
  foreach ($entry in $zip.Entries) {
    $name = [Uri]::UnescapeDataString($entry.FullName)
    $dest = Join-Path $extractRoot $name
    $dir = Split-Path $dest -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if ($entry.FullName -notmatch '/$') {
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
    }
  }
} finally { $zip.Dispose() }

# 3) 替换/新增图片
Copy-Item (Join-Path $assetsDir '*') (Join-Path $extractRoot 'assets') -Force

# 4) 补 manifest 引用：Square71x71Logo / Square310x310Logo 都挂在 uap:DefaultTile
$mf = Join-Path $extractRoot 'AppxManifest.xml'
$txt = [System.IO.File]::ReadAllText($mf, [System.Text.UTF8Encoding]::new($false))
$txt = $txt.Replace('<uap:DefaultTile Wide310x150Logo="assets\Wide310x150Logo.png" />', '<uap:DefaultTile Wide310x150Logo="assets\Wide310x150Logo.png" Square71x71Logo="assets\Square71x71Logo.png" Square310x310Logo="assets\Square310x310Logo.png" />')
[System.IO.File]::WriteAllText($mf, $txt, [System.Text.UTF8Encoding]::new($false))

# 5) makeappx 重打包
$fixed = Join-Path $Proj 'release\AI Port 0.1.3.appx'
Remove-Item $fixed -Force -ErrorAction SilentlyContinue
& $makeappx pack /d $extractRoot /p $fixed /o
Write-Output "完成: $fixed"
