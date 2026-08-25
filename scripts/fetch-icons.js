'use strict';

// 下载特征库各 AI 的官方 favicon 到 resources/agents/，并生成 manifest.json。
// 一次性离线内置，运行时不联网（保持「完全本地」的隐私承诺）。
const fs = require('fs');
const path = require('path');

const ICONS = {
  'claude-code': 'https://claude.ai/favicon.ico',
  'claude-desktop': 'https://claude.ai/favicon.ico',
  'deepseek-harness': 'https://www.deepseek.com/favicon.ico',
  'deepseek-desktop': 'https://www.deepseek.com/favicon.ico',
  chatgpt: 'https://chatgpt.com/favicon.ico',
  'microsoft-copilot': 'https://copilot.microsoft.com/favicon.ico',
  'gemini-cli': 'https://gemini.google.com/favicon.ico',
  'gemini-desktop': 'https://gemini.google.com/favicon.ico',
  kimi: 'https://kimi.moonshot.cn/favicon.ico',
  doubao: 'https://www.doubao.com/favicon.ico',
  wenxin: 'https://yiyan.baidu.com/favicon.ico',
  tongyi: 'https://tongyi.aliyun.com/favicon.ico',
  cursor: 'https://cursor.com/favicon.ico',
  windsurf: 'https://windsurf.com/favicon.ico',
  ollama: 'https://ollama.com/favicon.ico',
  'lm-studio': 'https://lmstudio.ai/favicon.ico',
  jan: 'https://jan.ai/favicon.ico',
  gpt4all: 'https://gpt4all.io/favicon.ico',
  aider: 'https://aider.chat/favicon.ico',
  goose: 'https://block.github.io/goose/favicon.ico',
  opencode: 'https://opencode.ai/favicon.ico',
  'amazon-q': 'https://aws.amazon.com/favicon.ico',
  chatbox: 'https://chatboxai.app/favicon.ico',
  'cherry-studio': 'https://cherry-ai.com/favicon.ico',
  anythingllm: 'https://anythingllm.com/favicon.ico',
  perplexity: 'https://www.perplexity.ai/favicon.ico',
  monica: 'https://monica.im/favicon.ico',
  comfyui: 'https://www.comfy.org/favicon.ico',
};

const outDir = path.join(__dirname, '..', 'resources', 'agents');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const manifest = {};
  for (const [id, url] of Object.entries(ICONS)) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        console.log('FAIL ' + res.status + ' ' + id);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let ext = '.ico';
      if (ct.includes('png')) ext = '.png';
      else if (ct.includes('svg')) ext = '.svg';
      const file = id + ext;
      fs.writeFileSync(path.join(outDir, file), buf);
      manifest[id] = file;
      console.log('OK   ' + id + ' -> ' + file + ' (' + buf.length + ' bytes)');
    } catch (e) {
      console.log('ERR  ' + id + ': ' + (e && e.message ? e.message : e));
    }
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('完成，共 ' + Object.keys(manifest).length + ' 个：' + JSON.stringify(manifest));
}

main();
