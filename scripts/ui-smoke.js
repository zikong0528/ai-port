'use strict';

// UI 冒烟测试：加载真实渲染页，验证 preload/IPC/扫描/列表全链路，输出结果后退出。
const path = require('path');
const os = require('os');
const { app, BrowserWindow } = require('electron');
const { Store } = require('../src/main/store/store');
const { registerIpc } = require('../src/main/ipc');

app.whenReady().then(async () => {
  try {
    // 用临时配置，避免污染用户真实数据
    const tmpConfig = path.join(os.tmpdir(), 'aidock-smoke-config.json');
    const store = new Store(tmpConfig);
    registerIpc({ store });

    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'src', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    const errors = [];
    win.webContents.on('console-message', (event, ...rest) => {
      errors.push(
        '[console] ' + rest.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
      );
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      errors.push('[load-fail] ' + code + ' ' + desc);
    });

    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 2000));

    const ui = await win.webContents.executeJavaScript(`({
      hasApi: typeof window.aidock === 'object',
      chips: document.querySelectorAll('.chip').length,
      hasList: !!document.querySelector('#list'),
      emptyVisible: !document.querySelector('#empty').classList.contains('hidden')
    })`);

    const scan = await win.webContents.executeJavaScript(`window.aidock.scan()`);
    const listCount = await win.webContents.executeJavaScript(
      `window.aidock.list().then(r => r.entries.length)`
    );

    console.log('==== UI 冒烟测试 ====');
    console.log('window.aidock 存在:', ui.hasApi);
    console.log('分类 chips 数量:', ui.chips);
    console.log('列表容器存在:', ui.hasList);
    console.log('初始空状态显示:', ui.emptyVisible);
    console.log('scan 结果:', JSON.stringify(scan));
    console.log('scan 后列表条目数:', listCount);
    console.log('--- 页面错误 ---');
    console.log(errors.length ? errors.join('\n') : '(无)');
    console.log('==== 冒烟测试完成 ====');
    app.exit(0);
  } catch (e) {
    console.error('SMOKE ERROR:', e && e.stack ? e.stack : e);
    app.exit(1);
  }
});
