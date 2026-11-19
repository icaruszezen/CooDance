# CooDance Studio — Code-as-Video 16:9 自动化视频工作台

**CooDance** 是一套面向 **Web 自托管、Windows 桌面、macOS 桌面** 的纯代码化（Code-as-Video）16:9 自动化视频生产工作台。它在提供现代化多轨可视化编排与 `@remotion/player` 实时预览的同时，磁盘严格保持标准 `script.txt` / `assets/` / `edit_plan.json` / `build/` / `out/` 文件结构，实现与 CLI 脚本和外部 AI 编程助手的 100% 双向热更新兼容。

## 核心架构（Monorepo）

| 包 / 目录 | 说明 |
| :--- | :--- |
| `packages/core` | 纯 Node.js + TypeScript 5.8 核心管线引擎（火山豆包 2.0 TTS + 哈希缓存 + 10ms RMS 气口裁切、FFprobe 扫描与抽帧、Logo/Lottie/SFX 素材工坊、外部素材统一入库 `importAsset`、Zod + 时间轴/素材强校验门禁 `editPlanValidator`、异步渲染任务管理、Git 快照与回退、一键 Agent 客户端安装器） |
| `packages/mcp` | 双传输 MCP 服务端（本地零依赖 `stdio` + Express 挂载 Streamable HTTP `/mcp`），提供 11 个高内聚强校验管线工具与 4 个渐进式 MCP Resources |
| `skills/coodance-video-producer` | 面向外部 AI Agent 的 5 阶段 Code-as-Video 编导创作 Skill（`SKILL.md` + 渐进参考文档，涵盖口播写作、外部生图/录屏/SVG 生产入库、6 类分镜审美节奏与 CLI 降级方案） |
| `packages/remotion` | React 19 + Remotion `4.0.414` 16:9 视频合成组件库（标题卡、录屏裁剪与局部推镜、图片运镜、分屏对比、数据/终端/管线 UI、网页 DOM 还原演示、Lottie/Logo/Callout 标注层、章节进度条、动态字幕层，内置 3 套视觉主题） |
| `apps/server` | Express 5 + WebSocket 引擎（Range 媒体流、多文件上传、Streamable HTTP `/mcp` 端点、Chokidar 磁盘双向热监听、可选 Web 访问口令） |
| `apps/web` | 统一 React 19 + Vite 暗/亮双色创作工作台（内置「Agent 接入中心」一键安装弹窗与 Skill 压缩包导出） |
| `apps/desktop` | Electron 桌面外壳 + `electron-builder` 打包配置（Windows `.exe` NSIS/Portable、macOS arm64+x64 `.dmg`，支持可选固定本地 MCP 端口 `4170` 与 `ELECTRON_RUN_AS_NODE=1` 零依赖离线 `stdio` MCP） |
| `scripts/*.mjs` | 完整保留 10 个命令行脚本入口（含 `validate-edit-plan.mjs`），与工作台和 MCP 共享 `@coodance/core` |

---

## 快速开始

### 1. 安装与构建
```bash
npm install
npm run build
```

### 2. 启动 Web 工作台（本地或私有自托管）
```bash
npm start
# 工作台：http://127.0.0.1:4170
# Streamable HTTP MCP 端点：http://127.0.0.1:4170/mcp
```
或使用 Docker 一键部署：
```bash
docker compose up -d --build
```

### 3. 启动 / 打包 Windows 与 macOS 桌面应用
```bash
# 本地运行 Electron 桌面端
npm run desktop:dev

# 打包 Windows 安装包 (.exe NSIS + Portable)
npm run desktop:build:win

# 打包 macOS 安装包 (arm64 + x64 .dmg)
npm run desktop:build:mac
```

---

## 外部 AI Agent 接入（MCP + Skill 协同架构）

CooDance 采用 **「精简聚合 MCP（确定性执行与强校验门禁）+ 富 SOP Skill（5 阶段编导与外部素材生产）」** 协同架构：

- **一键接入（推荐）**：打开 CooDance 工作台顶部栏的 **「Agent 接入 (MCP & Skill)」** 按钮，支持自动检测本机 **Cursor / Claude Code / Claude Desktop / Antigravity / Cherry Studio**，提供：
  - **本地固定 HTTP 模式（`http://127.0.0.1:4170/mcp`）**：桌面端或 Web 服务运行时直连，Agent 每次调用工具都会实时驱动工作台进度条与画布热更新；支持通过 `COODANCE_ACCESS_TOKEN` Bearer 鉴权供远程 Docker 部署使用。
  - **离线零依赖 stdio 模式（`npm run mcp:stdio` / 桌面端内置 `ELECTRON_RUN_AS_NODE=1`）**：无需先打开 CooDance 窗口即可后台操作工作区。
  - **一键安全安装 / 预览合并 / 备份回滚**：写入外部客户端 JSON 配置前自动生成 `.coodance.bak.<timestamp>` 备份并仅合并 `mcpServers.coodance`，同时支持一键安装或下载 `coodance-video-producer-skill.zip`。
- **四大内置护栏**：
  1. `edit_plan.json` 写前强校验门禁（Zod Schema + 时间轴无断层/重叠 + 素材文件存在性 + 推镜坐标校验）
  2. `coodance_import_asset` 统一外部素材入库（支持本地路径、URL、Base64 图片、自定义 SVG/Lottie 文本，自动触发 FFprobe 探测）
  3. 写前自动 Git 快照（防止外部 Agent 覆写人工精调分镜）
  4. 异步非阻塞渲染 Job（避免 MCP 工具超时）+ TTS SHA-256 缓存复用与付费豆包调用保护开关

---

## 命令行（CLI）管线命令清单

所有命令均可与图形工作台和 MCP 混用，磁盘改动会实时热重载到界面中：

```bash
# 1. 初始化工程（支持 --demo 一键生成完整 6 镜实机示例）
npm run init-project -- my-video --title "我的自动化视频"
npm run init-project -- demo-coodance-launch --demo

# 2. 逐句 TTS 合成（火山豆包 2.0 / Edge-TTS / 本地离线）、SHA-256 缓存与 10ms RMS 气口裁切
npm run tts -- my-video --provider doubao --speed 1.05

# 3. FFprobe 素材探测与均匀抽帧场记
npm run inspect-assets -- my-video --thumbs 6

# 4. 素材扩展工具（品牌 Logo、Lottie 矢量动效、程序化 SFX 音效）
npm run fetch-logo -- my-video react
npm run fetch-tg-emoji -- my-video pulse-ring
npm run generate-sfx -- my-video whoosh,pop,chime,success

# 5. 强校验 edit_plan.json（Schema + 时间轴连续性 + 素材存在性）
npm run validate-plan -- my-video

# 6. 启动本地 stdio MCP 服务（供外部 AI 客户端接入）
npm run mcp:stdio

# 7. 同步工程到 Remotion Studio 实时逐帧调试
npm run sync -- my-video
npm run studio

# 8. 渲染导出 H.264 MP4（production: 1920x1080@60fps / draft: 1280x720@30fps）
npm run render-project -- my-video --preset production
npm run render-project -- my-video --preset draft

# 9. Git 时间戳快照与整工程 / 单文件精准回退
npm run snapshot -- my-video "完成第3镜缩放调整"
npm run snapshot -- my-video --list
npm run snapshot -- my-video --restore snap-20261118-183000 --file edit_plan.json
```
