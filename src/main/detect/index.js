'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { loadCatalog, matchCatalog, looksLikeAI, companyVeto } = require('./catalog');
const { scanRegistry } = require('./registry-scanner');
const { scanStartMenu } = require('./startmenu-scanner');
const { scanNpmPackages } = require('./npm-scanner');
const { scanPath } = require('./path-scanner');
const { scanAppx } = require('./appx-scanner');
const { scanLocalPrograms } = require('./localprograms-scanner');
const { getExeInfoBatch } = require('./exe-info');

// ===== 自身排除：不把 AI Port 自己识别为 AI（含旧名 AI Dock，兼容旧安装） =====
const { app } = require('electron');

function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

let SELF_EXE = '';
try {
  SELF_EXE = (app.getPath('exe') || '').toLowerCase().replace(/\//g, '\\');
} catch (e) {
  SELF_EXE = (process.execPath || '').toLowerCase().replace(/\//g, '\\');
}

const SELF_EXE_NAMES = new Set(['ai port.exe', 'ai-port.exe', 'ai dock.exe', 'ai-dock.exe']);
const SELF_KEYS = new Set(['aiport', 'aidock']);

function isSelf(name, exePath) {
  // 1) 名称：去掉尾部版本号后归一化比较（覆盖 "AI Port 0.1.0"）
  const raw = String(name || '').toLowerCase().trim();
  const base = raw.replace(/[-_\s]*(v?\d+(\.\d+)*)$/, '').trim();
  if (SELF_KEYS.has(normKey(base))) return true;

  // 2) 可执行文件名：安装后固定为 "AI Port.exe"
  const p = (exePath || '').toLowerCase().replace(/\//g, '\\');
  if (SELF_EXE_NAMES.has(path.basename(p))) return true;

  // 3) 完整路径与当前运行程序一致
  return !!(p && SELF_EXE && p === SELF_EXE);
}

/**
 * 由特征库条目生成一个完整 AppEntry。
 */
function buildFromCatalog(cat, overrides = {}) {
  const entry = {
    id: 'catalog:' + cat.id,
    name: cat.name,
    category: cat.category || 'custom',
    launchType: cat.launchType || 'gui',
    description: cat.description || '',
    command: cat.launchType === 'cli' ? cat.defaultCommand || '' : '',
    args: Array.isArray(cat.defaultArgs) ? cat.defaultArgs.slice() : [],
    workdir: '',
    installPath: '',
    detectedBy: 'catalog',
    sourceLabel: '内置特征库',
    catalogId: cat.id,
    confirmed: true,
    version: '',
    homepage: cat.homepage || '',
  };
  return Object.assign(entry, overrides);
}

/**
 * 生成一个「疑似 AI」候选条目（未确认，等待用户核实）。
 */
function buildCandidate(overrides = {}) {
  const name = overrides.name || '未命名';
  const target = overrides.installPath || overrides.command || name;
  const idHash = crypto
    .createHash('md5')
    .update((overrides.launchType || 'gui') + ':' + target)
    .digest('hex')
    .slice(0, 12);
  return {
    id: 'candidate:' + idHash,
    name,
    category: 'custom',
    launchType: overrides.launchType || 'gui',
    description: '自动识别的候选应用，请确认是否为 AI',
    command: overrides.command || '',
    commandPath: overrides.commandPath || '',
    args: [],
    workdir: '',
    installPath: overrides.installPath || '',
    appId: overrides.appId || '',
    detectedBy: 'candidate',
    sourceLabel: overrides.sourceLabel || '候选',
    catalogId: null,
    confirmed: false,
    version: overrides.version || '',
    homepage: '',
  };
}

/**
 * 去重键：CLI 以命令为准，GUI 以安装路径为准。
 */
function entryKey(e) {
  const target = (e.launchType === 'cli' ? e.command : e.installPath) || e.name;
  return (e.launchType || 'gui') + ':' + String(target).toLowerCase();
}

const SOURCE_LABELS = {
  startmenu: '开始菜单',
  registry: '已安装程序',
  localprograms: '本地程序目录',
  appx: 'Windows 商店',
  npm: 'npm 全局',
  path: 'PATH 命令',
};

/**
 * 运行完整检测：
 * 开始菜单 + 注册表 + 本地程序目录（GUI，含 exe 底层元数据防改名）
 * → 商店应用 → npm 全局（命令真实性校验）→ PATH。
 * 返回 { entries, stats }。
 */
async function runScan() {
  const detected = [];
  const keys = new Set();
  const stats = { startmenu: 0, registry: 0, localprograms: 0, appx: 0, npm: 0, path: 0 };
  const add = (entry, source) => {
    const k = entryKey(entry);
    if (keys.has(k)) return false;
    keys.add(k);
    detected.push(entry);
    if (stats[source] !== undefined) stats[source]++;
    return true;
  };

  // 0) PATH 映射（供 CLI 命令校验 + PATH 特征匹配）
  const pathMap = scanPath();

  // 1) GUI 候选收集：开始菜单 + 注册表 + 本地程序目录
  const guiCandidates = [];
  for (const item of scanStartMenu()) {
    if (isSelf(item.name, item.exePath)) continue;
    if (!item.exePath || !fs.existsSync(item.exePath)) continue; // 内容筛查：目标必须真实存在
    guiCandidates.push({ name: item.name, exePath: item.exePath, launchPath: item.exePath, source: 'startmenu' });
  }
  for (const item of await scanRegistry()) {
    if (isSelf(item.displayName, item.exePath)) continue;
    const exePath = item.exePath && fs.existsSync(item.exePath) ? item.exePath : '';
    const launchPath = exePath || item.installLocation;
    if (!launchPath) continue;
    guiCandidates.push({ name: item.displayName, exePath, launchPath, source: 'registry' });
  }
  for (const item of scanLocalPrograms()) {
    if (isSelf(item.name, item.exePath)) continue;
    guiCandidates.push({ name: item.name, exePath: item.exePath, launchPath: item.exePath, source: 'localprograms' });
  }

  // 2) 批量读取 exe 底层元数据（公司名/产品名——用户改快捷方式名或文件名都不会变）
  const metaMap = await getExeInfoBatch(guiCandidates.map((c) => c.exePath));

  // 3) GUI 匹配（名称 + 文件名 + 底层元数据）
  for (const c of guiCandidates) {
    const exeName = c.exePath ? path.basename(c.exePath) : '';
    const meta = (c.exePath && metaMap[c.exePath.toLowerCase()]) || {};
    const cat = matchCatalog({
      displayName: c.name,
      exeName,
      companyName: meta.companyName,
      productName: meta.productName,
      originalFilename: meta.originalFilename,
    });
    const label = SOURCE_LABELS[c.source] || c.source;
    if (cat && cat.launchType === 'gui') {
      // 元数据否决：名字像某个 AI、但 exe 公司名与特征库不符 → 冒名顶替，降级为候选
      if (companyVeto(cat, meta.companyName)) {
        add(
          buildCandidate({
            name: c.name,
            launchType: 'gui',
            installPath: c.launchPath,
            sourceLabel: label + '（疑似冒名）',
          }),
          c.source
        );
        continue;
      }
      add(
        buildFromCatalog(cat, {
          installPath: c.launchPath,
          detectedBy: c.source,
          sourceLabel: label,
          version: meta.fileVersion || '',
        }),
        c.source
      );
    } else {
      const hay = [c.name, meta.productName, meta.companyName, meta.fileDescription].join(' ');
      if (looksLikeAI(hay)) {
        add(
          buildCandidate({
            name: c.name,
            launchType: 'gui',
            installPath: c.launchPath,
            sourceLabel: label,
          }),
          c.source
        );
      }
    }
  }

  // 4) Windows 商店应用（AppX/UWP）
  for (const item of await scanAppx()) {
    if (isSelf(item.name, item.exePath)) continue;
    const cat = matchCatalog({ storePackage: item.packageName, displayName: item.name, exeName: item.exeName });
    if (cat) {
      add(
        buildFromCatalog(cat, {
          launchType: 'store',
          appId: item.appId,
          installPath: item.exePath,
          detectedBy: 'appx',
          sourceLabel: SOURCE_LABELS.appx,
        }),
        'appx'
      );
    } else if (looksLikeAI(item.name + ' ' + item.packageName)) {
      add(
        buildCandidate({
          name: item.name,
          launchType: 'store',
          appId: item.appId,
          installPath: item.exePath,
          sourceLabel: SOURCE_LABELS.appx,
        }),
        'appx'
      );
    }
  }

  // 5) npm 全局（CLI agent 主来源）——命令必须真实可运行（防空壳/假命令）
  for (const pkg of await scanNpmPackages()) {
    const cat = matchCatalog({ npmPackage: pkg.name });
    if (cat && cat.launchType === 'cli') {
      const cmd = (cat.pathExecutables && cat.pathExecutables[0]) || cat.defaultCommand || pkg.name;
      const commandPath = resolveCommand(cmd, pathMap, pkg.npmRoot, pkg.installPath);
      if (!commandPath) continue;
      add(
        buildFromCatalog(cat, {
          command: cmd,
          commandPath,
          installPath: pkg.installPath,
          detectedBy: 'npm',
          sourceLabel: SOURCE_LABELS.npm + ' · ' + pkg.name,
          version: pkg.version,
        }),
        'npm'
      );
    } else if (!cat && looksLikeAI(pkg.name + ' ' + pkg.description)) {
      const cmd = (pkg.bin && pkg.bin[0]) || prettyName(pkg.name);
      const commandPath = resolveCommand(cmd, pathMap, pkg.npmRoot, pkg.installPath);
      if (!commandPath) continue;
      add(
        buildCandidate({
          name: prettyName(pkg.name),
          launchType: 'cli',
          command: cmd,
          commandPath,
          installPath: pkg.installPath,
          sourceLabel: SOURCE_LABELS.npm,
          version: pkg.version,
        }),
        'npm'
      );
    }
  }

  // 6) PATH 可执行文件（非 npm 的 CLI，如 aider / ollama）
  for (const cat of loadCatalog().entries) {
    if (cat.launchType !== 'cli') continue;
    for (const exe of cat.pathExecutables || []) {
      const found = pathMap.get(exe.toLowerCase());
      if (found) {
        add(
          buildFromCatalog(cat, {
            command: exe,
            commandPath: found,
            installPath: found,
            detectedBy: 'path',
            sourceLabel: SOURCE_LABELS.path,
          }),
          'path'
        );
        break;
      }
    }
  }

  return { entries: detected, stats };
}

/**
 * 解析命令的真实可执行路径：
 * 优先 PATH 上的文件；若 npm 全局 bin 目录不在 PATH 上，则用其完整路径（仍可启动）。
 */
function resolveCommand(cmd, pathMap, npmRoot, installPath) {
  const lower = String(cmd || '').toLowerCase();
  if (!lower) return '';
  const onPath = pathMap.get(lower);
  if (onPath) return onPath;
  if (npmRoot) {
    const binDir = path.dirname(npmRoot);
    for (const ext of ['.cmd', '.exe', '.bat']) {
      const candidate = path.join(binDir, cmd + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
    // 全局 shim 丢失时兜底：直接用包内 bin 目录的可执行文件
    // （必须校验真实 PE 头——claude 等包下载失败时 bin 里可能残留 echo 占位脚本）
    if (installPath) {
      const exeName = lower.endsWith('.exe') ? cmd : cmd + '.exe';
      const pkgBin = path.join(installPath, 'bin', exeName);
      if (isRealExe(pkgBin)) return pkgBin;
    }
  }
  return '';
}

/**
 * 校验是否为真正的 Windows 可执行文件（MZ 头 + 大小下限）。
 */
function isRealExe(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile() || st.size < 64 * 1024) return false;
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, 0);
    fs.closeSync(fd);
    return buf[0] === 0x4d && buf[1] === 0x5a;
  } catch (e) {
    return false;
  }
}

function prettyName(pkgName) {
  const parts = String(pkgName).split('/');
  return parts[parts.length - 1];
}

module.exports = { runScan, buildFromCatalog, buildCandidate, entryKey };
