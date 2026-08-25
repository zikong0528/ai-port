# AI Dock ⚓

> 自动检索本机 AI 应用与 CLI agent，一键启动 / 一键终止的桌面启动器。

AI Dock 像「米哈游启动器 / WeGame」一样，把你电脑上散落各处的 AI 工具——聊天客户端、本地大模型运行时、AI 编辑器、以及 `claude` / `dsh` / `codex` 这类**命令行 agent**——自动找出来，收进一个统一的列表，一键启动、一键终止。

## ✨ 特性

- 🔍 **自动检索**：扫描 注册表 / 开始菜单 / npm 全局包 / 系统 PATH，自动识别已安装的 AI 应用与 agent，无需手动逐个添加。
- 🚀 **一键启动**：桌面应用直接拉起；命令行 agent 自动打开终端交互运行。
- ⏹ **一键终止**：按进程树精准结束，不误伤无关进程。
- 🧩 **多类型兼容**：聊天客户端、本地运行时、AI 编辑器、绘图工具、CLI agent 统一管理。
- ⚙️ **可定制**：每个条目可配置「启动参数 + 工作目录」，支持手动添加 / 编辑 / 删除。
- 🎨 **极简界面**：纯 CSS 设计令牌（design tokens），换肤只需改 `theme.css` 里的变量。
- 🪶 **轻量分发**：提供安装包（NSIS）与绿色便携版（单文件 exe）。

## 📦 工作原理

```
自动检索（四个扫描器）
  ├─ 开始菜单 .lnk       → 得到真实 exe 路径（GUI 最佳来源）
  ├─ 注册表卸载信息       → 补充无快捷方式的应用
  ├─ npm 全局包           → 识别 claude / dsh / codex 等 CLI agent
  └─ 系统 PATH 可执行文件 → 识别 aider / ollama 等非 npm 工具
         │
         ▼
内置特征库（catalog.json）匹配 → 精确识别
  未命中但疑似 AI → 标记为「候选」待用户确认
         │
         ▼
统一列表（一键启动 / 一键终止 / 运行状态）
```

- **运行状态**：通过 WMI 进程列表实时探测（GUI 按镜像名匹配，CLI 按命令行路径匹配），已运行的 agent 会显示绿色状态点。
- **终止**：`taskkill /T /F` 结束整棵进程树。

## 🖥 开发

### 环境要求

- Node.js ≥ 22（Windows）
- npm

### 快速开始

```bash
git clone https://github.com/zikong0528/ai-dock
cd ai-dock
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
  "category": "agent",           // chat / agent / runtime / image / ide
  "launchType": "cli",           // cli / gui
  "npmPackages": ["my-agent"],   // npm 全局包名
  "pathExecutables": ["myagent"],// PATH 上的命令名
  "displayNamePatterns": ["My Agent"], // GUI 显示名匹配
  "exeNames": ["MyAgent.exe"],   // GUI 可执行文件名
  "defaultCommand": "myagent",
  "defaultArgs": []
}
```

`aiKeywords` 字段用于「疑似 AI」的宽泛识别——不在特征库但名称含关键词的程序会被标记为候选。

## 🏗 技术栈

- **Electron**（主进程 Node + 渲染进程原生 Web，无前端框架）
- 检测/进程管理全部基于 Node 内置能力 + 系统命令，**零运行时第三方依赖**

## 📁 目录结构

```
src/
├── main/
│   ├── main.js               # 入口
│   ├── ipc.js                # IPC 桥接
│   ├── store/store.js        # JSON 配置持久化
│   ├── detect/               # 检测引擎（catalog + 4 个扫描器）
│   └── process/manager.js    # 启动 / 终止 / 状态
├── preload/preload.js        # contextBridge
└── renderer/                 # 界面（index.html + theme.css + app.js）
scripts/                      # 自检 / 冒烟测试 / 图标生成
```

## 📄 License

[MIT](LICENSE)
