'use strict';

const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, shell, app, nativeImage } = require('electron');
const { runScan } = require('./detect');
const { launch, terminate, terminateInstance, checkInstances, getStatuses } = require('./process/manager');
const { runCmd, runPowerShellJson } = require('./util/exec');
const updater = require('./updater');

function registerIpc({ store }) {
  // 扫描并合并到列表（忽略用户删除过的条目）
  ipcMain.handle('scan:run', async () => {
    const scan = await runScan();
    const detected = scan.entries;
    const ignored = new Set(store.getSetting('ignoredIds', []));
    const existingIds = new Set(store.entries.map((e) => e.id));
    let added = 0;
    let refreshed = 0;
    for (const d of detected) {
      if (ignored.has(d.id)) continue;
      if (existingIds.has(d.id)) {
        // 已存在且用户未手动修改：用最新特征库刷新命令/参数/版本
        const existing = store.findEntry(d.id);
        if (existing && !existing.modifiedByUser) {
          const patch = {};
          if (d.command && d.command !== existing.command) patch.command = d.command;
          if (Array.isArray(d.args) && JSON.stringify(d.args) !== JSON.stringify(existing.args || [])) patch.args = d.args;
          if (d.version && d.version !== existing.version) patch.version = d.version;
          if (Object.keys(patch).length) {
            store.updateEntry(d.id, patch);
            refreshed++;
          }
        }
        continue;
      }
      store.addEntry(d);
      existingIds.add(d.id);
      added++;
    }

    // 清理：自动检测、未被用户修改的条目若已检测不到（应用卸载/特征库修正），自动移除
    // 保护：扫描结果为 0（扫描异常，如 PowerShell 被临时禁用）时跳过清理，防止误清空用户列表
    const detectedIds = new Set(detected.map((d) => d.id));
    let removed = 0;
    if (detected.length > 0) {
      for (const e of store.entries.slice()) {
        if (e.modifiedByUser || e.detectedBy === 'manual') continue;
        if (detectedIds.has(e.id)) continue;
        store.removeEntry(e.id);
        removed++;
      }
    }

    return { added, refreshed, removed, total: store.entries.length, detected: detected.length, stats: scan.stats };
  });

  // 诊断：各扫描来源结果数量与运行环境状态
  ipcMain.handle('diagnostics:run', async () => {
    const scan = await runScan();
    const env = {
      powershell: await checkPowerShell(),
      windowsTerminal: await checkWt(),
      npm: await checkNpm(),
    };
    return { stats: scan.stats, detected: scan.entries.length, listed: store.entries.length, env };
  });

  // 存活实例台账（自动清理已结束的实例记录）
  async function aliveInstances() {
    const checked = await checkInstances(store.instances);
    const aliveIds = new Set(checked.filter((c) => c.alive).map((c) => c.id));
    if (store.instances.some((i) => !aliveIds.has(i.id))) store.pruneInstances(aliveIds);
    return store.instances.filter((i) => aliveIds.has(i.id));
  }

  // 获取列表（附带运行状态、实例数与存活实例台账）
  ipcMain.handle('app:list', async () => {
    const entries = store.entries;
    const statuses = await getStatuses(entries);
    const instances = await aliveInstances();
    return {
      entries: entries.map((e) => ({ ...e, running: !!(statuses[e.id] > 0), instances: statuses[e.id] || 0 })),
      instances,
    };
  });

  // 仅刷新运行状态（复用进程列表缓存，降低轮询开销）
  ipcMain.handle('app:statuses', async () => {
    const statuses = await getStatuses(store.entries, false);
    const instances = await aliveInstances();
    return { statuses, instances };
  });

  // 手动添加
  ipcMain.handle('app:add', async (_e, data) => {
    const entry = normalizeManualEntry(data);
    store.addEntry(entry);
    return entry;
  });

  // 编辑（标记为用户手动修改，之后重扫不再覆盖其命令/参数）
  ipcMain.handle('app:update', async (_e, payload) => {
    const { id, patch } = payload || {};
    store.updateEntry(id, { ...patch, modifiedByUser: true });
    return store.findEntry(id);
  });

  // 删除（并记入忽略列表，避免重扫又出现）
  ipcMain.handle('app:remove', async (_e, id) => {
    const ignored = new Set(store.getSetting('ignoredIds', []));
    ignored.add(id);
    store.setSetting('ignoredIds', Array.from(ignored));
    store.removeEntry(id);
    return true;
  });

  // 一键启动（登记实例，支持多开）
  ipcMain.handle('app:launch', async (_e, id) => {
    const entry = store.findEntry(id);
    if (!entry) throw new Error('条目不存在');
    const result = await launch(entry);
    const inst = {
      id: 'inst-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      entryId: id,
      kind: result.kind === 'cli' ? 'cli' : 'gui',
      marker: result.marker || '',
      pid: result.pid || 0,
      startedAt: result.startedAt || new Date().toISOString(),
    };
    store.addInstance(inst);
    return { ...result, id, instanceId: inst.id };
  });

  // 一键终止（全部实例）：先按标记关闭各实例窗口（含小黑窗），再按条目特征清残留
  ipcMain.handle('app:terminate', async (_e, id) => {
    const entry = store.findEntry(id);
    if (!entry) throw new Error('条目不存在');
    for (const inst of store.instances.filter((i) => i.entryId === id)) {
      await terminateInstance(inst).catch(() => {});
    }
    const pids = await terminate(entry);
    store.removeInstancesForEntry(id);
    return { pids, id };
  });

  // 终止单个实例
  ipcMain.handle('app:terminate-instance', async (_e, instId) => {
    const inst = store.instances.find((i) => i.id === instId);
    if (!inst) return { pids: [] };
    const pids = await terminateInstance(inst);
    store.removeInstance(instId);
    return { pids };
  });

  // 选择工作目录
  ipcMain.handle('dialog:pick-folder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  // 选择可执行文件
  ipcMain.handle('dialog:pick-exe', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '可执行文件', extensions: ['exe', 'cmd', 'bat', 'com'] }],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  // 在资源管理器中打开目录
  ipcMain.handle('app:open-folder', async (_e, p) => {
    if (p) shell.openPath(p);
    return true;
  });

  // ===== 设置 =====
  ipcMain.handle('settings:get', async () => store.settings);
  ipcMain.handle('settings:set', async (_e, key, value) => {
    store.setSetting(key, value);
    return true;
  });

  // ===== 关于 =====
  ipcMain.handle('app:about', async () => {
    let homepage = '';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
      const repo = pkg && pkg.repository && pkg.repository.url;
      if (typeof repo === 'string') {
        homepage = repo.replace(/^git\+/, '').replace(/\.git$/, '');
      }
    } catch (e) {
      /* ignore */
    }
    return { version: app.getVersion(), homepage };
  });

  // ===== 为爱发电收款码（resources/donate.png，缺失时返回 null） =====
  ipcMain.handle('app:donate-image', async () => {
    try {
      const buf = fs.readFileSync(path.join(__dirname, '..', '..', 'resources', 'donate.png'));
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) return img.toDataURL();
    } catch (e) {
      /* 无收款码 */
    }
    return null;
  });

  // ===== 在默认浏览器打开链接 =====
  ipcMain.handle('app:open-url', async (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url);
    return true;
  });

  // ===== 撤销删除（恢复条目） =====
  ipcMain.handle('app:restore', async (_e, entry) => {
    if (!entry || !entry.id) return false;
    const ignored = new Set(store.getSetting('ignoredIds', []));
    ignored.delete(entry.id);
    store.setSetting('ignoredIds', Array.from(ignored));
    store.addEntry(entry);
    return true;
  });

  // ===== 卡片图标（exe 提取，带磁盘缓存：二次启动秒出图标） =====
  const iconCache = new Map();
  let diskIconCache = null;
  function loadDiskIconCache() {
    if (diskIconCache) return diskIconCache;
    try {
      diskIconCache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'icons-cache.json'), 'utf8')) || {};
    } catch (e) {
      diskIconCache = {};
    }
    return diskIconCache;
  }
  function saveDiskIconCache() {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'icons-cache.json'), JSON.stringify(diskIconCache));
    } catch (e) {
      /* ignore */
    }
  }
  ipcMain.handle('app:icons', async (_e, paths) => {
    const disk = loadDiskIconCache();
    const out = {};
    let dirty = false;
    for (const p of Array.isArray(paths) ? paths : []) {
      if (!p || !String(p).toLowerCase().endsWith('.exe')) continue;
      if (iconCache.has(p)) {
        out[p] = iconCache.get(p);
        continue;
      }
      if (disk[p] !== undefined) {
        iconCache.set(p, disk[p]);
        out[p] = disk[p];
        continue;
      }
      try {
        const img = await app.getFileIcon(p, { size: 'normal' });
        const url = img && !img.isEmpty() ? img.toDataURL() : null;
        iconCache.set(p, url);
        disk[p] = url;
        dirty = true;
        out[p] = url;
      } catch (e) {
        iconCache.set(p, null);
        disk[p] = null;
        dirty = true;
        out[p] = null;
      }
    }
    if (dirty) saveDiskIconCache();
    return out;
  });

  // ===== 内置官方图标（特征库条目的离线 logo，运行时不联网） =====
  const agentsDir = path.join(__dirname, '..', '..', 'resources', 'agents');
  const logoCache = new Map();
  ipcMain.handle('app:logos', async (_e, catalogIds) => {
    const out = {};
    for (const cid of Array.isArray(catalogIds) ? catalogIds : []) {
      if (!cid) continue;
      if (logoCache.has(cid)) {
        out[cid] = logoCache.get(cid);
        continue;
      }
      let url = null;
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(agentsDir, 'manifest.json'), 'utf8'));
        const file = manifest[cid];
        if (file) {
          const buf = fs.readFileSync(path.join(agentsDir, file));
          // 解码校验：坏文件返回 null（渲染层回退到占位符），避免出现裂图
          const img = nativeImage.createFromBuffer(buf);
          if (!img.isEmpty()) url = img.toDataURL();
        }
      } catch (e) {
        /* 缺资源时保持 null */
      }
      logoCache.set(cid, url);
      out[cid] = url;
    }
    return out;
  });

  // ===== 更新 =====
  ipcMain.handle('update:check', async () => updater.checkNow());
  ipcMain.handle('update:install', async () => updater.quitAndInstall());

  // ===== 列表导出 / 导入 =====
  ipcMain.handle('app:export', async () => {
    const res = await dialog.showSaveDialog({
      title: '导出列表',
      defaultPath: 'ai-dock-list.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false };
    const payload = { version: 1, exportedAt: new Date().toISOString(), entries: store.entries };
    fs.writeFileSync(res.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: res.filePath };
  });

  ipcMain.handle('app:import', async () => {
    const res = await dialog.showOpenDialog({
      title: '导入列表',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false };
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    } catch (e) {
      return { ok: false, error: '文件格式无效' };
    }
    const incoming = Array.isArray(payload.entries) ? payload.entries : [];
    const existingIds = new Set(store.entries.map((e) => e.id));
    let added = 0;
    for (const it of incoming) {
      if (!it || !it.name) continue;
      const entry = normalizeManualEntry({
        name: it.name,
        launchType: it.launchType,
        installPath: it.installPath || '',
        command: it.command || '',
        args: it.args || [],
        workdir: it.workdir || '',
        description: it.description || '',
        note: it.note || '',
      });
      if (it.id && !existingIds.has(it.id)) entry.id = it.id;
      if (existingIds.has(entry.id)) continue;
      entry.appId = it.appId || '';
      store.addEntry(entry);
      existingIds.add(entry.id);
      added++;
    }
    return { ok: true, added };
  });

  // ===== 置顶（不视为修改命令/参数） =====
  ipcMain.handle('app:pin', async (_e, id, pinned) => {
    store.updateEntry(id, { pinned: !!pinned });
    return true;
  });
}

// ===== 环境自检 =====
async function checkPowerShell() {
  const r = await runPowerShellJson('ConvertTo-Json -InputObject "ok"');
  return r === 'ok';
}

async function checkWt() {
  try {
    const out = await runCmd('where wt');
    return out.trim().length > 0;
  } catch (e) {
    return false;
  }
}

async function checkNpm() {
  try {
    await runCmd('npm root -g');
    return true;
  } catch (e) {
    return false;
  }
}

function normalizeManualEntry(data) {
  const launchType =
    data && data.launchType === 'cli' ? 'cli' : data && data.launchType === 'store' ? 'store' : 'gui';
  return {
    id: 'manual:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: (data && data.name) || '未命名',
    category: (data && data.category) || 'custom',
    launchType,
    description: (data && data.description) || '',
    command: launchType === 'cli' ? (data.command || '') : '',
    args: parseArgs(data && data.args),
    workdir: (data && data.workdir) || '',
    installPath: launchType === 'cli' ? '' : (data.installPath || ''),
    note: (data && data.note) || '',
    detectedBy: 'manual',
    sourceLabel: '手动添加',
    catalogId: null,
    confirmed: true,
    modifiedByUser: true,
    version: '',
    homepage: '',
  };
}

function parseArgs(args) {
  if (Array.isArray(args)) return args;
  if (typeof args === 'string') {
    const m = args.match(/(?:[^\s"]+|"[^"]*")+/g);
    return (m || []).map((s) => s.replace(/^"|"$/g, ''));
  }
  return [];
}

module.exports = { registerIpc, normalizeManualEntry };
