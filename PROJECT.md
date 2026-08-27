# AI Port 项目手册（新会话 / 协作者必读）

> 任何新会话接续本项目时，请先通读本文档，再看 `git log` 了解变更历史。

## 1. 当前状态（请以本段为最新）

- **版本**：v0.1.0 开发完成，代码已本地 git 提交，**待自测后推送 GitHub**。
- **代码位置**：`E:\deep seek Harness\AI-Port`
- **GitHub**：https://github.com/zikong0528/ai-port （仓库已建，remote 已配置为 SSH）
- **发布步骤**（按顺序）：
  1. 自测（清单见 §5）
  2. 推送：`git push -u origin main` → `git tag v0.1.0` → `git push origin v0.1.0`
  3. GitHub Actions 自动构建安装包+便携版挂到 Releases
  4. 发布前最后一步：**代码签名**（或上架 Microsoft Store）
- **2.0 路线**：Tauri 迁移（内存 30-50MB）、列表/网格视图切换、崩溃上报（需后端）、ARM64、更多语言。

## 2. 项目是什么

**AI Port**：Windows 桌面启动器。自动检索本机已安装的 AI 应用与 CLI agent（注册表/开始菜单/商店应用/npm 全局/PATH/本地程序目录 + exe 底层元数据防改名），统一列表，一键启动（GUI 直启 / CLI 开终端）、一键终止（进程树），支持**多开与按实例分别终止**。

- 技术栈：Electron 44 + 原生 Node（无前端框架）；electron-builder 打包（NSIS + portable）；electron-updater 自动更新（仅安装版）。
- 设计原则：黑白极简 UI；**完全本地、零联网**（图标内置）；**无托盘**（关闭即退出）；无开机自启；中英双语。

## 3. 架构

```
src/main/
  main.js            入口：单实例锁、窗口、窗口位置记忆（多屏校验）、内存优化开关（禁 breakpad/拼写，GPU 保留硬加速）
  ipc.js             全部 IPC：扫描合并/列表/状态/启停/实例/图标/logo/设置/诊断/关于/更新/撤销
  updater.js         electron-updater 封装（便携版与开发模式自动跳过）
  store/store.js     JSON 持久化：entries / settings / instances（实例台账）
  detect/
    catalog.json     特征库（28 个 AI）：displayNamePatterns/exeNames/storePackageNames/companyNames/npmPackages/pathExecutables/defaultCommand/defaultArgs
    catalog.js       特征库加载 + matchCatalog（含 companyName/productName 底层元数据匹配）+ looksLikeAI
    index.js         编排 runScan() → { entries, stats }；自身排除（AI Port 不识别自己）
    startmenu-scanner.js   开始菜单 .lnk（shell.readShortcutLink + 目标存在性校验）
    registry-scanner.js    注册表卸载项（PowerShell，失败自动降级 reg.exe）
    appx-scanner.js        Windows 商店应用（Get-StartApps + manifest 取真实 exe）
    npm-scanner.js         npm 全局包（npm root -g，返回 npmRoot 供完整路径启动）
    path-scanner.js        PATH 可执行（扩展名优先级 .exe>.com>.cmd>.bat>.ps1>无扩展名）
    localprograms-scanner.js  %LOCALAPPDATA%\Programs（无开始菜单的按用户安装）
    exe-info.js            批量读 exe 内嵌 VersionInfo（公司名/产品名 = 防改名底层识别）
  process/manager.js   启动/终止/按实例终止/状态探测/进程列表（WMI+tasklist 降级）
  util/exec.js           run/runCmd/runPowerShellJson（30 秒超时 + PowerShell UTF-8 输出）
  util/realpaths.js      真实用户路径（商店版 MSIX 会把 APPDATA/LOCALAPPDATA 重定向，检索必须用 USERPROFILE 派生路径）
  util/exec.js         run/runCmd/runPowerShellJson（30 秒超时 + PowerShell UTF-8 输出）
src/preload/preload.js contextBridge API
src/renderer/         index.html + app.js + i18n.js（zh/en）+ styles/theme.css（黑白设计令牌，html[data-theme=dark] 深色）
resources/agents/     28 个内置官方图标（统一 PNG）+ manifest.json
resources/icon.*      应用图标（scripts/make-icon.js 生成，纯 Node 手写 PNG 编码器）
scripts/              测试与工具脚本（见 §5）
.github/workflows/release.yml   tag v* 触发构建 + 发布 Release
```

**数据模型（AppEntry）**：id、name、category、launchType(gui/cli/store)、command、commandPath、args、workdir、installPath、appId(商店)、note(用户备注)、pinned、confirmed、modifiedByUser、catalogId、sourceLabel、version。

## 4. 关键决策记录（为什么这么做，改动前必读）

1. **CLI 用经典控制台而非 Windows Terminal**：WT 标签页在 shell 被强杀后残留「进程已退出」且无法程序化关闭；经典 conhost 窗口与进程树绑定，终止即关闭（用 conhost 进程数增减实测验证过）。
2. **实例隐形标记**：多开同名进程无法区分 → 启动命令尾部追加 `& rem aidock-i-<rand>`，按标记精确识别/终止单个实例；实例台账持久化（重启 app 不丢）。
3. **双反斜杠归一化**：npm 的 .cmd shim 会把路径拼成 `npm\\node_modules`，匹配前必须把命令行与路径都归一化（合并 `\\`、`/`→`\`、小写）。
4. **短命令 token 匹配**：dsh 只有 3 字符，长命令用路径边界、短命令用整词边界（空格/引号）、单字符命令（q）不参与 token 匹配（只靠安装路径）。
5. **标题守护 bat 三个坑**：① bat 必须纯 ASCII（cmd 按 GBK 读 bat，UTF-8 的「·」会变「路」）；② 后台循环必须 `cmd /q /c`（否则循环体命令回显刷屏）；③ 延迟用 `ping -n 6 127.0.0.1 >nul`（`timeout` 会抢 TUI 的 stdin）。窗口标题 = `AI Port - 名字 - HH:MM:SS`，与实例列表的启动时间对号入座。
6. **商店应用图标**：WindowsApps 目录受保护，exe 图标提取为空白 → store 条目只用内置 logo（不取 exe 图标）。
7. **PowerShell 编码与降级**：输出强制 UTF-8（否则中文名乱码）；PowerShell 不可用 → 注册表降级 reg.exe（chcp 65001）、进程列表降级 tasklist（无命令行，CLI 匹配退化）。
8. **失效条目自动清理**：重扫时，自动检测且用户未修改（modifiedByUser 为假）的条目若已检测不到则自动移除；用户手动编辑过的不动。
9. **图标策略**：exe 图标 > 内置官方 logo > 终端符号(`>_`)/首字母；图标有磁盘缓存（userData/icons-cache.json）与运行时解码校验（坏文件退回占位符，绝不裂图）。
10. **自身排除**：AI Port 不识别自己（名称去版本号归一化 + exe 名 + 进程路径三重判断）。
11. **npm 包「半安装」防御与修复**：claude 自更新时网络中断会留下半安装现场（bin 里是 echo 占位脚本、全局 shim 丢失、@scope 下有 `.claude-code-XXXX` 备份目录、真身在 `node_modules/<pkg>-win32-x64/` 或备份目录里）。扫描侧：跳过 @scope 下 `.` 开头的残留目录；shim 丢失时兜底直连包内 bin 的可执行文件（校验 MZ 头+大小下限，占位脚本无效）。机器修复配方：用 PE 头找出完好二进制（SizeOfImage 与文件大小大致吻合才算好）→ 坏目录改名挪走 → 备份目录扶正 → 复制真身到 `bin\` → 重建 claude.cmd/claude.ps1/claude 三个 shim。商店应用自动更新后 installPath/appId 随重扫自动刷新。
12. **商店版 ChatGPT 26.820 启动失败（OpenAI bug）的绕过**：该版把 codex.exe 从 WindowsApps「搬运」到 `%LOCALAPPDATA%\OpenAI\Codex\bin\` 时失败（WindowsApps 文件带 EFS 加密，普通 copyfile 报 "could not be encrypted"，errno -4094），随后报 "Unable to locate the Codex CLI binary"。绕过配方：① 用流式读+明文写（`[IO.File]::OpenRead`→`[IO.File]::Create`+`CopyTo`）把 `resources\codex.exe` 解密复制到 `%LOCALAPPDATA%\AIPort\codex\codex.exe`；② 设用户级环境变量 `CODEX_CLI_PATH` 指向副本；③ 重启 explorer 生效。验证：启动后出现 `codex` 子进程且日志 `post_initialize_connection_state → connected`。OpenAI 修复后需移除该变量并删除副本目录。
13. **商店版 MSIX 环境变量重定向**：打包为商店应用后，APPDATA/LOCALAPPDATA 会被重定向到包私有目录（`LocalCache`），直接读这些环境变量会找不到开始菜单快捷方式 / npm 全局包 / `%LOCALAPPDATA%\Programs`。所有检索必须走 `util/realpaths.js`（用 USERPROFILE 派生真实路径）；给子进程（`npm root -g`）注入真实环境变量。
14. **防欺骗佐证规则**：GUI 条目仅靠「名字」命中特征库时，必须由 exe 文件名或底层元数据（公司名/产品名/原始文件名）佐证，否则降级为「疑似冒名」候选（防乱名 + 无元数据假 exe 冒充）；PWA 浏览器宿主（msedge/chrome 等）豁免。开始菜单 .lnk 自带的参数与工作目录必须保留（否则 PWA 启动的不是原应用）；PWA 条目的状态/终止按命令行参数匹配（WMI 过滤需包含浏览器宿主名）。
15. **对抗性测试**：`scripts/adversarial-test.js` 用断言覆盖上述欺骗场景（改名/乱名/冒名/空文件夹/占位脚本/PWA/自身排除），改动检测逻辑后必跑。
16. **防欺骗三连修（体检发现的核心损伤）**：① exe-info 的 PowerShell 脚本嵌入路径时不能用 JSON.stringify（`\` 被转义成 `\\`，`-LiteralPath` 按字面解析永远找不到文件 → 底层元数据防改名/防冒名**一直形同虚设**），必须用 PS 单引号字面量；② 公司名匹配必须由产品名佐证，否则宽厂商（Microsoft/ByteDance/Google）会把几十个非 AI 产品全部命中（如所有微软系统组件都变成 "Microsoft Copilot"）；③ 裸命令 CLI（手动添加、无路径，如 ping/aider）要在 WMI 过滤器中补 `.exe` 变体，否则状态/终止永远找不到；标题守护循环不参与 token 匹配（延迟改用保留地址 192.0.2.1 签名，防止名为 ping 的条目误杀标题守护）。
17. **环境韧性**：① 所有系统工具（tasklist/reg/where/cmd/taskkill/PowerShell）走 `%SystemRoot%\System32` 绝对路径（用户 PATH 被改坏也能工作），PowerShell 必须用 `WindowsPowerShell\v1.0\powershell.exe`（Win11 24H2 移除了 System32 副本）；② 环境变量路径一律先归一化（去引号/空白、折叠双反斜杠、正斜杠统一）；③ 全局 uncaughtException/unhandledRejection 只写 crash.log 不弹系统错误框；④ 测试套件统一走 `scripts/qa-suite.ps1`（90 秒超时护栏 + 泄漏预清理，按 bat 内容识别测试残留、绝不误伤用户实例）。
18. **claude 自更新自毁防御**：claude 自更新时下载中断会把安装搞成半残（全局 shim 删除 + `bin\claude.exe` 变成 500B 占位脚本），已两次自毁（2.1.245→246、246→247，后者正是被 AI Port 启动触发的）。① 通过 catalog `env` 给 claude-code 注入 `DISABLE_AUTOUPDATER=1`（AI Port 启动时不触发自更新，终端自行使用不受影响）；② WMI 过滤对 `.cmd/.bat` shim 补同名 `.exe`（claude.cmd → claude.exe），否则原生本体进程永远查不到、状态探测漏报「正在运行」。修复配方见决策 11。

## 5. 构建与测试

- **本机环境**：node 在 `E:\claudecode\nodejs`；git 在 `E:\claudecode\git\Git\cmd`（已加入用户 PATH）。
- 开发运行：`npm start`
- 打包：`npm run dist:win`（国内加速：先 set `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR` 为 npmmirror 地址）
- npm install 后若 Electron 二进制缺失：`node node_modules/electron/install.js`（npm 11 allow-scripts 会拦安装脚本）
- 测试脚本（`npx electron scripts/<name>.js`）：
  - `scan-test.js` 检测引擎自检（含来源统计）
  - `adversarial-test.js` 对抗性断言（防改名/乱名/冒名/空文件夹/占位脚本/PWA/自身排除）——改检测逻辑必跑
  - `ui-smoke.js` UI 全链路冒烟（渲染/IPC/扫描）
  - `inst-test.js` 多开 + 按实例终止
  - `icon-flow-test.js` 图标渲染
  - `status-test.js` 状态探测；`launch-test.js` CLI 启停；`gui-test.js` GUI 启停
- **自测清单**：核心（扫描/图标/启动/终止/多开/窗口自动关闭/窗口标题时间）；细节（备注/重命名/置顶/撤销/深色/语言/关于/退出无残留/窗口位置记忆）；边界（改名后仍识别/断网正常）。

## 6. 本机开发环境常见坑

- **DSH 沙箱**：pwsh 命令需要 full-access 权限（工作区有 ACL grantWrite 问题）；沙箱网络连不上 GitHub（推送需用户在自己终端执行）；`System.Drawing` 在沙箱内不可用（图标用纯 Node 生成）。
- 用户 PowerShell 执行策略拦截 .ps1（命令行内联 `-Command` 可用，脚本文件需 Bypass）。

## 7. 发布相关

- `package.json` → `build.publish` = zikong0528/AI-Port（自动更新配置，改仓库需同步改这里）
- 便携版不支持自动更新（`PORTABLE_EXECUTABLE_DIR` 检测跳过）
- GitHub Actions：`release.yml`，tag `v*` 触发，产物挂 Releases
- 未签名：SmartScreen 会提示，点「仍要运行」；签名/上架 Store 是发布前最后一步

## 8. 待办（Roadmap）

- 发布：自测 → 推送 → tag → 签名/Store
- v2.0：Tauri 迁移（内存 30-50MB）；列表/网格视图切换；崩溃上报后端；ARM64；更多 i18n
