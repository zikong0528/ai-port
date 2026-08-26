'use strict';

const fs = require('fs');
const path = require('path');
const { realLocalAppData } = require('../util/realpaths');

/**
 * 扫描 %LOCALAPPDATA%\Programs（许多按用户安装/便携应用装在这里，
 * 且不一定出现在开始菜单或注册表）。
 * 对每个子目录找主 exe：优先同名 exe，否则目录内唯一 exe。
 * 注意：用真实 LOCALAPPDATA（商店版 MSIX 会把环境变量重定向到包私有目录）。
 */
function scanLocalPrograms() {
  const la = realLocalAppData();
  if (!la) return [];
  const base = path.join(la, 'Programs');
  const results = [];
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch (e) {
    return results;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const dir = path.join(base, ent.name);
    const exe = findMainExe(dir, ent.name);
    if (exe && fs.existsSync(exe)) {
      results.push({ name: ent.name, exePath: exe, installDir: dir });
    }
  }
  return results;
}

function findMainExe(dir, dirName) {
  const lower = dirName.toLowerCase();
  let files = [];
  try {
    files = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return '';
  }
  const exes = files.filter((f) => f.isFile() && path.extname(f.name).toLowerCase() === '.exe');

  for (const f of exes) {
    if (path.basename(f.name, '.exe').toLowerCase() === lower) return path.join(dir, f.name);
  }
  // 无同名 exe：目录内只有一个 exe 时采用它
  if (exes.length === 1) return path.join(dir, exes[0].name);
  return '';
}

module.exports = { scanLocalPrograms, findMainExe };
