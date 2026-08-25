'use strict';

// 把所有已下载图标统一转换为 PNG（favicon.im 返回混合格式，其中 WebP/SVG 可能导致渲染失败）。
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');

app.whenReady().then(() => {
  const dir = path.join(__dirname, '..', 'resources', 'agents');
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const [id, file] of Object.entries(manifest)) {
    const src = path.join(dir, file);
    try {
      const img = nativeImage.createFromPath(src);
      if (img.isEmpty()) {
        console.log('EMPTY ' + id + '（保留原文件）');
        continue;
      }
      const png = img.toPNG();
      const out = path.join(dir, id + '.png');
      fs.writeFileSync(out, png);
      if (path.resolve(out) !== path.resolve(src)) fs.unlinkSync(src);
      manifest[id] = id + '.png';
      const s = img.getSize();
      console.log('PNG  ' + id + ' -> ' + png.length + ' bytes, ' + s.width + 'x' + s.height);
    } catch (e) {
      console.log('ERR  ' + id + ': ' + (e && e.message ? e.message : e));
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('完成');
  app.exit(0);
});
