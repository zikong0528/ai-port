'use strict';

// 第四轮：favicon.im 已被证明可达且返回真实图标，用它刷新全部条目（失败则保留旧图）。
const fs = require('fs');
const path = require('path');

const DOMAINS = {
  'claude-code': 'claude.ai',
  'claude-desktop': 'claude.ai',
  'deepseek-harness': 'deepseek.com',
  'deepseek-desktop': 'deepseek.com',
  chatgpt: 'chatgpt.com',
  'microsoft-copilot': 'copilot.microsoft.com',
  'gemini-cli': 'gemini.google.com',
  'gemini-desktop': 'gemini.google.com',
  kimi: 'kimi.moonshot.cn',
  doubao: 'doubao.com',
  wenxin: 'yiyan.baidu.com',
  tongyi: 'tongyi.aliyun.com',
  cursor: 'cursor.com',
  windsurf: 'windsurf.com',
  ollama: 'ollama.com',
  'lm-studio': 'lmstudio.ai',
  jan: 'jan.ai',
  gpt4all: 'gpt4all.io',
  aider: 'aider.chat',
  goose: 'block.github.io',
  opencode: 'opencode.ai',
  'amazon-q': 'aws.amazon.com',
  chatbox: 'chatboxai.app',
  'cherry-studio': 'cherry-ai.com',
  anythingllm: 'anythingllm.com',
  perplexity: 'perplexity.ai',
  monica: 'monica.im',
  comfyui: 'comfy.org',
};

const outDir = path.join(__dirname, '..', 'resources', 'agents');
const manifestPath = path.join(outDir, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

async function main() {
  for (const [id, domain] of Object.entries(DOMAINS)) {
    const url = 'https://favicon.im/' + domain;
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error('empty');
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let ext = '.ico';
      if (ct.includes('png')) ext = '.png';
      else if (ct.includes('svg')) ext = '.svg';
      const file = id + ext;
      for (const f of fs.readdirSync(outDir)) {
        if (f.startsWith(id + '.') && f !== 'manifest.json') fs.unlinkSync(path.join(outDir, f));
      }
      fs.writeFileSync(path.join(outDir, file), buf);
      manifest[id] = file;
      console.log('OK   ' + id + ' (' + buf.length + ' bytes)');
    } catch (e) {
      console.log('KEEP ' + id + '（保留旧图）: ' + (e && e.message ? e.message : e));
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('完成');
}

main();
