'use strict';

const path = require('path');
const { runPowerShellJson } = require('../util/exec');

/**
 * 扫描 Windows 商店（AppX/UWP）应用。
 * 用 Get-StartApps 拿用户可见名称 + AppID(AUMID)，再结合 Get-AppxPackageManifest
 * 拿到真实可执行文件名（用于状态/终止匹配）。
 */
async function scanAppx() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$startApps = Get-StartApps
$pkgs = Get-AppxPackage
$result = @()
foreach ($a in $startApps) {
  if ($a.AppID -notmatch '!') { continue }
  $parts = $a.AppID.Split('!')
  $family = $parts[0]
  $appId = $parts[1]
  $pkg = $pkgs | Where-Object { $_.PackageFamilyName -eq $family } | Select-Object -First 1
  $exe = ''
  if ($pkg) {
    $m = Get-AppxPackageManifest -Package $pkg
    $app = $m.Package.Applications.Application | Where-Object { $_.Id -eq $appId } | Select-Object -First 1
    if ($app) { $exe = $app.Executable }
  }
  $result += [PSCustomObject]@{
    Name = $a.Name
    AppID = $a.AppID
    PackageName = if ($pkg) { $pkg.Name } else { $family }
    InstallLocation = if ($pkg) { $pkg.InstallLocation } else { '' }
    Executable = $exe
  }
}
ConvertTo-Json -InputObject @($result) -Compress
`;

  const list = await runPowerShellJson(script);
  if (!Array.isArray(list)) return [];

  return list
    .filter((a) => a && a.AppID)
    .map((a) => {
      const installLocation = String(a.InstallLocation || '');
      const executable = String(a.Executable || '').replace(/\//g, '\\');
      const exePath = executable ? path.join(installLocation, executable) : '';
      return {
        name: String(a.Name || '').trim(),
        appId: String(a.AppID),
        packageName: String(a.PackageName || ''),
        installLocation,
        exeName: executable ? path.basename(executable) : '',
        exePath,
      };
    });
}

module.exports = { scanAppx };
