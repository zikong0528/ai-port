'use strict';

// 图标渲染链路测试：加载真实渲染页，检查卡片上是否出现真实图标 img。
const path = require('path');
const os = require('os');
const { app, BrowserWindow } = require('electron');
const { Store } = require('../src/main/store/store');
const { registerIpc } = require('../src/main/ipc');

app.whenReady().then(async () => {
  try {
    const store = new Store(path.join(os.tmpdir(), 'aidock-smoke-config.json'));
    registerIpc({ store });
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 1200));
    // 关闭首次引导弹窗，让列表真正渲染（否则卡片不会出现，图标链路无法被测到）
    await win.webContents.executeJavaScript(
      `(document.querySelector('#onboard-start') || { click() {} }).click()`
    );
    await new Promise((r) => setTimeout(r, 15000));
    const state = await win.webContents.executeJavaScript(`({
      imgs: [...document.querySelectorAll('.card-icon')].map((i) => i.src.slice(0, 40)),
      phs: [...document.querySelectorAll('.icon-ph')].map((e) => e.textContent),
    })`);
    console.log(JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('ICON FLOW ERROR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
