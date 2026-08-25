'use strict';

// 图标提取测试：查看 getFileIcon 对各种路径（含商店应用）的实际返回。
const { app } = require('electron');

app.whenReady().then(async () => {
  const paths = [
    'C:\\Windows\\System32\\notepad.exe',
    'C:\\Program Files (x86)\\Lenovo\\LeAppStore\\LeASDyTile.exe',
    'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.818.5229.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe',
    'C:\\Program Files\\WindowsApps\\Microsoft.MicrosoftOfficeHub_19.2608.49021.0_x64__8wekyb3d8bbwe\\M365Copilot.exe',
  ];
  for (const p of paths) {
    try {
      const img = await app.getFileIcon(p, { size: 'small' });
      const s = img.getSize();
      const url = img.isEmpty() ? null : img.toDataURL();
      console.log('OK  empty=' + img.isEmpty() + ' size=' + s.width + 'x' + s.height + ' dataUrlLen=' + (url ? url.length : 0) + ' path=' + p);
    } catch (e) {
      console.log('ERR ' + e.message + ' path=' + p);
    }
  }
  app.exit(0);
});
