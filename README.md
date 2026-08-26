# AI Port ⚓

> 自动检索本机 AI 应用与 CLI agent，一键启动 / 一键终止的桌面启动器。

AI Port 像「米哈游启动器 / WeGame」一样，把你电脑上散落各处的 AI 工具——聊天客户端、本地大模型运行时、AI 编辑器、以及 `claude` / `dsh` / `codex` 这类**命令行 agent**——自动找出来，收进一个统一的列表，一键启动、一键终止。

**完全本地运行，不联网、不上传任何数据。**

## ✨ 特性

- 🔍 **六路自动检索**：开始菜单 / 注册表 / Windows 商店应用 / npm 全局包 / 系统 PATH / 本地程序目录；
- 🛡️ **底层元数据防改名**：识别 exe 内嵌的公司名、产品名、原始文件名——改名/冒名顶替也能甄别（冒名者会被标记为「疑似」）；
- 🚀 **一键启动**：桌面应用直接拉起；命令行 agent 自动打开终端交互运行（窗口标题带启动时间）；
- ⏹ **一键终止**：按进程树精准结束，窗口随之关闭，不误伤无关进程与共享宿主；
- 🔁 **多开 + 按实例终止**：同一个 AI 可以开多个窗口跑不同任务，展开实例列表可只关其中一个；
- 🧩 **多类型兼容**：聊天客户端、本地运行时、AI 编辑器、绘图工具、CLI agent 统一管理；
- 🖼 **真实图标**：内置 28 个官方图标 + 从 exe 提取真实图标；
- ⚙️ **可定制**：改名、备注、置顶、启动参数、工作目录、手动添加；
- 🎨 **黑白极简**：纯 CSS 设计令牌，深色模式一键切换，中英双语；
- 📦 **分发**：安装包（NSIS，支持自动更新）+ 绿色便携版（单文件）；
- 🩺 **诊断面板**：各扫描来源结果与环境自检，方便排查；
- ☕ **为爱发电**：内置微信赞赏入口。

## 📦 下载与安装

- 到 [Releases](../../releases) 页面下载最新版：
  - `AI Port Setup x.x.x.exe` —— 安装包（推荐，支持自动更新）；
  - `AI-Port-x.x.x-portable.exe` —— 免安装便携版。
- 未签名的应用首次运行会触发 SmartScreen 提示，点「更多信息 → 仍要运行」即可。

## 📖 工作原理

```
自动检索（六个来源）
  ├─ 开始菜单 .lnk         → 真实 exe 路径（GUI 最佳来源）
  ├─ 注册表卸载信息         → 补充无快捷方式的应用
  ├─ Windows 商店应用       → ChatGPT / Copilot 等 AppX
  ├─ npm 全局包             → claude / dsh / codex 等 CLI agent
  ├─ 系统 PATH 可执行文件   → aider / ollama 等非 npm 工具
  └─ 本地程序目录           → %LOCALAPPDATA%\Programs
         │
         ▼
exe 底层元数据（公司名/产品名/原始文件名）→ 防改名、防冒名
         │
         ▼
内置特征库（catalog.json）匹配 → 精确识别
  未命中但疑似 AI → 标记为「候选」待确认；冒名顶替 → 「疑似冒名」
         │
         ▼
统一列表（一键启动 / 一键终止 / 多开管理 / 运行状态）
```

- **运行状态**：进程列表实时探测（GUI 按镜像名，CLI 按命令行/实例标记），失焦时暂停轮询、有 CLI 条目才查询命令行，尽量省资源；
- **终止**：`taskkill /T /F` 结束整棵进程树，CLI 窗口随进程关闭。

## 🖥 开发

### 环境要求

- Windows 10（1809+）/ Windows 11 x64
- Node.js ≥ 22、npm

### 快速开始

```bash
git clone https://github.com/zikong0528/ai-port
cd AI-Port
npm install
npm start          # 开发运行
```

> 若 `npm install` 后启动报「Electron failed to install correctly」，说明 Electron 二进制未下载成功（新版 npm 可能拦截安装脚本），手动执行：
> ```bash
> node node_modules/electron/install.js
> ```
> 国内网络可先设置镜像加速：
> ```bash
> set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
> node node_modules/electron/install.js
> ```

### 打包

```bash
npm run dist:win   # 生成 NSIS 安装包 + 便携版（输出到 release/）
```

国内网络加速：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
npm run dist:win
```

## 🗂 扩展特征库

内置特征库位于 [`src/main/detect/catalog.json`](src/main/detect/catalog.json)，是一个可随时扩展的 JSON：

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "category": "agent",               // chat / agent / runtime / image / ide
  "launchType": "cli",               // cli / gui
  "npmPackages": ["my-agent"],       // npm 全局包名
  "pathExecutables": ["myagent"],    // PATH 上的命令名
  "displayNamePatterns": ["My Agent"], // GUI 显示名匹配
  "exeNames": ["MyAgent.exe"],       // GUI 可执行文件名
  "companyNames": ["My Company"],    // exe 内嵌公司名（防改名/防冒名）
  "defaultCommand": "myagent",
  "defaultArgs": []
}
```

`aiKeywords` 字段用于「疑似 AI」的宽泛识别——不在特征库但名称含关键词的程序会被标记为候选。

## 🏗 技术栈

- **Electron**（主进程 Node + 渲染进程原生 Web，无前端框架）
- 检测/进程管理全部基于 Node 内置能力 + 系统命令，**零运行时第三方依赖**
- 打包：electron-builder（NSIS + portable）；自动更新：electron-updater

## 📁 目录结构

```
src/
├── main/
│   ├── main.js               # 入口（单实例/窗口/内存优化开关）
│   ├── ipc.js                # IPC 桥接
│   ├── updater.js            # 自动更新
│   ├── store/store.js        # JSON 配置持久化（含实例台账）
│   ├── detect/               # 检测引擎（catalog + 六个扫描器 + exe 元数据）
│   └── process/manager.js    # 启动 / 终止 / 按实例终止 / 状态
├── preload/preload.js        # contextBridge
└── renderer/                 # 界面（index.html + app.js + i18n.js + theme.css）
resources/agents/             # 28 个内置官方图标
scripts/                      # 自检 / 冒烟测试 / 图标工具
```

> 更完整的架构说明与关键决策记录见 [PROJECT.md](PROJECT.md)。

## 🗺 Roadmap

- [ ] **代码签名 / 上架 Microsoft Store**（消除 SmartScreen 警告）
- [ ] 2.0：迁移 Tauri（内存从 ~150MB 降至 30-50MB）
- [ ] 列表 / 网格视图切换（条目多时更紧凑）
- [ ] 崩溃上报（需后端服务）
- [ ] 更多语言

## 📄 License

**仅供个人免费使用 · 严禁商业售卖、转卖、套壳。**

详见 [LICENSE](LICENSE)。
