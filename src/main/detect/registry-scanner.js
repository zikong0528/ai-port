'use strict';

const { runCmd, runPowerShellJson, sys } = require('../util/exec');

const REG_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/**
 * 扫描 Windows 注册表「卸载信息」，得到已安装程序列表（GUI 应用的主要来源）。
 * 优先用 PowerShell；不可用时自动降级到 reg.exe。
 */
async function scanRegistry() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$apps = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName }
ConvertTo-Json -InputObject @($apps | Select-Object DisplayName, InstallLocation, DisplayIcon, UninstallString) -Compress
`;

  const list = await runPowerShellJson(script);
  if (Array.isArray(list)) return normalize(list);

  // 降级：PowerShell 不可用时用 reg.exe（chcp 65001 保证中文不乱码）
  return scanRegistryViaReg();
}

function normalize(list) {
  return list
    .filter((a) => a && a.DisplayName)
    .map((a) => ({
      displayName: String(a.DisplayName).trim(),
      installLocation: a.InstallLocation ? String(a.InstallLocation).trim() : '',
      exePath: cleanIconPath(a.DisplayIcon),
      uninstallString: a.UninstallString ? String(a.UninstallString).trim() : '',
    }));
}

async function scanRegistryViaReg() {
  const results = [];
  for (const key of REG_KEYS) {
    let out = '';
    try {
      out = await runCmd('chcp 65001 >nul & "' + sys('reg.exe') + '" query "' + key + '" /s');
    } catch (e) {
      continue;
    }
    results.push(...parseRegOutput(out));
  }
  const seen = new Set();
  return results.filter((r) => {
    const k = r.displayName.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function parseRegOutput(out) {
  const items = [];
  const lines = out.split(/\r?\n/);
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^HKEY_/i.test(line) || /^HK/i.test(line)) {
      if (current && current.displayName) items.push(current);
      current = {};
      continue;
    }
    if (!current) continue;
    const m = line.match(/^(\S+)\s+(REG_SZ|REG_EXPAND_SZ)\s+(.*)$/i);
    if (!m) continue;
    const name = m[1];
    const value = m[3];
    if (name === 'DisplayName') current.displayName = value;
    else if (name === 'InstallLocation') current.installLocation = value;
    else if (name === 'DisplayIcon') current.displayIcon = value;
  }
  if (current && current.displayName) items.push(current);

  return items.map((it) => ({
    displayName: it.displayName,
    installLocation: it.installLocation || '',
    exePath: cleanIconPath(it.displayIcon || ''),
    uninstallString: '',
  }));
}

/**
 * DisplayIcon 形如 "C:\\path\\app.exe,0"，去掉图标索引与引号，尽量得到 exe 路径。
 */
function cleanIconPath(icon) {
  if (!icon) return '';
  let s = String(icon).trim();
  s = s.replace(/,\s*-?\d+\s*$/, '');
  s = s.replace(/^"(.*)"$/, '$1');
  return s;
}

module.exports = { scanRegistry };
