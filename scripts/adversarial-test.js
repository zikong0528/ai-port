'use strict';

// 对抗性测试：防改名 / 乱名 / 冒名 / 错误地址 / 空文件夹 / PWA / 占位脚本 等欺骗场景。
// 用法：npx electron scripts/adversarial-test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { app } = require('electron');
const catalog = require('../src/main/detect/catalog');
const detect = require('../src/main/detect');
const { matchSpecFor, normCmdline, cmdlineHasToken, buildHostFilter, matchPids } = require('../src/main/process/manager');
const { findMainExe } = require('../src/main/detect/localprograms-scanner');
const { getExeInfoBatch } = require('../src/main/detect/exe-info');

let failed = 0;
let passed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log('PASS  ' + name);
  } else {
    failed++;
    console.log('FAIL  ' + name);
  }
}
function eq(name, a, b) {
  check(name + ' => ' + JSON.stringify(a) + ' === ' + JSON.stringify(b), JSON.stringify(a) === JSON.stringify(b));
}

app.whenReady().then(async () => {
  let fixture = '';
  try {
    // ===== 1. 特征库匹配信号（防乱名/冒名的判断基础）=====
    const m1 = catalog.matchCatalogDetailed({ displayName: '豆包' });
    check('豆包 仅名字命中 → signal=displayName', m1 && m1.signal === 'displayName' && m1.entry.id === 'doubao');
    const m2 = catalog.matchCatalogDetailed({ displayName: 'RandomApp', exeName: 'ChatGPT.exe' });
    check('exe 名命中 ChatGPT → signal=exeName', m2 && m2.signal === 'exeName' && m2.entry.id === 'chatgpt');
    const m3 = catalog.matchCatalogDetailed({ displayName: 'X', companyName: 'Anthropic PBC', productName: 'Claude' });
    check('公司名 Anthropic+产品名 Claude 命中 → signal=companyName', m3 && m3.signal === 'companyName' && m3.entry.id === 'claude-desktop');
    const m3b = catalog.matchCatalogDetailed({ displayName: 'X', companyName: 'OpenAI Corporation', productName: 'ChatGPT' });
    check('公司名 OpenAI+产品名 ChatGPT 命中（防改名）', m3b && m3b.signal === 'companyName' && m3b.entry.id === 'chatgpt');
    const m3c = catalog.matchCatalogDetailed({ displayName: 'Microsoft Word', companyName: 'Microsoft Corporation', productName: 'Microsoft Word' });
    check('宽厂商 Microsoft + 非 AI 产品名 → 不命中 Copilot', m3c === null);
    const m3d = catalog.matchCatalogDetailed({ displayName: 'CapCut', companyName: 'ByteDance Pte. Ltd.', productName: 'CapCut' });
    check('宽厂商 ByteDance + 非 AI 产品名 → 不命中豆包', m3d === null);
    const m4 = catalog.matchCatalogDetailed({ storePackage: 'OpenAI.Codex' });
    check('商店包名 OpenAI.Codex 命中 → signal=storePackage', m4 && m4.signal === 'storePackage' && m4.entry.id === 'chatgpt');
    const m5 = catalog.matchCatalogDetailed({ npmPackage: '@anthropic-ai/claude-code' });
    check('npm 包命中 claude → signal=npmPackage', m5 && m5.signal === 'npmPackage' && m5.entry.id === 'claude-code');
    const m6 = catalog.matchCatalogDetailed({ pathExecutable: 'dsh' });
    check('PATH 命令 dsh 命中 → signal=pathExecutable', m6 && m6.signal === 'pathExecutable' && m6.entry.id === 'deepseek-harness');
    check('无关名字 → null', catalog.matchCatalogDetailed({ displayName: 'zzz-not-ai' }) === null);

    // ===== 2. looksLikeAI 宽泛识别（乱名兜底）=====
    check('Adobe AIR 不误判 AI', catalog.looksLikeAI('Adobe AIR') === false);
    check('Notepad 不误判 AI', catalog.looksLikeAI('Notepad') === false);
    check('ChatGPT 识别', catalog.looksLikeAI('ChatGPT') === true);
    check('豆包 识别', catalog.looksLikeAI('豆包') === true);
    check('通义千问 识别', catalog.looksLikeAI('通义千问') === true);

    // ===== 3. 元数据否决（冒名顶替）=====
    const doubao = catalog.matchCatalog({ displayName: '豆包' });
    check('豆包 + Lenovo 公司 → 否决', catalog.companyVeto(doubao, 'Lenovo') === true);
    check('豆包 + 空公司名 → 不否决(交由佐证规则)', catalog.companyVeto(doubao, '') === false);
    check('豆包 + ByteDance → 不否决', catalog.companyVeto(doubao, 'ByteDance Inc') === false);

    // ===== 4. 自身排除（防把自己当 AI）=====
    check('AI Port 0.1.0 视为自身', detect.isSelf('AI Port 0.1.0', 'C:\\AI Port.exe') === true);
    check('ai-dock 视为自身(旧名)', detect.isSelf('ai-dock', '') === true);
    check('AI DOCK 1.2.3 视为自身(旧名带版本)', detect.isSelf('AI DOCK 1.2.3', '') === true);
    check('ChatGPT 非自身', detect.isSelf('ChatGPT', 'C:\\Program Files\\ChatGPT.exe') === false);
    check('AI PORTABLE 非自身(前缀陷阱)', detect.isSelf('AI PORTABLE', 'C:\\x.exe') === false);

    // ===== 5. 命令行归一化与 token 匹配 =====
    eq('双反斜杠归一化(斜杠也归一)', normCmdline('C:\\a\\\\b /C'), 'c:\\a\\b \\c');
    check('claude 长命令路径边界命中', cmdlineHasToken('c:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js x', 'claude'));
    check('dsh 短命令整词命中', cmdlineHasToken('cmd /c dsh web', 'dsh'));
    check('dsh 路径片段不误命中', cmdlineHasToken('c:\\dsh\\bin\\x', 'dsh') === false);
    check('单字符命令不参与 token', cmdlineHasToken('x q y', 'q') === false);

    // ===== 6. 进程匹配规则（启动/终止/状态）=====
    eq(
      'GUI exe → 镜像名',
      JSON.stringify(matchSpecFor({ launchType: 'gui', installPath: 'C:\\Windows\\System32\\notepad.exe' })),
      JSON.stringify({ kind: 'image', value: 'notepad.exe' })
    );
    eq(
      'GUI 浏览器+参数 → 命令行(PWA)',
      JSON.stringify(matchSpecFor({ launchType: 'gui', installPath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: ['--app-id=abc'] })),
      JSON.stringify({ kind: 'cmdline', value: '--app-id=abc', browser: true })
    );
    eq(
      '商店应用 → 镜像名',
      JSON.stringify(matchSpecFor({ launchType: 'store', installPath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_x\\app\\ChatGPT.exe' })),
      JSON.stringify({ kind: 'image', value: 'chatgpt.exe' })
    );
    eq(
      'CLI → cli 规则',
      JSON.stringify(matchSpecFor({ launchType: 'cli', command: 'dsh', installPath: 'C:\\npm\\@deepseek-ai\\dsh' })),
      JSON.stringify({ kind: 'cli', installPath: 'c:\\npm\\@deepseek-ai\\dsh', command: 'dsh' })
    );

    // ===== 7. 去重键 =====
    const k1 = detect.entryKey({ launchType: 'cli', command: 'dsh', installPath: 'a' });
    const k2 = detect.entryKey({ launchType: 'cli', command: 'DSH', installPath: 'b' });
    check('CLI 同命令去重', k1 === k2);

    // ===== 8. .lnk 参数解析（PWA）=====
    eq(
      'lnk 参数解析',
      JSON.stringify(detect.parseLnkArgs('"--profile-directory=Default" --app-id=abc123')),
      JSON.stringify(['--profile-directory=Default', '--app-id=abc123'])
    );

    // ===== 9. 磁盘夹具：空文件夹 / 假 exe / 真 exe =====
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aiport-adv-'));
    const emptyDir = path.join(fixture, 'ChatGPT-empty');
    fs.mkdirSync(emptyDir);
    check('空文件夹不产出 exe', findMainExe(emptyDir, 'ChatGPT-empty') === '');
    const fakeDir = path.join(fixture, 'ChatGPT');
    fs.mkdirSync(fakeDir);
    const fakeExe = path.join(fakeDir, 'ChatGPT.exe');
    fs.writeFileSync(fakeExe, 'echo this is not a real exe');
    check('目录内假 exe 被找出(供上层佐证规则降级)', findMainExe(fakeDir, 'ChatGPT') === fakeExe);
    const metaFake = await getExeInfoBatch([fakeExe]);
    const mf = metaFake[fakeExe.toLowerCase()];
    check('假 exe 元数据为空且不崩溃', mf !== undefined && !mf.companyName && !mf.productName);
    const extraDir = path.join(fixture, 'extras');
    fs.mkdirSync(extraDir);
    const realExe = path.join(extraDir, 'real.exe');
    fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe'), realExe);
    const metaReal = await getExeInfoBatch([realExe]);
    check('真 exe 元数据可读(防改名底层识别)', (metaReal[realExe.toLowerCase()] || {}).companyName === 'Microsoft Corporation');

    // ===== 10. bin 兜底校验（占位脚本 vs 真 PE，错误地址防线）=====
    check('文本占位 .exe 不是真 PE', detect.isRealExe(fakeExe) === false);
    check('真实 where.exe 是真 PE', detect.isRealExe(realExe) === true);
    const pkgDir = path.join(fixture, 'pkg');
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
    fs.copyFileSync(realExe, path.join(pkgDir, 'bin', 'real.exe'));
    fs.writeFileSync(path.join(pkgDir, 'bin', 'fake.exe'), 'echo placeholder');
    const npmRoot = path.join(fixture, 'node_modules');
    fs.mkdirSync(npmRoot, { recursive: true });
    eq('bin 兜底: 真 PE 命中', detect.resolveCommand('real', new Map(), npmRoot, pkgDir), path.join(pkgDir, 'bin', 'real.exe'));
    eq('bin 兜底: 占位脚本拒绝', detect.resolveCommand('fake', new Map(), npmRoot, pkgDir), '');
    const pm = new Map([['real', 'C:\\path\\win.exe']]);
    eq('bin 兜底: PATH 优先', detect.resolveCommand('real', pm, npmRoot, pkgDir), 'C:\\path\\win.exe');

    // ===== 11. 浏览器宿主清单 =====
    check('msedge 是 PWA 宿主', catalog.BROWSER_HOSTS.has('msedge.exe'));
    check('notepad 不是 PWA 宿主', !catalog.BROWSER_HOSTS.has('notepad.exe'));

    // ===== 12. WMI 宿主过滤器（手动裸命令 CLI 可被状态/终止发现）=====
    const f1 = buildHostFilter(['ping']);
    check('裸命令 ping → 过滤含 ping.exe', f1.includes("Name='ping.exe'"));
    const f2 = buildHostFilter(['claude.cmd']);
    check('.cmd 命令名原样入过滤', f2.includes("Name='claude.cmd'"));
    const f3 = buildHostFilter(['aider.exe']);
    check('.exe 命令名原样入过滤', f3.includes("Name='aider.exe'"));

    // ===== 13. 标题守护循环不参与 token 匹配（防误杀其他实例的标题守护）=====
    const pingSpec = { kind: 'cli', installPath: '', command: 'ping' };
    const procsFixture = [
      { pid: 1, name: 'cmd.exe', cmdline: 'for /l %i in (1,1,1000000) do (title ai port - x - 00:00:00 & ping -n 6 127.0.0.1 >nul)' },
      { pid: 2, name: 'ping.exe', cmdline: 'ping -t 127.0.0.1' },
      { pid: 3, name: 'conhost.exe', cmdline: '' },
    ];
    eq('标题守护循环被排除, 真实 ping 命中', JSON.stringify(matchPids(pingSpec, procsFixture)), JSON.stringify([2]));

    console.log('==== 对抗性测试完成: ' + passed + ' 通过, ' + failed + ' 失败 ====');
  } catch (e) {
    console.error('ADV TEST ERROR:', e && e.stack ? e.stack : e);
    failed++;
  } finally {
    try {
      if (fixture) fs.rmSync(fixture, { recursive: true, force: true });
    } catch (e) {
      /* ignore */
    }
    app.exit(failed ? 1 : 0);
  }
});
