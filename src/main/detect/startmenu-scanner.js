'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

/**
 * 扫描开始菜单快捷方式（.lnk），得到「名称 + 真实 exe 目标」。
 * 这是 GUI 应用一键启动最可靠的路径来源。
 */
function menuDirs() {
  const dirs = [];
  const appData = process.env.APPDATA;
  const programData = process.env.ProgramData;
  if (appData) dirs.push(path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  if (programData) dirs.push(path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  return dirs;
}

function walk(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return results;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, results);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith('.lnk')) {
      results.push(full);
    }
  }
  return results;
}

function scanStartMenu() {
  const items = [];
  for (const dir of menuDirs()) {
    for (const lnk of walk(dir)) {
      try {
        const info = shell.readShortcutLink(lnk);
        if (!info || !info.target) continue;
        items.push({
          name: path.basename(lnk, '.lnk'),
          exePath: info.target,
          args: info.args || '',
          cwd: info.cwd || '',
          shortcutPath: lnk,
        });
      } catch (e) {
        // 忽略损坏的快捷方式
      }
    }
  }
  return items;
}

module.exports = { scanStartMenu, menuDirs };
