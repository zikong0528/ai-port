'use strict';

const { app } = require('electron');

/**
 * 自动更新（electron-updater）。
 * 仅支持安装版（NSIS）；便携版与开发模式不启用，全部静默失败。
 */
function isSupported() {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
}

function send(getWindow, payload) {
  try {
    const win = getWindow && getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update:event', payload);
  } catch (e) {
    /* ignore */
  }
}

/**
 * 启动后延迟检查更新（有新版自动下载，事件推送到渲染进程）。
 */
function setup(getWindow) {
  if (!isSupported()) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) =>
    send(getWindow, { type: 'available', version: info && info.version })
  );
  autoUpdater.on('update-downloaded', (info) =>
    send(getWindow, { type: 'downloaded', version: info && info.version })
  );
  autoUpdater.on('error', () => {});
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 6000);
}

/**
 * 手动检查更新（设置面板「检查更新」按钮）。
 */
async function checkNow() {
  if (!isSupported()) return { available: false, unsupported: true };
  try {
    const { autoUpdater } = require('electron-updater');
    const res = await autoUpdater.checkForUpdates();
    return { available: !!res, version: res ? res.updateInfo.version : '' };
  } catch (e) {
    return { available: false, error: String((e && e.message) || e) };
  }
}

/**
 * 下载完成后退出并安装。
 */
function quitAndInstall() {
  if (!isSupported()) return false;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { setup, checkNow, quitAndInstall };
