'use strict';

// AI Dock 检测自检：以 electron 主进程方式运行，输出检测结果后退出。
// 用法：npx electron scripts/scan-test.js
const { app } = require('electron');
const { runScan } = require('../src/main/detect');
const { listProcesses } = require('../src/main/process/manager');

app.whenReady().then(async () => {
  try {
    console.log('==== AI Dock 检测自检 ====');

    const procs = await listProcesses(true);
    console.log('WMI 进程列表（含命令行）数量:', procs.length);

    const scan = await runScan();
    const detected = scan.entries;
    console.log('\n检测到条目数:', detected.length);
    console.log('来源统计:', JSON.stringify(scan.stats));
    for (const e of detected) {
      console.log('----------------------------------------');
      console.log('名称:', e.name, e.version ? '(v' + e.version + ')' : '');
      console.log('类型:', e.launchType, '| 分类:', e.category, '| 确认:', e.confirmed);
      console.log('命令:', e.command || '(空)', '| commandPath:', e.commandPath || '(空)');
      console.log('路径:', e.installPath || '(空)');
      console.log('来源:', e.sourceLabel);
    }
    console.log('==== 自检完成 ====');
  } catch (e) {
    console.error('SELFTEST ERROR:', e && e.stack ? e.stack : e);
    app.exit(1);
  } finally {
    app.exit(0);
  }
});
