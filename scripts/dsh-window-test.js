'use strict';

// 实测：通过 app 机制启动 dsh web，观察窗口(conhost)增减、进程树、终止后残留。
const { app } = require('electron');
const { launch, checkInstances, terminateInstance, listProcesses } = require('../src/main/process/manager');
const { run } = require('../src/main/util/exec');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entry = {
  id: 'test-dsh',
  name: 'DeepSeek Harness',
  launchType: 'cli',
  command: 'dsh',
  commandPath: 'C:\\Users\\Lenovo\\AppData\\Roaming\\npm\\dsh.cmd',
  args: ['web'],
  installPath: 'C:\\Users\\Lenovo\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh',
  workdir: '',
};

app.whenReady().then(async () => {
  const countConhost = async () =>
    (await run('tasklist.exe', ['/FI', 'IMAGENAME eq conhost.exe', '/NH'])).split(/\r?\n/).filter((l) => l.trim()).length;
  try {
    const c1 = await countConhost();
    const r = await launch(entry);
    console.log('marker:', r.marker);
    await sleep(10000);

    const c2 = await countConhost();
    console.log('conhost 数量:', c1, '->', c2);

    let procs = await listProcesses(true);
    console.log('--- 含 marker 的进程 ---');
    procs.filter((p) => p.cmdline && p.cmdline.includes(r.marker)).forEach((p) => console.log(' ', p.name, p.pid, p.cmdline.slice(0, 130)));
    console.log('--- 含 dsh/bin.js 的进程 ---');
    procs.filter((p) => p.cmdline && p.cmdline.includes('bin.js') && p.cmdline.includes('dsh')).forEach((p) => console.log(' ', p.name, p.pid, p.cmdline.slice(0, 130)));

    const inst = { id: 'i1', kind: 'cli', marker: r.marker, pid: 0 };
    console.log('终止前 alive:', JSON.stringify(await checkInstances([inst])));
    const pids = await terminateInstance(inst);
    console.log('terminate 命中 PID:', JSON.stringify(pids));
    await sleep(3000);

    const c3 = await countConhost();
    console.log('conhost 终止后:', c3);
    procs = await listProcesses(true);
    console.log('剩余 dsh/bin.js 进程数:', procs.filter((p) => p.cmdline && p.cmdline.includes('bin.js') && p.cmdline.includes('dsh')).length);
    console.log('终止后 alive:', JSON.stringify(await checkInstances([inst])));
  } catch (e) {
    console.error('TEST ERR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
