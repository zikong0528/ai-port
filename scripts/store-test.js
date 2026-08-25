'use strict';

// 商店应用启动/终止测试：真实打开 ChatGPT（商店应用），验证 shell:AppsFolder 启动与镜像名终止。
const { app } = require('electron');
const { launch, terminate, getStatus } = require('../src/main/process/manager');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const entry = {
  id: 'test-chatgpt',
  name: 'ChatGPT',
  launchType: 'store',
  appId: 'OpenAI.Codex_2p2nqsd0c76g0!App',
  installPath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.818.5229.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe',
  args: [],
  workdir: '',
};

app.whenReady().then(async () => {
  try {
    console.log('== 商店应用启动测试（ChatGPT）==');
    const r = await launch(entry);
    console.log('launch 返回:', JSON.stringify(r));
    await sleep(9000); // 商店应用冷启动较慢
    console.log('running(9s 后):', await getStatus(entry));
    const pids = await terminate(entry);
    console.log('terminate 命中 PID:', JSON.stringify(pids));
    await sleep(1500);
    console.log('running(terminate 后):', await getStatus(entry));
    console.log('== 测试完成 ==');
  } catch (e) {
    console.error('STORE TEST ERROR:', e && e.stack ? e.stack : e);
  } finally {
    app.exit(0);
  }
});
