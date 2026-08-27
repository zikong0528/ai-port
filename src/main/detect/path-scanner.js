'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeWinPath } = require('../util/realpaths');

// 扩展名优先级：同名时优先真实可执行扩展（npm bin 目录里常有
// claude / claude.cmd / claude.ps1 三个同名文件，必须选 .cmd 才能在 cmd 里运行）。
// 注意：不含 .ps1 —— 启动走 cmd 机制，.ps1 无法直接执行，
// 只有 .ps1 存活属于半损坏状态，应视为命令不可用（诊断面板会提示）。
const EXT_PRIORITY = { '.exe': 0, '.com': 1, '.cmd': 2, '.bat': 3, '': 4 };

/**
 * 扫描 PATH 中所有目录，返回 Map<小写可执行名, 完整路径>。
 * 只收录可执行扩展名；同名文件按扩展名优先级选取。
 */
function scanPath() {
  const pathVar = process.env.PATH || '';
  // 去掉引号/空白、折叠双反斜杠（环境变量值不可信，readdirSync 不认脏路径）
  const dirs = pathVar
    .split(';')
    .map((d) => normalizeWinPath(d))
    .filter(Boolean);
  const map = new Map(); // base -> { file, priority }

  for (const dir of dirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const ent of entries) {
      // 只匹配真实文件，忽略子目录（避免把同名目录误判为命令）
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!(ext in EXT_PRIORITY)) continue;
      const base = path.basename(ent.name, ext).toLowerCase();
      const prio = EXT_PRIORITY[ext];
      const cur = map.get(base);
      if (!cur || prio < cur.priority) {
        map.set(base, { file: path.join(dir, ent.name), priority: prio });
      }
    }
  }

  const result = new Map();
  for (const [base, v] of map) result.set(base, v.file);
  return result;
}

module.exports = { scanPath };
