'use strict';

// 第三轮：用国内可达的图标服务（api.iowen.cn）重新下载「疑似通用占位图」的条目。
// 覆盖旧文件并更新 manifest。
const fs = require('fs');
const path = require('path');

const CANDIDATES = {
  'claude-code': ['https://api.iowen.cn/favicon/claude.ai.png', 'https://api.iowen.cn/favicon/claude.com.png', 'https://favicon.im/claude.ai'],
  'claude-desktop': ['https://api.iowen.cn/favicon/claude.ai.png', 'https://api.iowen.cn/favicon/claude.com.png'],
  chatgpt: ['https://api.iowen.cn/favicon/chatgpt.com.png', 'https://api.iowen.cn/favicon/openai.com.png'],
  'microsoft-copilot': ['https://api.iowen.cn/favicon/copilot.microsoft.com.png'],
  'gemini-cli': ['https://api.iowen.cn/favicon/gemini.google.com.png'],
  'gemini-desktop': ['https://api.iowen.cn/favicon/gemini.google.com.png'],
  jan: ['https://api.iowen.cn/favicon/jan.ai.png'],
  perplexity: ['https://api.iowen.cn/favicon/perplexity.ai.png'],
  monica: ['https://api.iowen.cn/favicon/monica.im.png'],
  tongyi: ['https://api.iowen.cn/favicon/tongyi.aliyun.com.png'],
  goose: ['https://api.iowen.cn/favicon/block.github.io.png', 'https://api.iowen.cn/favicon/github.com.png'],
  'cherry-studio': ['https://api.iowen.cn/favicon/cherry-ai.com.png'],
  anythingllm: ['https://api.iowen.cn/favicon/anythingllm.com.png'],
  kimi: ['https://api.iowen.cn/favicon/kimi.moonshot.cn.png'],
  opencode: ['https://api.iowen.cn/favicon/opencode.ai.png'],
  comfyui: ['https://api.iowen.cn/favicon/comfy.org.png'],
  'lm-studio': ['https://api.iowen.cn/favicon/lmstudio.ai.png'],
  'deepseek-harness': ['https://api.iowen.cn/favicon/deepseek.com.png'],
  'deepseek-desktop': ['https://api.iowen.cn/favicon/deepseek.com.png'],
};

const outDir = path.join(__dirname, '..', 'resources', 'agents');
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

async function tryFetch(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('empty');
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  let ext = '.ico';
  if (ct.includes('png') || url.includes('.png')) ext = '.png';
  else if (ct.includes('svg')) ext = '.svg';
  return { buf, ext };
}

async function main() {
  for (const [id, urls] of Object.entries(CANDIDATES)) {
    let done = false;
    for (const url of urls) {
      try {
        const { buf, ext } = await tryFetch(url);
        const file = id + ext;
        // 删除旧文件（扩展名可能不同）
        for (const f of fs.readdirSync(outDir)) {
          if (f.startsWith(id + '.') && f !== 'manifest.json') fs.unlinkSync(path.join(outDir, f));
        }
        fs.writeFileSync(path.join(outDir, file), buf);
        manifest[id] = file;
        console.log('OK   ' + id + ' <- ' + url + ' (' + buf.length + ' bytes)');
        done = true;
        break;
      } catch (e) {
        console.log('FAIL ' + id + ' <- ' + url + ' : ' + (e && e.message ? e.message : e));
      }
    }
    if (!done) console.log('GIVEUP ' + id + '（保留旧图标）');
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('完成，manifest 共 ' + Object.keys(manifest).length + ' 个');
}

main();
