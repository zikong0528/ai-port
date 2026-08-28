'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { run, runPowerShellJson, sys } = require('../util/exec');
const { BROWSER_HOSTS } = require('../detect/catalog');

// 进程列表缓存，避免状态轮询频繁调用 WMI
let procCache = null;
let procCacheTime = 0;
const CACHE_MS = 1500;

// 共享宿主进程：终止 CLI 时绝不能误杀（否则会关掉用户所有终端窗口）
const EXCLUDED_NAMES = new Set([
  'windowsterminal.exe',
  'wt.exe',
  'openconsole.exe',
  'conhost.exe',
  'explorer.exe',
]);

/**
 * 列出当前进程（pid / name / commandLine），结果缓存约 1.5s。
 * 优化：tasklist 提供全量镜像名（轻量），WMI 只查询 CLI 宿主进程的命令行（过滤后仅几十个），
 * 大幅减少每次轮询的 PowerShell/WMI 开销（卡顿主因）。
 */
async function listProcesses(force = false, cliNames = []) {
  const now = Date.now();
  if (!force && procCache && now - procCacheTime < CACHE_MS) return procCache;

  const full = await tasklistProcesses();
  let withCmd = [];

  const filter = buildHostFilter(cliNames);
  if (filter) {
    const script = `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress`;
    const raw = await runPowerShellJson(script);
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw) arr = [raw];
    if (arr.length) {
      withCmd = arr
        .filter((p) => p && p.ProcessId)
        .map((p) => ({
          pid: p.ProcessId,
          name: String(p.Name || '').toLowerCase(),
          cmdline: normCmdline(p.CommandLine),
        }));
    }
  }

  // 合并：tasklist 全量 + WMI 宿主（有命令行，按 pid 覆盖）
  const map = new Map();
  for (const p of full) map.set(p.pid, p);
  for (const p of withCmd) map.set(p.pid, p);
  procCache = Array.from(map.values());
  procCacheTime = now;
  return procCache;
}

const COMMON_HOSTS = ['node.exe', 'cmd.exe', 'python.exe', 'pythonw.exe', 'powershell.exe', 'pwsh.exe', 'bash.exe'];

function buildHostFilter(cliNames) {
  const set = new Set(COMMON_HOSTS);
  for (const n of cliNames || []) {
    const b = String(n || '').toLowerCase();
    if (!b) continue;
    set.add(b);
    if (b.endsWith('.cmd') || b.endsWith('.bat')) {
      // .cmd/.bat 只是 shim，真正拉起的是同名 .exe（claude.cmd → claude.exe）：
      // 只查 shim 名会永远查不到本体进程，状态探测会漏。
      set.add(b.replace(/\.(cmd|bat)$/, '.exe'));
    } else if (!b.endsWith('.exe')) {
      // 裸命令（手动添加的 CLI，如 ping / aider）：实际进程是 <命令>.exe，
      // 两个都加进过滤（WMI Name 是镜像名，裸名不会误命中）。
      set.add(b + '.exe');
    }
  }
  if (!set.size) return '';
  return Array.from(set)
    .map((n) => "Name='" + n + "'")
    .join(' or ');
}

/**
 * tasklist 降级方案：仅提供镜像名与 PID（无命令行）。
 */
async function tasklistProcesses() {
  let out = '';
  try {
    out = await run(sys('tasklist.exe'), ['/FO', 'CSV', '/NH']);
  } catch (e) {
    return [];
  }
  const procs = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (m) procs.push({ pid: parseInt(m[2], 10), name: m[1].toLowerCase(), cmdline: '' });
  }
  return procs;
}

function normPath(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\//g, '\\')
    .replace(/\\+$/, '');
}

/**
 * 归一化进程命令行：小写、正斜杠转反斜杠、合并双反斜杠。
 * （npm 的 .cmd shim 会把 %dp0% 末尾反斜杠与后续 \node_modules 拼成 \\，必须合并才能匹配）
 */
function normCmdline(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\//g, '\\')
    .replace(/\\\\+/g, '\\');
}

/**
 * 根据条目类型生成进程匹配规则。
 *  GUI：优先按镜像名（exe 文件名）；若只有目录则按命令行路径匹配。
 *  CLI：有安装路径（npm 全局）按路径精确匹配；否则按命令 token 匹配。
 */
function matchSpecFor(entry) {
  if (entry.launchType === 'gui' || entry.launchType === 'store') {
    const p = normPath(entry.installPath);
    if (p.endsWith('.exe')) {
      const base = path.basename(p);
      // PWA（浏览器宿主 + 应用参数）：按参数匹配命令行，才能区分不同 PWA 与普通浏览器窗口
      if (entry.launchType === 'gui' && BROWSER_HOSTS.has(base.toLowerCase()) && entry.args && entry.args.length) {
        return { kind: 'cmdline', value: normCmdline((entry.args || []).join(' ')), browser: true };
      }
      return { kind: 'image', value: base };
    }
    if (p) {
      return { kind: 'cmdline', value: p };
    }
    return { kind: 'image', value: path.basename(entry.installPath || '').toLowerCase() };
  }
  // CLI：同时匹配安装路径（精确）与命令 token（用于命中 cmd 包装进程，从而干净关掉终端标签页）
  return {
    kind: 'cli',
    installPath: entry.installPath ? normPath(entry.installPath) : '',
    command: (entry.command || '').toLowerCase(),
  };
}

/**
 * 命令 token 是否以「独立单词/路径片段」形式出现在命令行中。
 *  长命令（>=4 字符）：允许路径边界（"claude-code\cli.js" 里的 claude）；
 *  短命令（如 dsh，3 字符）：要求整词边界（空格/引号/首尾），避免误命中路径片段。
 *  单字符命令（如 q）：不参与 token 匹配（只能靠安装路径精确匹配）。
 */
function cmdlineHasToken(cmdline, token) {
  if (!token || token.length < 2) return false;
  const idx = cmdline.indexOf(token);
  if (idx < 0) return false;
  const before = idx > 0 ? cmdline[idx - 1] : '';
  const after = cmdline[idx + token.length] || '';
  const isWordBoundary = (c) => c === '' || c === ' ' || c === '"' || c === "'" || c === '\t';
  if (token.length >= 4) {
    const isPathBoundary = (c) =>
      c === '' || c === ' ' || c === '/' || c === '\\' || c === '"' || c === ':' || c === '-' || c === '=' || c === '.';
    return isPathBoundary(before) && isPathBoundary(after);
  }
  return isWordBoundary(before) && isWordBoundary(after);
}

function matchPids(spec, procs) {
  const hits = [];
  for (const p of procs) {
    // 跳过共享宿主进程，避免误关用户所有终端窗口
    if (EXCLUDED_NAMES.has(p.name)) continue;

    // 跳过标题守护：① 循环进程本身（其 cmdline 含 ping 延迟）不参与 token 匹配，
    // ② 其瞬时派生的 ping 子进程按 192.0.2.1（TEST-NET-1 保留地址）签名排除。
    // 否则名为 ping 的 CLI 条目会误命中所有实例的标题守护（状态永远 running）。
    if (p.cmdline && (p.cmdline.indexOf('(1,1,1000000)') >= 0 || p.cmdline.indexOf('192.0.2.1') >= 0)) continue;

    if (spec.kind === 'image') {
      if (p.name === spec.value || p.name === spec.value.replace(/\.exe$/, '') || p.name + '.exe' === spec.value) {
        hits.push(p.pid);
      }
    } else if (spec.kind === 'cmdline') {
      if (p.cmdline && p.cmdline.includes(spec.value)) hits.push(p.pid);
    } else if (spec.kind === 'cli') {
      const c = p.cmdline || '';
      const hitPath = spec.installPath && c.includes(spec.installPath);
      const hitCmd = cmdlineHasToken(c, spec.command);
      if (hitPath || hitCmd) hits.push(p.pid);
    }
  }
  return hits;
}

function spawnDetached(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      ...options,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.removeListener('error', reject);
      try {
        child.unref();
      } catch (e) {
        /* ignore */
      }
      resolve(child);
    });
  });
}

function quoteCmdArg(a) {
  const s = String(a);
  if (/[\s"&|<>^]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildCmdLine(command, args) {
  return [command, ...(args || [])].map(quoteCmdArg).join(' ');
}

/**
 * 一键启动。
 *  GUI：直接启动 exe（可带参数与工作目录）。
 *  CLI：用 Windows Terminal（wt）打开终端交互运行，失败则退回经典 cmd 窗口。
 */
async function launch(entry) {
  if (entry.launchType === 'cli') {
    return launchCli(entry);
  }
  if (entry.launchType === 'store') {
    return launchStore(entry);
  }
  const exe = entry.installPath;
  if (!exe) throw new Error('该条目缺少启动路径');
  const cwd = entry.workdir || undefined;
  const child = await spawnDetached(exe, entry.args || [], { cwd });
  return { pid: child.pid, cmdline: null, kind: 'gui' };
}

function hms(d) {
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

async function launchCli(entry) {
  // 优先用解析出的完整路径（PATH 上找不到时仍可启动），其次用命令名
  const base = buildCmdLine(entry.commandPath || entry.command || entry.name, entry.args || []);
  // 实例隐形标记：rem 是 cmd 注释，用户无感知，用于多开时按实例精确识别/终止
  const marker = 'aidock-i-' + Math.random().toString(36).slice(2, 10);
  // 窗口标题带上启动时间：与列表里实例条目的「启动于 HH:MM:SS」一致，方便对号入座
  // 注意：标题要写进 bat 文件（cmd 按系统 GBK 编码读取），因此只用纯 ASCII
  const startedAt = new Date();
  const safeName = String(entry.name || '')
    .replace(/[%"&|<>^]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
  const title = 'AI Port - ' + (safeName || 'CLI') + ' - ' + hms(startedAt);

  // 标题守护：claude 等 TUI 会覆盖窗口标题，用后台循环每 5 秒把标题重置回来
  // （用 ping 做延迟不碰 stdin，不会抢 claude 的键盘输入）
  // 注意：写进 bat 的内容要把 % 翻倍（%%），否则 cmd 会按变量展开，命令会坏
  const baseForBat = String(base).replace(/%/g, '%%');
  // 命令实际工作目录：优先用户配置，否则沿用应用当前目录（保持既有行为）
  const cwdForBat = String(entry.workdir || process.cwd() || '').replace(/"/g, '');
  let inner;
  let tmpDir = '';
  try {
    tmpDir = path.join(os.tmpdir(), 'aidock-instances');
    fs.mkdirSync(tmpDir, { recursive: true });
    cleanupOldBats(tmpDir);
    const batName = marker + '.bat';
    const batPath = path.join(tmpDir, batName);
    const bat =
      '@echo off\r\n' +
      'start "" /b cmd /q /c "for /l %%i in (1,1,1000000) do (title ' +
      title +
      ' & ping -n 6 -w 1000 192.0.2.1 >nul)"\r\n' +
      (cwdForBat ? 'cd /d "' + cwdForBat + '"\r\n' : '') +
      baseForBat +
      '\r\n';
    fs.writeFileSync(batPath, bat, 'utf8');
    // 关键：只引用「文件名」而非完整路径，配合 start /D 把工作目录切到临时目录，
    // 彻底避免「临时目录路径带空格/中文」时 call 被截断报「找不到路径」
    inner = 'call ' + batName + ' & rem ' + marker;
  } catch (e) {
    // 临时目录不可用时退回无标题守护的直启方式
    tmpDir = '';
    inner = base + ' & rem ' + marker;
  }

  const startArgs = ['/c', 'start', title];
  if (tmpDir) startArgs.push('/D', tmpDir);
  else if (entry.workdir) startArgs.push('/D', entry.workdir);
  startArgs.push('cmd', '/k', inner);

  const child = await spawnDetached(sys('cmd.exe'), startArgs, {
    env: Object.assign({}, process.env, entry.env || {}),
  });
  return { pid: child.pid, cmdline: inner, marker, kind: 'cli', startedAt: startedAt.toISOString() };
}

function cleanupOldBats(dir) {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.bat')) continue;
      try {
        if (now - fs.statSync(path.join(dir, f)).mtimeMs > 24 * 3600 * 1000) {
          fs.unlinkSync(path.join(dir, f));
        }
      } catch (e) {
        /* 运行中的 bat 被占用，跳过 */
      }
    }
  } catch (e) {
    /* ignore */
  }
}

/**
 * 启动 Windows 商店应用：通过 shell:AppsFolder + AppUserModelId。
 */
async function launchStore(entry) {
  if (!entry.appId) throw new Error('缺少商店应用标识');
  const child = await spawnDetached('explorer.exe', ['shell:AppsFolder\\' + entry.appId], {});
  return { pid: child.pid, cmdline: null, kind: 'store' };
}

/**
 * 轻量进程列表：tasklist 只给名称+PID，比 PowerShell/WMI 轻得多。
 * 适用于不需要命令行匹配的场景（没有 CLI 条目时）。
 */
let lightCache = null;
let lightCacheTime = 0;
async function lightProcesses(force = false) {
  const now = Date.now();
  if (!force && lightCache && now - lightCacheTime < CACHE_MS) return lightCache;
  lightCache = await tasklistProcesses();
  lightCacheTime = now;
  return lightCache;
}

function needCmdline(entries) {
  return entries.some((e) => {
    const spec = matchSpecFor(e);
    return spec.kind === 'cli' || (spec.kind === 'cmdline' && spec.browser);
  });
}

/**
 * 需要命令行才能匹配的宿主进程名列表：
 * CLI 命令名（claude.cmd / dsh.cmd …）+ PWA 浏览器宿主（msedge.exe …）。
 */
function hostNamesFrom(entries) {
  const names = entries
    .filter((e) => e.launchType === 'cli')
    .map((e) => (e.commandPath ? path.basename(e.commandPath) : e.command || ''));
  for (const e of entries) {
    if (e.launchType === 'gui' || e.launchType === 'store') {
      const spec = matchSpecFor(e);
      if (spec.browser && spec.kind === 'cmdline' && e.installPath) {
        names.push(path.basename(e.installPath));
      }
    }
  }
  return names;
}

/**
 * 一键终止：按匹配规则找到进程并结束整棵进程树。
 */
async function terminate(entry) {
  const procs = needCmdline([entry]) ? await listProcesses(true, hostNamesFrom([entry])) : await lightProcesses(true);
  const spec = matchSpecFor(entry);
  const pids = matchPids(spec, procs);
  for (const pid of pids) {
    await run(sys('taskkill.exe'), ['/PID', String(pid), '/T', '/F']).catch(() => {});
  }
  return pids;
}

/**
 * 单个条目运行状态。
 */
async function getStatus(entry) {
  const procs = needCmdline([entry]) ? await listProcesses(false, hostNamesFrom([entry])) : await lightProcesses();
  const spec = matchSpecFor(entry);
  return matchPids(spec, procs).length > 0;
}

/**
 * 批量查询状态（一次进程列表查询），返回 { [id]: 实例数 }（支持多开显示）。
 * 没有 CLI 条目时用轻量 tasklist，避免每次轮询都拉起 PowerShell。
 */
async function getStatuses(entries, force = false) {
  const procs = needCmdline(entries) ? await listProcesses(force, hostNamesFrom(entries)) : await lightProcesses(force);
  const out = {};
  for (const entry of entries) {
    const spec = matchSpecFor(entry);
    out[entry.id] = matchPids(spec, procs).length;
  }
  return out;
}

/**
 * 检查各实例是否存活。
 *  CLI 实例按隐形标记精确匹配；GUI 实例按启动 PID 判断。
 */
async function checkInstances(instances) {
  const hasCli = instances.some((i) => i.kind === 'cli' && i.marker);
  const procs = hasCli ? await listProcesses() : await lightProcesses();
  return instances.map((inst) => {
    if (inst.kind === 'cli' && inst.marker) {
      let alive = false;
      for (const p of procs) {
        if (EXCLUDED_NAMES.has(p.name)) continue;
        if (p.cmdline && p.cmdline.includes(inst.marker)) {
          alive = true;
          break;
        }
      }
      return { id: inst.id, alive };
    }
    const alive = procs.some((p) => p.pid === inst.pid);
    return { id: inst.id, alive };
  });
}

/**
 * 终止单个实例（CLI 按标记，GUI 按 PID），返回命中的 PID。
 */
async function terminateInstance(inst) {
  const procs = await listProcesses(true);
  let pids = [];
  if (inst.kind === 'cli' && inst.marker) {
    for (const p of procs) {
      if (EXCLUDED_NAMES.has(p.name)) continue;
      if (p.cmdline && p.cmdline.includes(inst.marker)) pids.push(p.pid);
    }
  } else if (inst.pid) {
    pids = [inst.pid];
  }
  for (const pid of pids) {
    await run(sys('taskkill.exe'), ['/PID', String(pid), '/T', '/F']).catch(() => {});
  }
  return pids;
}

module.exports = { launch, terminate, terminateInstance, checkInstances, getStatus, getStatuses, listProcesses, matchSpecFor, normCmdline, cmdlineHasToken, buildHostFilter, matchPids };
