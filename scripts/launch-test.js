'use strict';

// 启动/终止真机测试：用无害的 ping 模拟 CLI 进程，验证启动→状态→终止全链路。
const { app } = require('electron');
const { launch, terminate, getStatus, listProcesses } = require('../src/main/process/manager');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entry = {
  id: 'test-ping',
  name: 'Test Ping',
  launchType: 'cli',
  command: 'ping',
  args: ['-t', '127.0.0.1'],
  installPath: '',
  workdir: '',
};

app.whenReady().then(async () => {
  try {
    console.log('== 启动测试（CLI：ping -t 127.0.0.1）==');
    const r = await launch(entry);
    console.log('launch 返回:', JSON.stringify(r));
    await sleep(4000);

    console.log('running(4s 后):', await getStatus(entry));

    const procs = await listProcesses(true);
    const hits = procs.filter((p) => p.cmdline && p.cmdline.includes('ping'));
    console.log('命令行含 "ping" 的进程:');
    for (const p of hits) {
      console.log('  [' + p.name + '] pid=' + p.pid + '  ' + p.cmdline.slice(0, 140));
    }

    const pids = await terminate(entry);
    console.log('terminate 命中 PID:', JSON.stringify(pids));
    await sleep(2000);
    console.log('running(terminate 后):', await getStatus(entry));
    console.log('== 测试完成 ==');
  } catch (e) {
    console.error('LAUNCH TEST ERROR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
