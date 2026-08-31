# Microsoft Store 上架完整教程（AI Port）

> 配套文件：应用包 `release\AI Port 0.1.2.appx`、商店文案 `docs/STORE_LISTING.md`、隐私政策 `PRIVACY.md`。

## 0. 准备清单

- [x] 微软开发者账号（已注册）
- [x] 应用名「AI Port」已保留（Store ID `9NCOBX7QXTJG`，包标识名 `zikong.AIPort`）
- [x] 未签名的 .appx 包（商店专用构建，微软会在发布时签名）
- [ ] 4 张截图（≥1366×768，PNG/JPG）

## 1. 登录并打开应用管理

1. 浏览器打开：https://partner.microsoft.com/dashboard
2. 登录你的开发者账号
3. 左侧选「**Windows → 概览**」（或直接打开 https://partner.microsoft.com/dashboard/windows/overview）
4. 在应用列表里找到 **AI Port**，点进去（如果列表里没有，说明名字保留在别的账号下，先确认登录账号正确）

## 2. 确认应用标识（重要，先看这页）

在 AI Port 应用页左侧菜单点「**产品标识**」，记下：

- **包标识名（Package identity name）**：应为 `zikong.AIPort`
- 发布者 ID、Store ID 等

> 若包标识名**不是** `zikong.AIPort`：先别上传，把该值发给开发者改 `package.json` 的 `appx.identityName` 后重新打包，否则上传必然报「包标识不匹配」。

## 3. 开始提交

1. 在 AI Port 应用页点「**开始提交**」（Start submission）按钮
2. 提交页从上到下依次填写以下各节（每一节填完点「保存」）

### 3.1 程序包（Packages）

1. 点「程序包」进入
2. 把 `release\AI Port 0.1.2.appx` 直接**拖进上传区**（或点「浏览文件」选择）
3. 上传后系统会自动校验，出现绿色的包信息 = 成功
4. 包信息核对：版本 `0.1.2.0`、体系结构 `x64`、支持的操作系统 Windows 10 1809+
5. 点「保存」

> 常见报错：
> - 「包标识与保留名称不匹配」→ 见第 2 步，改 identityName 重新打包
> - 「包必须签名」→ 不应出现（商店专用构建就是未签名提交的）；若出现请截图发开发者
> - 校验失败详情里会列出原因，截图发开发者即可

### 3.2 商店一览（Store listings）

语言：先做「**中文(简体)**」，英文版可选加。

1. **说明（短描述）**——详情页顶部的一句话：
   ```
   把电脑里散落各处的 AI 工具收进一个列表——一键启动，一键终止。
   ```
2. **说明（长描述）**——完整介绍，从 `docs/STORE_LISTING.md` 的「长描述」一节整段复制
3. **产品功能**——从 `docs/STORE_LISTING.md` 的「功能亮点」复制 8 条，逐条添加
4. **搜索词**——逐条添加：`AI 启动器、AI 管理、Claude Code、DeepSeek、ChatGPT、命令行 AI、AI Launcher`（最多 7 条）
5. **截图**（必填，至少 1 张）：
   - 分辨率 **≥1366×768**，PNG 或 JPG，每张 ≤50MB
   - 建议 4 张：主列表（白）、深色模式列表、运行状态（claude 正在运行 + 实例展开）、诊断面板
   - 截图方法：打开安装好的 AI Port → `Win+Shift+S` 框选窗口 → 保存
6. 若要求「**应用徽标/宣传图**」（部分账号有此必填项）：
   - 用 `resources/icon.png` 生成各尺寸即可（或找开发者生成）
7. 保存

### 3.3 属性（Properties）

- **类别 / 子类别**：实用工具 / 工具（Utilities & tools）
- **隐私策略 URL**：`https://github.com/zikong0528/ai-port/blob/main/PRIVACY.md`
- **网站 URL**：`https://github.com/zikong0528/ai-port`
- **支持联系人信息**：填你的邮箱
- 保存

### 3.4 年龄分级（Age ratings）

1. 点「年龄分级」→ 开始填写问卷
2. 该应用**不联网、不收集数据、无用户生成内容、无购物**，问卷基本全部选「否 / 不适用」
3. 完成后系统给出分级（一般「3 岁及以上」）
4. 保存

### 3.5 定价和可用性（Pricing and availability）

- 价格：**免费**
- 市场：默认全部即可
- 发布日期：**尽快发布**
- 保存

### 3.6 提交选项（Submission options）

- 发布方式：**自动发布**（认证通过即上架）或手动（认证后由你点发布）
- 建议先选**自动**，简单省事

## 4. 提交与认证

1. 页面顶部点「**提交到 Microsoft Store**」（Submit）
2. 提交后进入「认证」流程，状态在应用页可见
3. 认证时长：**1~3 个工作日**（偶有 5 天）
4. 期间可随时回来查看状态；若被驳回，认证报告会写明原因，把报告发开发者处理

## 5. 上架后

- 商店搜索「AI Port」即可下载（地址会带 Store ID `9NCOBX7QXTJG`）
- 商店版自动更新由微软商店负责（应用内自带更新在商店版自动停用）
- GitHub Releases 的安装版/便携版不受影响，两渠道并行

## 附：常见问题

| 问题 | 处理 |
|---|---|
| 包标识不匹配 | 把「产品标识」页的包标识名发给开发者，改 identityName 重新打包 |
| 要求商店徽标图片 | 找开发者用 `resources/icon.png` 生成全套尺寸 |
| 认证被驳回 | 把认证报告（邮箱或仪表盘里的说明）发给开发者 |
| 想更新商店版 | 改 `package.json` 版本号 → `npm run dist:store` → **跑 `scripts/patch-appx-tiles.ps1`（补磁贴图标，否则认证 10.1.1.11 驳回）** → 在应用页「更新 → 程序包」上传新包 |
