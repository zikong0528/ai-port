'use strict';

// 第五轮：为仍坏掉的条目下载候选源，并用 nativeImage 立即验证可解码后存为 PNG。
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');

const CANDIDATES = {
  chatgpt: [
    'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/openai.svg',
    'https://icon.horse/icon/chatgpt.com',
    'https://favicon.im/chatgpt.com',
  ],
  'microsoft-copilot': [
    'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/microsoftcopilot.svg',
    'https://icon.horse/icon/copilot.microsoft.com',
  ],
  aider: ['https://aider.chat/assets/icons/favicon-32x32.png', 'https://icon.horse/icon/aider.chat'],
  goose: ['https://icon.horse/icon/block.github.io', 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/goose.svg'],
  chatbox: ['https://chatboxai.app/favicon.ico', 'https://chatboxai.app/icon.png', 'https://favicon.im/chatboxai.app'],
};

app.whenReady().then(async () => {
  const dir = path.join(__dirname, '..', 'resources', 'agents');
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const [id, urls] of Object.entries(CANDIDATES)) {
    let done = false;
    for (const url of urls) {
      try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) throw new Error('empty');
        // 用 nativeImage 验证可解码并转 PNG（SVG 通过 dataURL 转）
        let png = null;
        if (url.endsWith('.svg')) {
          const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + buf.toString('base64'));
          if (!img.isEmpty()) png = img.toPNG();
        } else {
          const img = nativeImage.createFromBuffer(buf);
          if (!img.isEmpty()) png = img.toPNG();
        }
        if (!png || !png.length) throw new Error('undecodable');
        for (const f of fs.readdirSync(dir)) {
          if (f.startsWith(id + '.') && f !== 'manifest.json') fs.unlinkSync(path.join(dir, f));
        }
        const file = id + '.png';
        fs.writeFileSync(path.join(dir, file), png);
        manifest[id] = file;
        console.log('OK   ' + id + ' <- ' + url + ' -> PNG ' + png.length + ' bytes');
        done = true;
        break;
      } catch (e) {
        console.log('FAIL ' + id + ' <- ' + url + ' : ' + (e && e.message ? e.message : e));
      }
    }
    if (!done) console.log('GIVEUP ' + id);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('完成');
  app.exit(0);
});
