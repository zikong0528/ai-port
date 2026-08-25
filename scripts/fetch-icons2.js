'use strict';

// 第二轮：为失败的条目尝试备用 URL（多候选依次尝试），并合并进 manifest.json。
const fs = require('fs');
const path = require('path');

const CANDIDATES = {
  'claude-code': ['https://claude.ai/favicon.ico', 'https://www.anthropic.com/favicon.ico', 'https://icon.horse/icon/claude.ai', 'https://favicon.im/claude.ai'],
  'claude-desktop': ['https://claude.ai/favicon.ico', 'https://icon.horse/icon/claude.ai'],
  chatgpt: ['https://chatgpt.com/favicon.ico', 'https://openai.com/favicon.ico', 'https://icon.horse/icon/chatgpt.com', 'https://favicon.im/chatgpt.com'],
  'microsoft-copilot': ['https://copilot.microsoft.com/favicon.ico', 'https://icon.horse/icon/copilot.microsoft.com'],
  'gemini-cli': ['https://gemini.google.com/favicon.ico', 'https://icon.horse/icon/gemini.google.com'],
  'gemini-desktop': ['https://gemini.google.com/favicon.ico', 'https://icon.horse/icon/gemini.google.com'],
  jan: ['https://jan.ai/favicon.ico', 'https://icon.horse/icon/jan.ai'],
  perplexity: ['https://www.perplexity.ai/favicon.ico', 'https://icon.horse/icon/perplexity.ai'],
  monica: ['https://monica.im/favicon.ico', 'https://icon.horse/icon/monica.im'],
  ollama: ['https://ollama.com/favicon.ico', 'https://ollama.com/public/ollama.png', 'https://icon.horse/icon/ollama.com'],
  tongyi: ['https://tongyi.aliyun.com/favicon.ico', 'https://tongyi.aliyun.com/static/favicon.ico', 'https://icon.horse/icon/tongyi.aliyun.com'],
  aider: ['https://aider.chat/favicon.ico', 'https://aider.chat/assets/icons/favicon-32x32.png', 'https://icon.horse/icon/aider.chat'],
  goose: ['https://block.github.io/goose/favicon.ico', 'https://icon.horse/icon/block.github.io'],
  'cherry-studio': ['https://cherry-ai.com/favicon.ico', 'https://cherry-ai.com/logo.png', 'https://icon.horse/icon/cherry-ai.com'],
  anythingllm: ['https://anythingllm.com/favicon.ico', 'https://anythingllm.com/favicon.png', 'https://icon.horse/icon/anythingllm.com'],
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
  if (ct.includes('png')) ext = '.png';
  else if (ct.includes('svg')) ext = '.svg';
  return { buf, ext };
}

async function main() {
  for (const [id, urls] of Object.entries(CANDIDATES)) {
    if (manifest[id]) {
      console.log('SKIP ' + id + '（已有）');
      continue;
    }
    let done = false;
    for (const url of urls) {
      try {
        const { buf, ext } = await tryFetch(url);
        const file = id + ext;
        fs.writeFileSync(path.join(outDir, file), buf);
        manifest[id] = file;
        console.log('OK   ' + id + ' <- ' + url + ' (' + buf.length + ' bytes)');
        done = true;
        break;
      } catch (e) {
        console.log('FAIL ' + id + ' <- ' + url + ' : ' + (e && e.message ? e.message : e));
      }
    }
    if (!done) console.log('GIVEUP ' + id);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('完成，manifest 共 ' + Object.keys(manifest).length + ' 个');
}

main();
