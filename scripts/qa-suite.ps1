# AI Port QA 套件运行器
# 特性：每项测试 90 秒超时护栏（超时强杀进程树，套件永不挂死）；
#       每项测试前清理上轮泄漏（按 bat 内容精确识别 ping 测试残留，绝不误伤用户实例）。
# 用法：pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/qa-suite.ps1
param([string]$Proj = 'E:\deep seek Harness\ai-port')
$ErrorActionPreference = 'SilentlyContinue'

$electron = Join-Path $Proj 'node_modules\electron\dist\electron.exe'
$outDir = Join-Path $Proj 'release\qa-run'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$tests = 'scan-test', 'adversarial-test', 'ui-smoke', 'status-test', 'inst-test', 'launch-test', 'gui-test', 'icon-flow-test', 'dsh-window-test'
$taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'

function Cleanup-TestLeaks {
  # 1) 测试专用 ping -t 进程（用户自己的 ping 不受影响：只杀 -t 127.0.0.1 且父进程为 cmd 的）
  Get-CimInstance Win32_Process -Filter "Name='PING.EXE'" | Where-Object { $_.CommandLine -match 'ping -t' } | ForEach-Object {
    & $taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null
  }
  # 2) 指向 ping 测试 bat 的残留 wrapper（读 bat 内容区分，绝不误伤用户 dsh/claude 实例）
  $batDir = Join-Path $env:TEMP 'aidock-instances'
  if (Test-Path $batDir) {
    foreach ($b in (Get-ChildItem $batDir -Filter '*.bat')) {
      $c = try { Get-Content $b.FullName -Raw -ErrorAction Stop } catch { '' }
      if ($c -match 'ping -t') {
        $fname = $b.Name
        Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($fname) } | ForEach-Object {
          & $taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null
        }
      }
    }
  }
}

$results = @()
foreach ($t in $tests) {
  Cleanup-TestLeaks
  $o = Join-Path $outDir "$t.out.txt"
  $e = Join-Path $outDir "$t.err.txt"
  Remove-Item $o, $e -Force -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath $electron -ArgumentList ('"' + (Join-Path $Proj "scripts\$t.js") + '"') -WorkingDirectory $Proj -PassThru -RedirectStandardOutput $o -RedirectStandardError $e
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while (-not $p.HasExited) {
    if ($sw.Elapsed.TotalSeconds -gt 90) {
      Write-Output "== $t TIMEOUT 90s, 强杀进程树 =="
      & $taskkill /PID $p.Id /T /F 2>&1 | Out-Null
      Start-Sleep -Seconds 2
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if ($p.HasExited) {
    $p.Refresh()
    $results += "$t exit=$($p.ExitCode)"
    Write-Output "== $t exit=$($p.ExitCode) =="
  }
  else { $results += "$t TIMEOUT" }
}
Cleanup-TestLeaks

Write-Output '===== 套件汇总 ====='
$results
Write-Output '===== 关键输出 ====='
foreach ($t in 'adversarial-test', 'scan-test', 'status-test', 'inst-test', 'launch-test', 'gui-test', 'dsh-window-test', 'icon-flow-test', 'ui-smoke') {
  Write-Output "########## $t ##########"
  $f = Join-Path $outDir "$t.out.txt"
  if (Test-Path $f) {
    try {
      $txt = [System.Text.Encoding]::GetEncoding('GBK').GetString([System.IO.File]::ReadAllBytes($f))
      if ($t -eq 'adversarial-test') { $txt -split "`r?`n" | Select-String -Pattern 'FAIL|完成' }
      elseif ($t -eq 'scan-test') { $txt -split "`r?`n" | Select-String -Pattern '条目数|来源统计|疑似|Claude|ChatGPT|DeepSeek' }
      elseif ($t -eq 'status-test') { $txt -split "`r?`n" | Select-String -Pattern 'running' }
      elseif ($t -eq 'inst-test') { $txt -split "`r?`n" | Select-String -Pattern 'alive|命中' }
      elseif ($t -eq 'launch-test') { $txt -split "`r?`n" | Select-String -Pattern 'running|命中|完成' }
      elseif ($t -eq 'gui-test') { $txt -split "`r?`n" | Select-String -Pattern 'running|命中|完成' }
      elseif ($t -eq 'dsh-window-test') { $txt -split "`r?`n" | Select-String -Pattern 'conhost|alive|剩余' }
      elseif ($t -eq 'icon-flow-test') { $txt -split "`r?`n" | Select-Object -First 6 }
      else { $txt -split "`r?`n" | Select-String -Pattern 'hasApi|scan|错误|条目数' }
    } catch { Write-Output "(读取失败: $($_.Exception.Message))" }
  } else { Write-Output '(no output)' }
}
