'use strict';

const path = require('path');
const { app, BrowserWindow, shell } = require('electron');
const { Store } = require('./store/store');
const { registerIpc } = require('./ipc');
const updater = require('./updater');

let mainWindow = null;
let store = null;

app.setAppUserModelId('com.aidock.launcher');

// ===== 单实例锁：二次启动聚焦已有窗口 =====
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(onReady);
}

function onReady() {
  store = new Store(path.join(app.getPath('userData'), 'config.json'));
  createWindow();
  registerIpc({ store, getWindow: () => mainWindow });
  updater.setup(() => mainWindow);

  app.on('activate', () => showWindow());
}

function createWindow() {
  const opts = {
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 500,
    title: 'AI Dock',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  // 恢复上次的窗口大小与位置
  const bounds = store ? store.getSetting('windowBounds', null) : null;
  if (
    bounds &&
    typeof bounds.width === 'number' &&
    bounds.width >= opts.minWidth &&
    typeof bounds.height === 'number' &&
    bounds.height >= opts.minHeight
  ) {
    opts.x = bounds.x;
    opts.y = bounds.y;
    opts.width = bounds.width;
    opts.height = bounds.height;
  }

  mainWindow = new BrowserWindow(opts);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 记忆窗口位置大小（防抖保存）
  let saveTimer = null;
  const saveBounds = () => {
    if (!store || !mainWindow || mainWindow.isDestroyed()) return;
    try {
      if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
        store.setSetting('windowBounds', mainWindow.getBounds());
      }
    } catch (e) {
      /* ignore */
    }
  };
  mainWindow.on('resize', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveBounds, 500);
  });
  mainWindow.on('move', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveBounds, 500);
  });
  mainWindow.on('close', saveBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
