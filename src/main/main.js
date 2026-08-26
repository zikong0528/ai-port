'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, shell, screen } = require('electron');
const { Store } = require('./store/store');
const { registerIpc } = require('./ipc');
const updater = require('./updater');

let mainWindow = null;
let store = null;

app.setAppUserModelId('com.aidock.launcher');

// ===== 内存/进程优化：移除崩溃上报守护；GPU 保留硬加速避免渲染卡顿 =====
app.commandLine.appendSwitch('disable-breakpad'); // 移除 crashpad 守护进程
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // 被遮挡时少算遮挡，省 CPU

// ===== 单实例锁：二次启动聚焦已有窗口 =====
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(onReady);
}

// ===== 环境韧性：未知异常不弹系统错误框，只写日志（打包后 uncaughtException 默认弹框） =====
function appendCrashLog(err) {
  try {
    const dir = path.join(app.getPath('appData'), 'ai-dock');
    fs.mkdirSync(dir, { recursive: true });
    const line = new Date().toISOString() + ' ' + String((err && err.stack) || err) + '\n';
    fs.appendFileSync(path.join(dir, 'crash.log'), line);
  } catch (e) {
    /* ignore */
  }
}
process.on('uncaughtException', (err) => {
  appendCrashLog(err);
});
process.on('unhandledRejection', (reason) => {
  appendCrashLog(reason);
});

function onReady() {
  // 用户数据目录固定（不随产品名变化），并迁移旧版 "AI Dock" 目录的数据
  const dataDir = path.join(app.getPath('appData'), 'ai-dock');
  app.setPath('userData', dataDir);
  try {
    const legacyDir = path.join(app.getPath('appData'), 'AI Dock');
    if (!fs.existsSync(path.join(dataDir, 'config.json')) && fs.existsSync(path.join(legacyDir, 'config.json'))) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.copyFileSync(path.join(legacyDir, 'config.json'), path.join(dataDir, 'config.json'));
      if (fs.existsSync(path.join(legacyDir, 'icons-cache.json'))) {
        fs.copyFileSync(path.join(legacyDir, 'icons-cache.json'), path.join(dataDir, 'icons-cache.json'));
      }
    }
  } catch (e) {
    /* 迁移失败不影响启动 */
  }

  store = new Store(path.join(dataDir, 'config.json'));
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
    title: 'AI Port',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  };

  // 恢复上次的窗口大小与位置（校验位置仍在某块屏幕内，防止拔掉外接屏后窗口跑到屏幕外）
  const bounds = store ? store.getSetting('windowBounds', null) : null;
  if (
    bounds &&
    typeof bounds.width === 'number' &&
    bounds.width >= opts.minWidth &&
    typeof bounds.height === 'number' &&
    bounds.height >= opts.minHeight
  ) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return (
        bounds.x < a.x + a.width &&
        bounds.x + bounds.width > a.x &&
        bounds.y < a.y + a.height &&
        bounds.y + bounds.height > a.y
      );
    });
    if (onScreen) {
      opts.x = bounds.x;
      opts.y = bounds.y;
      opts.width = bounds.width;
      opts.height = bounds.height;
    }
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
