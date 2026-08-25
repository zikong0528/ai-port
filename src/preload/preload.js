'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的安全 API（contextIsolation 开启）
contextBridge.exposeInMainWorld('aidock', {
  scan: () => ipcRenderer.invoke('scan:run'),
  list: () => ipcRenderer.invoke('app:list'),
  statuses: () => ipcRenderer.invoke('app:statuses'),
  add: (data) => ipcRenderer.invoke('app:add', data),
  update: (id, patch) => ipcRenderer.invoke('app:update', { id, patch }),
  remove: (id) => ipcRenderer.invoke('app:remove', id),
  launch: (id) => ipcRenderer.invoke('app:launch', id),
  terminate: (id) => ipcRenderer.invoke('app:terminate', id),
  terminateInstance: (instId) => ipcRenderer.invoke('app:terminate-instance', instId),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickExe: () => ipcRenderer.invoke('dialog:pick-exe'),
  openFolder: (p) => ipcRenderer.invoke('app:open-folder', p),
  diagnostics: () => ipcRenderer.invoke('diagnostics:run'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  about: () => ipcRenderer.invoke('app:about'),
  openUrl: (url) => ipcRenderer.invoke('app:open-url', url),
  restore: (entry) => ipcRenderer.invoke('app:restore', entry),
  icons: (paths) => ipcRenderer.invoke('app:icons', paths),
  logos: (ids) => ipcRenderer.invoke('app:logos', ids),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateEvent: (cb) => ipcRenderer.on('update:event', (_e, payload) => cb(payload)),
  exportList: () => ipcRenderer.invoke('app:export'),
  importList: () => ipcRenderer.invoke('app:import'),
  pin: (id, pinned) => ipcRenderer.invoke('app:pin', id, pinned),
});
