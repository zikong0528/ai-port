'use strict';

const fs = require('fs');
const path = require('path');
const { runCmd } = require('../util/exec');

/**
 * 定位 npm 全局 node_modules 目录（多个候选）。
 */
async function npmGlobalRoots() {
  const roots = [];
  try {
    const out = await runCmd('npm root -g');
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const root = lines[lines.length - 1];
    if (root) roots.push(root);
  } catch (e) {
    // npm 不存在时走 fallback
  }
  if (process.env.APPDATA) {
    roots.push(path.join(process.env.APPDATA, 'npm', 'node_modules'));
  }
  roots.push(path.join(path.dirname(process.execPath), 'node_modules'));
  return roots;
}

/**
 * 扫描 npm 全局包，返回包名/版本/描述/bin/安装路径。
 */
async function scanNpmPackages() {
  const roots = await npmGlobalRoots();
  const results = [];
  const seen = new Set();

  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      continue;
    }

    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
      if (ent.name.startsWith('@')) {
        // scoped 包：@scope/pkg
        const scopePath = path.join(root, ent.name);
        let subs = [];
        try {
          subs = fs.readdirSync(scopePath, { withFileTypes: true });
        } catch (e) {
          continue;
        }
        for (const sub of subs) {
          // 跳过隐藏目录（如 claude 更新失败残留的 .claude-code-XXXX 备份目录）
          if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
          const info = readPackage(path.join(scopePath, sub.name));
          if (info) {
            info.npmRoot = root;
            pushUnique(info);
          }
        }
      } else {
        const info = readPackage(path.join(root, ent.name));
        if (info) {
          info.npmRoot = root;
          pushUnique(info);
        }
      }
    }
  }

  function pushUnique(info) {
    if (seen.has(info.name)) return;
    seen.add(info.name);
    results.push(info);
  }

  return results;
}

function readPackage(pkgPath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'));
    if (!pkg.name) return null;
    return {
      name: pkg.name,
      version: pkg.version || '',
      description: pkg.description || '',
      bin: normalizeBin(pkg.bin),
      installPath: pkgPath,
    };
  } catch (e) {
    return null;
  }
}

function normalizeBin(bin) {
  if (!bin) return [];
  if (typeof bin === 'string') return [bin];
  if (typeof bin === 'object') return Object.keys(bin);
  return [];
}

module.exports = { scanNpmPackages, npmGlobalRoots };
