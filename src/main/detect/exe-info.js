'use strict';

const { runPowerShellJson } = require('../util/exec');

/**
 * 批量读取 exe 内嵌版本信息（底层元数据）。
 * 用户改快捷方式名/文件名都不会改变这些字段——这是「防改名」识别的关键。
 * 一次 PowerShell 调用处理全部路径。
 * @param {string[]} paths exe 完整路径列表
 * @returns {Promise<Object>} key(小写路径) -> { fileDescription, productName, companyName, originalFilename, fileVersion }
 */
async function getExeInfoBatch(paths) {
  const unique = [
    ...new Set(
      (paths || []).filter(
        (p) => p && typeof p === 'string' && p.toLowerCase().endsWith('.exe')
      )
    ),
  ];
  if (!unique.length) return {};

  const jsonPaths = JSON.stringify(unique);
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = ${jsonPaths}
$result = @()
foreach ($p in $paths) {
  $vi = (Get-Item -LiteralPath $p -ErrorAction SilentlyContinue).VersionInfo
  if ($vi) {
    $result += [PSCustomObject]@{
      Path = $p
      FileDescription = $vi.FileDescription
      ProductName = $vi.ProductName
      CompanyName = $vi.CompanyName
      OriginalFilename = $vi.OriginalFilename
      FileVersion = $vi.FileVersion
    }
  }
}
ConvertTo-Json -InputObject @($result) -Compress
`;

  const list = await runPowerShellJson(script);
  const map = {};
  if (Array.isArray(list)) {
    for (const it of list) {
      if (it && it.Path) {
        map[String(it.Path).toLowerCase()] = {
          fileDescription: String(it.FileDescription || ''),
          productName: String(it.ProductName || ''),
          companyName: String(it.CompanyName || ''),
          originalFilename: String(it.OriginalFilename || ''),
          fileVersion: String(it.FileVersion || ''),
        };
      }
    }
  }
  return map;
}

module.exports = { getExeInfoBatch };
