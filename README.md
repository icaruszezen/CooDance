# CooDance Studio — Code-as-Video 16:9 自动化视频工作台

**CooDance** 是一套面向 **Web 自托管、Windows 桌面、macOS 桌面** 的纯代码化（Code-as-Video）16:9 自动化视频生产工作台。它在提供现代化多轨可视化编排与 `@remotion/player` 实时预览的同时，磁盘严格保持标准 `script.txt` / `assets/` / `edit_plan.json` / `build/` / `out/` 文件结构，实现与 CLI 脚本和外部 AI 编程助手的 100% 双向热更新兼容。

## 核心架构（Monorepo）

| 包 / 目录 | 说明 |
| :--- | :--- |
| `packages/core` | 纯 Node.js + TypeScript 5.8 核心管线引擎（火山豆包 2.0 TTS + 哈希缓存 + 10ms RMS 气口裁切、FFprobe 扫描与抽帧、Logo/Lottie/SFX 素材工坊、Git 快照与单文件回退、AI 分镜助手、Remotion 60fps 渲染引擎） |
| `packages/remotion` | React 19 + Remotion `4.0.414` 16:9 视频合成组件库（标题卡、录屏裁剪与局部推镜、图片运镜、分屏对比、数据/终端/管线 UI、网页 DOM 还原演示、Lottie/Logo/Callout 标注层、章节进度条、动态字幕层，内置 3 套视觉主题） |
| `apps/server` | Express 5 + WebSocket 引擎（Range 媒体流、多文件上传、Chokidar 磁盘双向热监听、可选 Web 访问口令） |
| `apps/web` | 统一 React 19 + Vite 暗/亮双色创作工作台（同时服务 Web 端与 Electron 桌面端） |
| `apps/desktop` | Electron 桌面外壳 + `electron-builder` 打包配置（Windows `.exe` NSIS/Portable、macOS arm64+x64 `.dmg`，内置 FFmpeg/FFprobe） |
| `scripts/*.mjs` | 完整保留 9 个命令行脚本入口，与工作台共享 `@coodance/core` |

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
# 访问 http://127.0.0.1:4170
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

## 命令行（CLI）管线命令清单

所有命令均可与图形工作台混用，磁盘改动会实时热重载到界面中：

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

# 5. 同步工程到 Remotion Studio 实时逐帧调试
npm run sync -- my-video
npm run studio

# 6. 渲染导出 H.264 MP4（production: 1920x1080@60fps / draft: 1280x720@30fps）
npm run render-project -- my-video --preset production
npm run render-project -- my-video --preset draft

# 7. Git 时间戳快照与整工程 / 单文件精准回退
npm run snapshot -- my-video "完成第3镜缩放调整"
npm run snapshot -- my-video --list
npm run snapshot -- my-video --restore snap-20261118-183000 --file edit_plan.json
```
