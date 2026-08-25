'use strict';

// GUI 启动/终止测试：用记事本验证桌面应用的直启与镜像名终止。
const { app } = require('electron');
const { launch, terminate, getStatus } = require('../src/main/process/manager');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entry = {
  id: 'test-notepad',
  name: 'Notepad',
  launchType: 'gui',
  command: '',
  args: [],
  workdir: '',
  installPath: 'C:\\Windows\\System32\\notepad.exe',
};

app.whenReady().then(async () => {
  try {
    console.log('== GUI 启动测试（notepad）==');
    const r = await launch(entry);
    console.log('launch 返回:', JSON.stringify(r));
    await sleep(2500);
    console.log('running(2.5s 后):', await getStatus(entry));
    const pids = await terminate(entry);
    console.log('terminate 命中 PID:', JSON.stringify(pids));
    await sleep(1500);
    console.log('running(terminate 后):', await getStatus(entry));
    console.log('== 测试完成 ==');
  } catch (e) {
    console.error('GUI TEST ERROR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
