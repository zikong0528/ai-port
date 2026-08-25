'use strict';

// 状态探测自检：扫描后对每个条目查询运行状态，验证进程匹配逻辑。
const { app } = require('electron');
const { runScan } = require('../src/main/detect');
const { getStatuses } = require('../src/main/process/manager');

app.whenReady().then(async () => {
  try {
    const detected = (await runScan()).entries;
    const statuses = await getStatuses(detected, true);
    console.log('==== 状态探测自检 ====');
    for (const e of detected) {
      console.log(e.name + ' => running: ' + !!statuses[e.id]);
    }
    console.log('==== 完成 ====');
  } catch (e) {
    console.error('STATUS TEST ERROR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
