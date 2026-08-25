'use strict';

const { t, setLang } = window.I18N;

let entries = [];
let searchText = '';
let editingId = null; // null 表示「添加」模式
let scanning = false;
let settings = { lang: 'auto', darkMode: false, onboarded: false };
const icons = {}; // installPath -> dataURL（真实应用图标）
const iconRequested = new Set();
const logos = {}; // catalogId -> dataURL（内置官方图标，离线）
const logoRequested = new Set();
let trackedInstances = []; // 本 app 启动的存活实例台账
const expandedIds = new Set(); // 展开实例列表的卡片
let aboutHomepage = ''; // 项目主页（来自 package.json）

const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitArgs(text) {
  const m = String(text || '').match(/(?:[^\s"]+|"[^"]*")+/g);
  return (m || []).map((s) => s.replace(/^"|"$/g, ''));
}

function toast(msg, ms = 2200, actionLabel = '', actionFn = null) {
  const el = $('#toast');
  el.querySelector('.toast-msg').textContent = msg;
  const btn = el.querySelector('.toast-action');
  if (actionLabel && actionFn) {
    btn.textContent = actionLabel;
    btn.style.display = '';
    btn.onclick = () => {
      el.classList.add('hidden');
      actionFn();
    };
  } else {
    btn.style.display = 'none';
    btn.onclick = null;
  }
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

// ===== 初始化 =====
function init() {
  bindEvents();
  loadSettings().then(async () => {
    await refreshList();
    // 列表为空时自动扫描（首次启动/清空后的场景）
    if (!entries.length) onScan();
    startPolling();
    checkOnboarding();
  });
}

async function loadSettings() {
  try {
    const s = await window.aidock.settingsGet();
    if (s && typeof s === 'object') settings = Object.assign(settings, s);
  } catch (e) {
    /* 默认设置即可 */
  }
  applyLang();
  applyTheme();
}

function detectLang() {
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function applyLang() {
  const lang = settings.lang === 'en' ? 'en' : settings.lang === 'auto' ? detectLang() : 'zh';
  setLang(lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = t(el.getAttribute('data-i18n'));
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')) || '');
  });
  render();
}

function applyTheme() {
  if (settings.darkMode) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
}

// ===== 状态轮询（失焦暂停 + 降频） =====
let pollTimer = null;
const POLL_MS = 8000;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!document.hidden) refreshStatuses();
  }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    refreshStatuses();
    startPolling();
  }
});

// ===== 事件绑定 =====
function bindEvents() {
  $('#btn-scan').addEventListener('click', onScan);
  $('#btn-add').addEventListener('click', () => openModal(null));
  $('#btn-diag').addEventListener('click', openDiagnostics);
  $('#btn-settings').addEventListener('click', openSettings);

  $('#search').addEventListener('input', (e) => {
    searchText = e.target.value.trim().toLowerCase();
    render();
  });
  // 回车启动唯一匹配项
  $('#search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const visible = visibleEntries();
    if (visible.length === 1) onLaunch(visible[0].id);
  });

  // 卡片操作（事件委托）
  $('#list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'launch') onLaunch(id);
    else if (action === 'terminate') onTerminate(id);
    else if (action === 'edit') openModal(id);
    else if (action === 'remove') onRemove(id);
    else if (action === 'pin') onPin(id);
    else if (action === 'toggle-insts') onToggleInsts(id);
    else if (action === 'term-inst') onTerminateInstance(btn.dataset.inst);
  });

  // 添加/编辑弹窗
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-save').addEventListener('click', saveModal);
  $('#modal').addEventListener('click', (e) => {
    if (e.target === $('#modal')) closeModal();
  });
  $('#f-type').addEventListener('change', syncTypeRows);
  $('#f-exe-pick').addEventListener('click', pickExe);
  $('#f-workdir-pick').addEventListener('click', pickWorkdir);

  // 诊断
  $('#diag-close').addEventListener('click', closeDiagnostics);
  $('#diag-ok').addEventListener('click', closeDiagnostics);
  $('#diag-refresh').addEventListener('click', openDiagnostics);
  $('#diag-modal').addEventListener('click', (e) => {
    if (e.target === $('#diag-modal')) closeDiagnostics();
  });

  // 设置
  $('#settings-close').addEventListener('click', closeSettings);
  $('#settings-ok').addEventListener('click', closeSettings);
  $('#settings-modal').addEventListener('click', (e) => {
    if (e.target === $('#settings-modal')) closeSettings();
  });
  $('#set-dark').addEventListener('change', (e) => {
    settings.darkMode = e.target.checked;
    applyTheme();
    window.aidock.settingsSet('darkMode', settings.darkMode).catch(() => {});
  });
  $('#set-lang').addEventListener('change', (e) => {
    settings.lang = e.target.value;
    applyLang();
    window.aidock.settingsSet('lang', settings.lang).catch(() => {});
  });
  $('#btn-update').addEventListener('click', onCheckUpdate);
  $('#btn-export').addEventListener('click', onExport);
  $('#btn-import').addEventListener('click', onImport);
  $('#btn-homepage').addEventListener('click', () => {
    if (aboutHomepage) window.aidock.openUrl(aboutHomepage);
  });
  $('#btn-feedback').addEventListener('click', () => {
    if (aboutHomepage) window.aidock.openUrl(aboutHomepage + '/issues');
  });

  // 首次引导
  $('#onboard-start').addEventListener('click', closeOnboarding);

  // 自动更新事件
  window.aidock.onUpdateEvent((payload) => {
    if (!payload || !payload.type) return;
    if (payload.type === 'available') toast(t('updateAvailableToast', payload.version || ''), 4000);
    else if (payload.type === 'downloaded') toast(t('updateDownloadedToast', payload.version || ''), 6000);
  });
}

// ===== 数据 =====
async function refreshList() {
  try {
    const res = await window.aidock.list();
    entries = res.entries || [];
    trackedInstances = res.instances || [];
    render();
  } catch (err) {
    toast(t('listLoadFailed', err.message));
  }
}

async function refreshStatuses() {
  if (!entries.length) return;
  try {
    const res = await window.aidock.statuses();
    const statuses = res.statuses || res;
    trackedInstances = res.instances || [];
    let changed = false;
    for (const e of entries) {
      const count = statuses[e.id] || 0;
      const run = count > 0;
      if (e.running !== run || e.instances !== count) {
        e.running = run;
        e.instances = count;
        changed = true;
      }
    }
    if (changed) render();
  } catch (err) {
    /* 轮询失败忽略 */
  }
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  } catch (e) {
    return '';
  }
}

function sortedEntries() {
  return entries.slice().sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
  });
}

function visibleEntries() {
  const base = sortedEntries();
  if (!searchText) return base;
  return base.filter((e) => {
    const hay = (e.name + ' ' + (e.description || '') + ' ' + (e.command || '')).toLowerCase();
    return hay.includes(searchText);
  });
}

// ===== 渲染 =====
function render() {
  const list = $('#list');
  const empty = $('#empty');
  const visible = visibleEntries();

  if (!entries.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    $('#empty .empty-title').textContent = t('emptyTitle');
    $('#empty .empty-hint').textContent = t('emptyHint');
    return;
  }

  if (!visible.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    $('#empty .empty-title').textContent = t('noMatchTitle');
    $('#empty .empty-hint').textContent = t('noMatchHint');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = visible
    .map((e) => {
      const running = e.running;
      const insts = trackedInstances.filter((i) => i.entryId === e.id);
      const expanded = expandedIds.has(e.id);
      const sub = [e.sourceLabel, e.version ? 'v' + e.version : ''].filter(Boolean).join(' · ');
      const desc =
        e.description ||
        (e.launchType === 'cli' ? t('descCli') : e.launchType === 'store' ? t('descStore') : t('descGui'));
      return `
      <div class="card">
        <div class="card-top">
          ${cardIconHtml(e)}
          <span class="card-name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
          ${e.confirmed === false ? '<span class="tag">' + t('unconfirmed') + '</span>' : ''}
          ${e.pinned ? '<span class="tag">' + t('pin') + '</span>' : ''}
          <span class="status${running ? ' running' : ''}${insts.length ? ' expandable' : ''}" data-action="${insts.length ? 'toggle-insts' : ''}" data-id="${escapeHtml(e.id)}" title="${running ? t('running') : t('notRunning')}${insts.length ? ' · ' + t('expandHint') : ''}">
            <span class="status-dot"></span>
            ${running ? '<span class="status-text">' + t('running') + (insts.length > 1 ? ' ×' + insts.length : '') + '</span>' : ''}
            ${insts.length ? '<span class="inst-chev">' + (expanded ? '▾' : '▸') + '</span>' : ''}
          </span>
        </div>
        <div class="card-sub" title="${escapeHtml(sub)}">${escapeHtml(sub)}</div>
        <div class="card-desc">${escapeHtml(desc)}</div>
        ${e.note ? '<div class="card-note" title="' + escapeHtml(e.note) + '">' + t('note') + ' · ' + escapeHtml(e.note) + '</div>' : ''}
        <div class="card-foot">
          <button class="btn btn-primary btn-sm" data-action="launch" data-id="${escapeHtml(e.id)}">${t('launch')}</button>
          <button class="btn btn-outline btn-sm" data-action="terminate" data-id="${escapeHtml(e.id)}" ${running ? '' : 'disabled'} title="${t('terminateAllHint')}">${t('terminate')}</button>
          <span class="spacer"></span>
          <button class="btn btn-text btn-sm" data-action="pin" data-id="${escapeHtml(e.id)}">${e.pinned ? t('unpin') : t('pin')}</button>
          <button class="btn btn-text btn-sm" data-action="edit" data-id="${escapeHtml(e.id)}">${t('edit')}</button>
          <button class="btn btn-text btn-sm" data-action="remove" data-id="${escapeHtml(e.id)}">${t('remove')}</button>
        </div>
        ${insts.length ? `
        <div class="inst-list${expanded ? '' : ' hidden'}">
          ${insts
            .map(
              (inst) => `
          <div class="inst-row">
            <span class="inst-time">${t('instStarted', fmtTime(inst.startedAt))}</span>
            <button class="btn btn-outline btn-sm" data-action="term-inst" data-inst="${escapeHtml(inst.id)}">${t('terminate')}</button>
          </div>`
            )
            .join('')}
        </div>` : ''}
      </div>`;
    })
    .join('');

  requestIcons(visible);
  requestLogos(visible);
}

function requestLogos(list) {
  const ids = list
    .filter((e) => e.catalogId)
    .map((e) => e.catalogId)
    .filter((id) => !logos[id] && !logoRequested.has(id));
  if (!ids.length) return;
  ids.forEach((id) => logoRequested.add(id));
  window.aidock
    .logos(ids)
    .then((map) => {
      if (map && typeof map === 'object') {
        Object.assign(logos, map);
        render();
      }
    })
    .catch(() => {});
}

function onToggleInsts(id) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  render();
}

async function onTerminateInstance(instId) {
  try {
    await window.aidock.terminateInstance(instId);
    toast(t('terminated'));
    await refreshList();
  } catch (err) {
    toast(t('terminateFailed', err.message));
  }
}

function cardIconHtml(e) {
  // 商店应用的 exe 图标提取不可靠（WindowsApps 目录受保护，常为空白），只用内置官方图标
  if (e.launchType === 'store') {
    const logo = e.catalogId ? logos[e.catalogId] : null;
    if (logo) return `<img class="card-icon" src="${logo}" alt="" />`;
    const letter = escapeHtml((e.name || '?').trim().charAt(0).toUpperCase());
    return `<span class="icon-ph">${letter}</span>`;
  }
  // 桌面应用优先用 exe 内嵌真实图标
  const url = e.installPath ? icons[e.installPath] : null;
  if (url) return `<img class="card-icon" src="${url}" alt="" />`;
  // 其次用内置官方图标（离线，运行时不联网）
  const logo = e.catalogId ? logos[e.catalogId] : null;
  if (logo) return `<img class="card-icon" src="${logo}" alt="" />`;
  // 最后占位：命令行工具用终端符号，其余用首字母
  if (e.launchType === 'cli') return `<span class="icon-ph icon-cli">&gt;_</span>`;
  const letter = escapeHtml((e.name || '?').trim().charAt(0).toUpperCase());
  return `<span class="icon-ph">${letter}</span>`;
}

function requestIcons(list) {
  const paths = list
    .filter((e) => e.installPath && String(e.installPath).toLowerCase().endsWith('.exe'))
    .map((e) => e.installPath)
    .filter((p) => !icons[p] && !iconRequested.has(p));
  if (!paths.length) return;
  paths.forEach((p) => iconRequested.add(p));
  window.aidock
    .icons(paths)
    .then((map) => {
      if (map && typeof map === 'object') {
        Object.assign(icons, map);
        render();
      }
    })
    .catch(() => {});
}

// ===== 操作 =====
async function onScan() {
  if (scanning) return;
  scanning = true;
  const btn = $('#btn-scan');
  btn.disabled = true;
  btn.textContent = t('scanning');
  try {
    const res = await window.aidock.scan();
    toast(t('scanDone', res.added, res.refreshed, res.removed, res.total));
    await refreshList();
  } catch (err) {
    toast(t('scanFailed', err.message));
  } finally {
    scanning = false;
    btn.disabled = false;
    btn.textContent = t('scan');
  }
}

async function onLaunch(id) {
  try {
    await window.aidock.launch(id);
    toast(t('launched'));
    await refreshStatuses();
  } catch (err) {
    toast(t('launchFailed', err.message));
  }
}

async function onTerminate(id) {
  try {
    const res = await window.aidock.terminate(id);
    toast(res.pids && res.pids.length ? t('terminated') : t('notFoundRunning'));
    await refreshStatuses();
  } catch (err) {
    toast(t('terminateFailed', err.message));
  }
}

async function onRemove(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  if (!confirm(t('confirmRemove', entry.name))) return;
  await window.aidock.remove(id);
  toast(t('removedToast'), 5000, t('undo'), async () => {
    await window.aidock.restore(entry);
    await refreshList();
  });
  await refreshList();
}

async function onPin(id) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  render();
  await window.aidock.pin(id, entry.pinned).catch(() => {});
}

// ===== 添加/编辑弹窗 =====
function openModal(id) {
  editingId = id;
  $('#modal-title').textContent = id ? t('editEntry') : t('addEntry');
  const e = id ? entries.find((x) => x.id === id) : null;

  $('#f-name').value = e ? e.name : '';
  $('#f-type').value = e ? e.launchType : 'gui';
  $('#f-exe').value = e ? e.installPath || '' : '';
  $('#f-cmd').value = e ? e.command || '' : '';
  $('#f-args').value = e ? (e.args || []).join(' ') : '';
  $('#f-workdir').value = e ? e.workdir || '' : '';
  $('#f-note').value = e ? e.note || '' : '';

  syncTypeRows();
  $('#modal').classList.remove('hidden');
  $('#f-name').focus();
}

function closeModal() {
  $('#modal').classList.add('hidden');
  editingId = null;
}

function syncTypeRows() {
  const isCli = $('#f-type').value === 'cli';
  $('#f-exe-row').classList.toggle('hidden', isCli);
  $('#f-cmd-row').classList.toggle('hidden', !isCli);
}

async function pickExe() {
  const p = await window.aidock.pickExe();
  if (p) $('#f-exe').value = p;
}

async function pickWorkdir() {
  const p = await window.aidock.pickFolder();
  if (p) $('#f-workdir').value = p;
}

async function saveModal() {
  const launchType = $('#f-type').value; // 'gui' | 'cli' | 'store'
  const name = $('#f-name').value.trim();
  if (!name) {
    toast(t('nameRequired'));
    return;
  }
  const data = {
    name,
    launchType,
    installPath: launchType === 'cli' ? '' : $('#f-exe').value.trim(),
    command: launchType === 'cli' ? $('#f-cmd').value.trim() : '',
    args: splitArgs($('#f-args').value),
    workdir: $('#f-workdir').value.trim(),
    note: $('#f-note').value.trim(),
  };

  if (launchType === 'cli' && !data.command) {
    toast(t('commandRequired'));
    return;
  }
  if (launchType === 'gui' && !data.installPath) {
    toast(t('pathRequired'));
    return;
  }

  try {
    if (editingId) {
      await window.aidock.update(editingId, data);
      toast(t('saved'));
    } else {
      await window.aidock.add(data);
      toast(t('addedToast'));
    }
    closeModal();
    await refreshList();
  } catch (err) {
    toast(t('saveFailed', err.message));
  }
}

// ===== 诊断 =====
async function openDiagnostics() {
  $('#diag-modal').classList.remove('hidden');
  const body = $('#diag-body');
  body.innerHTML = '<div class="diag-loading">' + t('diagLoading') + '</div>';
  try {
    const d = await window.aidock.diagnostics();
    body.innerHTML = renderDiagnostics(d);
  } catch (err) {
    body.innerHTML = '<div class="diag-loading">' + t('diagFailed', escapeHtml(err.message)) + '</div>';
  }
}

function closeDiagnostics() {
  $('#diag-modal').classList.add('hidden');
}

function renderDiagnostics(d) {
  const env = [
    [t('envPowerShell'), d.env.powershell],
    [t('envWt'), d.env.windowsTerminal],
    [t('envNpm'), d.env.npm],
  ]
    .map(
      ([name, ok]) =>
        `<div class="diag-row"><span class="diag-label">${name}</span><span class="diag-value ${ok ? 'ok' : 'bad'}">${ok ? t('envOk') : t('envBad')}</span></div>`
    )
    .join('');

  const sources = [
    [t('srcStartMenu'), d.stats.startmenu],
    [t('srcRegistry'), d.stats.registry],
    [t('srcLocal'), d.stats.localprograms],
    [t('srcStore'), d.stats.appx],
    [t('srcNpm'), d.stats.npm],
    [t('srcPath'), d.stats.path],
  ]
    .map(
      ([name, n]) =>
        `<div class="diag-row"><span class="diag-label">${name}</span><span class="diag-value">${n || 0}</span></div>`
    )
    .join('');

  return `
    <div class="diag-section">${t('envSection')}</div>
    ${env}
    <div class="diag-section">${t('sourceSection')}</div>
    ${sources}
    <div class="diag-section">${t('summarySection')}</div>
    <div class="diag-row"><span class="diag-label">${t('detectedCount')}</span><span class="diag-value">${d.detected}</span></div>
    <div class="diag-row"><span class="diag-label">${t('listedCount')}</span><span class="diag-value">${d.listed}</span></div>
  `;
}

// ===== 设置 =====
async function openSettings() {
  $('#settings-modal').classList.remove('hidden');
  $('#set-dark').checked = !!settings.darkMode;
  $('#set-lang').value = settings.lang || 'auto';
  try {
    const about = await window.aidock.about();
    $('#about-version').textContent = 'v' + (about.version || '');
    aboutHomepage = about.homepage || '';
  } catch (e) {
    $('#about-version').textContent = '';
    aboutHomepage = '';
  }
}

function closeSettings() {
  $('#settings-modal').classList.add('hidden');
}

async function onCheckUpdate() {
  const el = $('#update-status');
  el.textContent = t('checkingUpdate');
  try {
    const r = await window.aidock.checkUpdate();
    if (r.available) el.textContent = t('updateFound', r.version);
    else if (r.unsupported) el.textContent = t('updateUnsupported');
    else el.textContent = t('updateLatest');
  } catch (err) {
    el.textContent = t('updateFailed', err.message);
  }
}

async function onExport() {
  try {
    const r = await window.aidock.exportList();
    if (r.ok) toast(t('exportDone', r.path), 4000);
  } catch (err) {
    toast(t('saveFailed', err.message));
  }
}

async function onImport() {
  try {
    const r = await window.aidock.importList();
    if (!r.ok) {
      if (r.error) toast(t('importFailed', r.error));
      return;
    }
    toast(t('importDone', r.added));
    await refreshList();
  } catch (err) {
    toast(t('importFailed', err.message));
  }
}

// ===== 首次引导 =====
function checkOnboarding() {
  if (!settings.onboarded) $('#onboard-modal').classList.remove('hidden');
}

function closeOnboarding() {
  $('#onboard-modal').classList.add('hidden');
  settings.onboarded = true;
  window.aidock.settingsSet('onboarded', true).catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
