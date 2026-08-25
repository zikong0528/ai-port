'use strict';

// 多实例测试：启动两个 CLI 实例 → 验证都存活 → 只终止实例1 → 验证实例2仍在 → 终止实例2。
const { app } = require('electron');
const { launch, checkInstances, terminateInstance } = require('../src/main/process/manager');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entry = {
  id: 'test-ping',
  name: 'Ping',
  launchType: 'cli',
  command: 'ping',
  commandPath: '',
  args: ['-t', '127.0.0.1'],
  installPath: '',
  workdir: '',
};

app.whenReady().then(async () => {
  try {
    const r1 = await launch(entry);
    const r2 = await launch(entry);
    const insts = [
      { id: 'i1', kind: r1.kind, marker: r1.marker || '', pid: r1.pid || 0 },
      { id: 'i2', kind: r2.kind, marker: r2.marker || '', pid: r2.pid || 0 },
    ];
    console.log('== 多实例测试 ==');
    console.log('markers:', r1.marker, '/', r2.marker);
    await sleep(4000);
    console.log('启动后:', JSON.stringify(await checkInstances(insts)));

    const pids = await terminateInstance(insts[0]);
    console.log('终止实例1 命中 PID:', JSON.stringify(pids));
    await sleep(2000);
    console.log('终止实例1 后:', JSON.stringify(await checkInstances(insts)));

    await terminateInstance(insts[1]);
    await sleep(1500);
    console.log('终止实例2 后:', JSON.stringify(await checkInstances(insts)));
    console.log('== 完成 ==');
  } catch (e) {
    console.error('INST TEST ERROR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
