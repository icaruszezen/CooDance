import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AudioTimeline, EditPlan, OverlayItem, SfxEvent } from './types.js';
import { ProjectPaths, ensureProjectDirs } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEMO_DEFAULT_VOICE = 'zh_male_m191_uranus_bigtts';
export const DEMO_DEFAULT_SPEED = 1.08;

export const PROMO_DEMO_SCRIPT = `# 镜头 01 · 开场亮相：纯代码化 16 比 9 视频工作台
还在为一条产品演示视频反复拖轨道、对字幕、改文案吗？
欢迎了解 CooDance，一套用纯代码驱动的 16 比 9 自动化视频生产工作台。

# 镜头 02 · 阶段一 口播与配音：豆包 2.0 与 10ms RMS 气口裁切
第一阶段口播配音，直连火山豆包 2.0 或免费语音引擎逐句合成，按内容哈希增量缓存。
配合 10 毫秒 RMS 气口裁切，自动消除死静音，一键输出毫秒级时间轴与标准字幕。

# 镜头 03 · 阶段二 素材与场记：FFprobe 自动抽帧与扩展工坊
第二阶段素材场记，拖入录屏即可由 FFprobe 自动探测并均匀抽帧，点选关键帧直设裁剪起点。
右侧工坊支持一键拉取品牌 Logo、Lottie 矢量动效，并离线生成 10 款无版权交互音效。

# 镜头 04 · 阶段三 实机演示：五轨同步时间轴与框选局部推镜
进入分镜预览，16 比 9 画布支持 60 帧实时播放，五条同步轨道串联章节、分镜、标注、音效与配音波形。
直接在录屏画布拖拽框选区域，即可自动生成丝滑的局部放大推镜。

# 镜头 05 · 暗亮双色与双向热更新：6 类分镜与 7 类叠加层
工作台支持暗影工坊与极简白昼双色切换，可视化属性与分镜源码双向实时热更新。
内置标题卡、录屏、运镜图片、分屏对比、数据终端与网页还原 6 类分镜，及 7 类精准叠加标注。

# 镜头 06 · 外部 AI Agent 协同：MCP 与 Skill 一键接入
原生开放 HTTP 与离线双模式 MCP 服务，提供 11 个强校验工具、4 项工程资源与 5 阶段编导规范包。
一键接入 Cursor、Claude Code 等外部助手，并内置写前校验、自动快照与付费配音防误扣费四大护栏。

# 镜头 07 · 跨平台多端架构：Web 自托管与全平台桌面端
一套代码覆盖私有 Web、Docker 容器与 Windows、macOS、Linux 原生桌面端。
内置固定本地端口与国内多镜像加速自动更新，全程校验完整性，开箱即用。

# 镜头 08 · 范式对比：告别传统剪辑重复返工
对比传统剪辑软件，修改单句文案再也不用重拖所有轨道和字幕。
声明式分镜让每一帧画面都可审查、可复现，增量重跑数秒即可完成迭代。

# 镜头 09 · 阶段四 渲染与快照：Git 时间戳与单文件精准回退
第四阶段支持 1080p 60 帧成品与 720p 草稿双预设导出，实时推送逐帧进度。
每工程独立维护 Git 仓库与可视化 Diff，支持整库或单文件精准回退，绝不丢稿。

# 镜头 10 · 命令行与全链路交付：立即启动自动化视频管线
图形工作台、MCP 服务与 10 个命令行脚本共享同一核心引擎，磁盘双向热监听。
现在点击播放或导出，让 CooDance 接管你的下一条高质量自动化视频。[pause:450]
`;

/**
 * Resolves the bundled `packages/core/assets/demo` directory across local monorepo,
 * Docker container, and packaged Electron desktop (`process.resourcesPath/demo-assets`).
 */
export function resolveBundledDemoAssetsDir(override?: string): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '';
  const candidates = [
    override || '',
    process.env.COODANCE_DEMO_ASSETS_DIR || '',
    resourcesPath ? path.join(resourcesPath, 'demo-assets') : '',
    path.resolve(__dirname, '../assets/demo'),
    path.resolve(__dirname, '../../assets/demo'),
    path.resolve(process.cwd(), 'packages/core/assets/demo'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

/**
 * Copies the pre-rendered Doubao 2.0 (seed-tts-2.0) studio voiceover, audio_timeline.json,
 * and subtitles.srt into `paths.buildDir` so zero-config / offline users immediately get
 * real studio-grade narration instead of synthetic local speech.
 */
export function copyBundledDemoAudio(paths: ProjectPaths, overrideDir?: string): AudioTimeline | null {
  const demoDir = resolveBundledDemoAssetsDir(overrideDir);
  if (!demoDir) return null;

  const audioDir = path.join(demoDir, 'audio');
  const srcVoice = path.join(audioDir, 'voiceover.mp3');
  const srcTimeline = path.join(audioDir, 'audio_timeline.json');
  const srcSrt = path.join(audioDir, 'subtitles.srt');

  if (!fs.existsSync(srcVoice) || !fs.existsSync(srcTimeline) || !fs.existsSync(srcSrt)) {
    return null;
  }

  ensureProjectDirs(paths);
  fs.copyFileSync(srcVoice, paths.voiceoverFile);
  fs.copyFileSync(srcTimeline, paths.audioTimelineFile);
  fs.copyFileSync(srcSrt, paths.subtitlesFile);

  try {
    const timeline = JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8')) as AudioTimeline;
    if (timeline && Array.isArray(timeline.sentences) && timeline.sentences.length > 0) {
      return timeline;
    }
  } catch {
    return null;
  }
  return null;
}

export interface CopiedDemoMedia {
  brandLogo?: string;
  studioVideo?: string;
  bgmAsset?: string;
  storyboardDarkImg?: string;
  scriptTtsImg?: string;
  assetsInspectorImg?: string;
  agentHubImg?: string;
  lightThemeJsonImg?: string;
  renderSnapshotsImg?: string;
}

/**
 * Copies real v1.3.0 CooDance Studio screenshots, smooth UI walkthrough video,
 * Aurora Prism brand icon, and procedural ambient BGM into the demo project's `assets/`.
 */
export function copyBundledDemoMedia(paths: ProjectPaths, overrideDir?: string): CopiedDemoMedia {
  const demoDir = resolveBundledDemoAssetsDir(overrideDir);
  if (!demoDir) return {};

  ensureProjectDirs(paths);
  const mediaDir = path.join(demoDir, 'media');
  const copyIfExists = (srcName: string, destFull: string, relPath: string): string | undefined => {
    const src = path.join(mediaDir, srcName);
    if (!fs.existsSync(src)) return undefined;
    fs.mkdirSync(path.dirname(destFull), { recursive: true });
    fs.copyFileSync(src, destFull);
    return relPath;
  };

  return {
    brandLogo: copyIfExists(
      'coodance-logo.png',
      path.join(paths.logosDir, 'coodance.png'),
      'assets/logos/coodance.png',
    ),
    studioVideo: copyIfExists(
      'studio_demo_clip.mp4',
      path.join(paths.assetsDir, 'studio_demo_clip.mp4'),
      'assets/studio_demo_clip.mp4',
    ),
    bgmAsset: copyIfExists(
      'demo_ambient_bgm.mp3',
      path.join(paths.assetsDir, 'demo_ambient_bgm.mp3'),
      'assets/demo_ambient_bgm.mp3',
    ),
    storyboardDarkImg: copyIfExists(
      'demo_storyboard_dark.png',
      path.join(paths.assetsDir, 'demo_storyboard_dark.png'),
      'assets/demo_storyboard_dark.png',
    ),
    scriptTtsImg: copyIfExists(
      'demo_script_tts.png',
      path.join(paths.assetsDir, 'demo_script_tts.png'),
      'assets/demo_script_tts.png',
    ),
    assetsInspectorImg: copyIfExists(
      'demo_assets_inspector.png',
      path.join(paths.assetsDir, 'demo_assets_inspector.png'),
      'assets/demo_assets_inspector.png',
    ),
    agentHubImg: copyIfExists(
      'demo_agent_hub.png',
      path.join(paths.assetsDir, 'demo_agent_hub.png'),
      'assets/demo_agent_hub.png',
    ),
    lightThemeJsonImg: copyIfExists(
      'demo_light_theme_json.png',
      path.join(paths.assetsDir, 'demo_light_theme_json.png'),
      'assets/demo_light_theme_json.png',
    ),
    renderSnapshotsImg: copyIfExists(
      'demo_render_snapshots.png',
      path.join(paths.assetsDir, 'demo_render_snapshots.png'),
      'assets/demo_render_snapshots.png',
    ),
  };
}

export interface DemoPlanAssetRefs extends CopiedDemoMedia {
  logoReact?: string;
  logoNode?: string;
  lottiePulse?: string;
  lottieCheck?: string;
  lottieAudioBars?: string;
}

/**
 * Builds the flagship 10-scene CooDance v1.3.0 product promo EditPlan dynamically aligned
 * to exact sentence boundaries in `timeline`.
 */
export function buildPromoDemoEditPlan(
  timeline: AudioTimeline,
  assets: DemoPlanAssetRefs,
): EditPlan {
  const s = timeline.sentences;
  const totalDur = Number(Math.max(30, timeline.totalDurationSec).toFixed(3));

  // Each of the 10 scenes spans a 2-sentence narrative beat (indices [0,1], [2,3], ..., [18,19]).
  const beatStart = (sceneIdx: number): number => {
    if (sceneIdx === 0) return 0;
    const sentIdx = sceneIdx * 2;
    if (s[sentIdx]) return Number(s[sentIdx].startSec.toFixed(3));
    return Number(((sceneIdx / 10) * totalDur).toFixed(3));
  };
  const beatEnd = (sceneIdx: number): number => {
    if (sceneIdx >= 9) return totalDur;
    return beatStart(sceneIdx + 1);
  };
  const beatSentenceIds = (sceneIdx: number): number[] => {
    const a = s[sceneIdx * 2];
    const b = s[sceneIdx * 2 + 1];
    return [a?.id, b?.id].filter((v): v is number => typeof v === 'number');
  };

  const t0 = beatStart(0);
  const t1 = beatStart(1);
  const t2 = beatStart(2);
  const t3 = beatStart(3);
  const t4 = beatStart(4);
  const t5 = beatStart(5);
  const t6 = beatStart(6);
  const t7 = beatStart(7);
  const t8 = beatStart(8);
  const t9 = beatStart(9);

  const primaryLogo = assets.brandLogo || assets.logoReact;

  const overlays: OverlayItem[] = [
    // Scene 2: Badge + Audio Bars Lottie (TTS & 10ms RMS)
    {
      id: 'ov-s2-badge',
      type: 'badge',
      label: '豆包 2.0 增量缓存徽标',
      startSec: Number((t1 + 0.6).toFixed(3)),
      endSec: Number((t2 - 0.35).toFixed(3)),
      x: 0.76,
      y: 0.11,
      text: 'seed-tts-2.0 · SHA-256 增量缓存',
      color: '#4cb487',
      animation: 'pop',
    },
    ...(assets.lottieAudioBars
      ? [
          {
            id: 'ov-s2-audio-bars',
            type: 'lottie' as const,
            label: '声波律动动效',
            startSec: Number((t1 + 0.8).toFixed(3)),
            endSec: Number((t2 - 0.4).toFixed(3)),
            x: 0.91,
            y: 0.11,
            width: 0.06,
            height: 0.1,
            assetPath: assets.lottieAudioBars,
            animation: 'fade' as const,
          },
        ]
      : []),

    // Scene 3: Highlight Box + Callout (Assets & Workshop)
    {
      id: 'ov-s3-highlight',
      type: 'highlight-box',
      label: '右侧素材工坊聚焦框',
      startSec: Number((t2 + 5.2).toFixed(3)),
      endSec: Number((t3 - 0.4).toFixed(3)),
      x: 0.72,
      y: 0.14,
      width: 0.21,
      height: 0.56,
      text: 'Logo · Lottie · 10 款 DSP 音效',
      color: '#d99b26',
      animation: 'pop',
    },
    {
      id: 'ov-s3-callout',
      type: 'callout',
      label: 'FFprobe 场记抽帧说明',
      startSec: Number((t2 + 0.8).toFixed(3)),
      endSec: Number((t2 + 6.4).toFixed(3)),
      x: 0.29,
      y: 0.24,
      text: 'FFprobe 场记自动抽帧',
      subtext: '点击关键帧缩略图直设 trimStartSec',
      color: '#65a8d4',
      animation: 'slide-up',
    },

    // Scene 4: Pulse Ring Lottie + Arrow + Callout (Storyboard & ZoomRegion)
    {
      id: 'ov-s4-callout',
      type: 'callout',
      label: '框选局部推镜说明',
      startSec: Number((t3 + 4.8).toFixed(3)),
      endSec: Number((t4 - 0.35).toFixed(3)),
      x: 0.75,
      y: 0.22,
      text: '画布拖拽框选局部推镜',
      subtext: '自动写入 zoomRegion · 60fps 丝滑放大',
      color: '#d99b26',
      animation: 'slide-up',
    },
    {
      id: 'ov-s4-arrow',
      type: 'arrow',
      label: '指向五轨时间轴箭头',
      startSec: Number((t3 + 1.2).toFixed(3)),
      endSec: Number((t3 + 5.8).toFixed(3)),
      x: 0.26,
      y: 0.62,
      arrowDirection: 'bottom-right',
      color: '#d99b26',
      animation: 'pop',
    },
    ...(assets.lottiePulse
      ? [
          {
            id: 'ov-s4-pulse',
            type: 'lottie' as const,
            label: '局部推镜雷达焦点',
            startSec: Number((t3 + 5.0).toFixed(3)),
            endSec: Number((t4 - 0.4).toFixed(3)),
            x: 0.46,
            y: 0.43,
            width: 0.085,
            height: 0.145,
            assetPath: assets.lottiePulse,
          },
        ]
      : []),

    // Scene 5: Text Card (6 Scene Types + 7 Overlay Types)
    {
      id: 'ov-s5-textcard',
      type: 'text-card',
      label: '6 类分镜与 7 类叠加层要点卡',
      startSec: Number((t4 + 5.8).toFixed(3)),
      endSec: Number((t5 - 0.35).toFixed(3)),
      x: 0.5,
      y: 0.69,
      text: '6 类声明式分镜 × 7 类叠加标注层',
      subtext: '标题卡 · 录屏 · 运镜图 · 分屏 · 数据终端 · 网页 DOM',
      color: '#d99b26',
      animation: 'slide-up',
    },

    // Scene 6: Agent Hub MCP Badge + Guardrails Callout
    {
      id: 'ov-s6-badge',
      type: 'badge',
      label: 'MCP 工具与资源规模徽标',
      startSec: Number((t5 + 0.6).toFixed(3)),
      endSec: Number((t6 - 0.35).toFixed(3)),
      x: 0.78,
      y: 0.11,
      text: '11 MCP Tools · 4 Resources · 5 阶段 Skill',
      color: '#65a8d4',
      animation: 'pop',
    },
    {
      id: 'ov-s6-callout',
      type: 'callout',
      label: '四大安全与成本护栏',
      startSec: Number((t5 + 7.2).toFixed(3)),
      endSec: Number((t6 - 0.4).toFixed(3)),
      x: 0.75,
      y: 0.64,
      text: '四大内置安全与成本护栏',
      subtext: '强校验门禁 · 统一入库 · 写前快照 · 付费防误扣',
      color: '#4cb487',
      animation: 'slide-up',
    },

    // Scene 8: Paradigm Badge (cleanly positioned below comparison rows with zero header overlap)
    {
      id: 'ov-s8-badge',
      type: 'badge',
      label: '增量秒级迭代徽标',
      startSec: Number((t7 + 0.7).toFixed(3)),
      endSec: Number((t8 - 0.35).toFixed(3)),
      x: 0.73,
      y: 0.74,
      text: '改一句文案 · 秒级增量重跑',
      color: '#d99b26',
      animation: 'pop',
    },

    // Scene 9: Git Snapshot Callout + Arrow (positioned in open left-middle area pointing right to diff)
    {
      id: 'ov-s9-callout',
      type: 'callout',
      label: '单文件精准回退提示',
      startSec: Number((t8 + 4.8).toFixed(3)),
      endSec: Number((t9 - 0.35).toFixed(3)),
      x: 0.36,
      y: 0.54,
      text: '独立 Git 仓库 · 单文件精准恢复',
      subtext: '支持可视化 Diff 审查与回退前自动安全备份',
      color: '#4cb487',
      animation: 'slide-up',
    },
    {
      id: 'ov-s9-arrow',
      type: 'arrow',
      label: '指向 Diff 视图箭头',
      startSec: Number((t8 + 5.2).toFixed(3)),
      endSec: Number((t9 - 0.4).toFixed(3)),
      x: 0.54,
      y: 0.54,
      arrowDirection: 'right',
      color: '#4cb487',
      animation: 'pop',
    },

    // Scene 10: Brand Logo + Completion Check Lottie
    ...(primaryLogo
      ? [
          {
            id: 'ov-s10-logo',
            type: 'logo' as const,
            label: 'CooDance 极光棱镜品牌标识',
            startSec: Number((t9 + 0.5).toFixed(3)),
            endSec: totalDur,
            x: 0.89,
            y: 0.145,
            width: 0.062,
            height: 0.11,
            assetPath: primaryLogo,
            animation: 'pop' as const,
          },
        ]
      : []),
    ...(assets.lottieCheck
      ? [
          {
            id: 'ov-s10-check',
            type: 'lottie' as const,
            label: '全链路交付完成动效',
            startSec: Number((t9 + 5.8).toFixed(3)),
            endSec: totalDur,
            x: 0.87,
            y: 0.67,
            width: 0.075,
            height: 0.133,
            assetPath: assets.lottieCheck,
          },
        ]
      : []),
  ];

  const sfxEvents: SfxEvent[] = [
    { id: 'sfx-01-impact', name: '开场低频重击', assetPath: 'assets/sfx/impact.wav', timeSec: 0.06, volume: 0.36 },
    { id: 'sfx-02-whoosh', name: '切入配音指标', assetPath: 'assets/sfx/whoosh.wav', timeSec: t1, volume: 0.26 },
    { id: 'sfx-03-swoosh', name: '切入素材场记', assetPath: 'assets/sfx/swoosh.wav', timeSec: t2, volume: 0.24 },
    { id: 'sfx-04-whoosh', name: '切入实机录屏', assetPath: 'assets/sfx/whoosh.wav', timeSec: t3, volume: 0.26 },
    { id: 'sfx-05-pop', name: '推镜焦点弹出', assetPath: 'assets/sfx/pop.wav', timeSec: Number((t3 + 4.8).toFixed(3)), volume: 0.28 },
    { id: 'sfx-06-swoosh', name: '双色主题分屏', assetPath: 'assets/sfx/swoosh.wav', timeSec: t4, volume: 0.25 },
    { id: 'sfx-07-chime', name: 'MCP 接入亮点', assetPath: 'assets/sfx/chime.wav', timeSec: t5, volume: 0.25 },
    { id: 'sfx-08-notify', name: '多端架构展示', assetPath: 'assets/sfx/notification.wav', timeSec: t6, volume: 0.24 },
    { id: 'sfx-09-swoosh', name: '剪辑范式对比', assetPath: 'assets/sfx/swoosh.wav', timeSec: t7, volume: 0.25 },
    { id: 'sfx-10-chime', name: '渲染与快照', assetPath: 'assets/sfx/chime.wav', timeSec: t8, volume: 0.25 },
    { id: 'sfx-11-typing', name: '终端命令输入', assetPath: 'assets/sfx/typing.wav', timeSec: Number((t9 + 0.4).toFixed(3)), volume: 0.26 },
    { id: 'sfx-12-success', name: '交付完成和弦', assetPath: 'assets/sfx/success.wav', timeSec: Number((t9 + 6.0).toFixed(3)), volume: 0.34 },
  ];

  return {
    version: '1.0.0',
    theme: 'obsidian-studio',
    videoMeta: {
      title: 'CooDance v1.3.0 · 官方深度功能导览宣传片',
      subtitle: 'Code-as-Video 16:9 Automated Video Studio & AI Agent Pipeline',
      width: 1920,
      height: 1080,
      fps: 60,
      ...(assets.bgmAsset ? { bgMusicAsset: assets.bgmAsset, bgMusicVolume: 0.08 } : {}),
    },
    subtitleStyle: {
      enabled: true,
      position: 'bottom',
      fontSize: 42,
      maxCharsPerLine: 24,
      highlightActive: true,
    },
    chapters: [
      { id: 'ch-1', title: '品牌与配音引擎', startSec: t0, endSec: t2 },
      { id: 'ch-2', title: '素材与场记工坊', startSec: t2, endSec: t3 },
      { id: 'ch-3', title: '五轨编排与双色主题', startSec: t3, endSec: t5 },
      { id: 'ch-4', title: 'MCP + Skill 协同', startSec: t5, endSec: t6 },
      { id: 'ch-5', title: '全平台与范式对比', startSec: t6, endSec: t8 },
      { id: 'ch-6', title: '渲染快照与交付', startSec: t8, endSec: totalDur },
    ],
    scenes: [
      // 1. Title Card
      {
        id: 'scene-01-hero',
        type: 'title-card',
        label: '开场主标题 · CooDance v1.3.0',
        startSec: t0,
        endSec: beatEnd(0),
        sentenceIds: beatSentenceIds(0),
        transition: 'fade',
        props: {
          eyebrow: 'COODANCE STUDIO · V1.3.0',
          heading: '纯代码驱动的 16:9 自动化视频工作台',
          subheading: '豆包 2.0 配音 · 10ms RMS 气口裁切 · Remotion 60fps 实时预览 · MCP + Skill AI 协同',
          badge: '1920×1080 · 60fps',
          ...(primaryLogo ? { logoAsset: primaryLogo } : {}),
        },
      },
      // 2. Data UI (Metrics) — Stage 1 Script & TTS
      {
        id: 'scene-02-tts-metrics',
        type: 'data-ui',
        label: '阶段一 · 豆包 2.0 与 10ms RMS 指标',
        startSec: t1,
        endSec: beatEnd(1),
        sentenceIds: beatSentenceIds(1),
        transition: 'slide-left',
        props: {
          variant: 'metrics',
          heading: '阶段一：豆包 2.0 配音 & 10ms RMS 气口裁切',
          subheading: '支持火山豆包 2.0 / 免费 Edge-TTS，按内容哈希增量缓存并输出毫秒级字幕',
          metrics: [
            { label: 'RMS 能量检测窗口', value: '10 ms', delta: '自动切除死静音与过长气口', accent: 'primary' },
            { label: 'SHA-256 缓存复用', value: '94.6%', delta: '改单句秒级增量重跑', accent: 'success' },
            { label: '成片导出规格', value: '1080p60', delta: 'H.264 yuv420p 高清交付', accent: 'primary' },
            { label: '字幕时间轴精度', value: '< 16 ms', delta: '同步输出标准 SRT 字幕', accent: 'warning' },
          ],
        },
      },
      // 3. Image Showcase — Stage 2 Assets & Workshop
      {
        id: 'scene-03-assets-inspector',
        type: 'image',
        label: '阶段二 · 素材探测抽帧与扩展工坊',
        startSec: t2,
        endSec: beatEnd(2),
        sentenceIds: beatSentenceIds(2),
        transition: 'zoom-in',
        props: {
          assetPath: assets.assetsInspectorImg || assets.storyboardDarkImg || 'assets/demo_assets_inspector.png',
          fit: 'contain',
          kenBurns: 'zoom-in',
          caption: '阶段二 · FFprobe 自动抽帧场记 + Logo / Lottie / 10 款无版权 DSP 音效工坊',
          showFrame: true,
        },
      },
      // 4. Video Clip — Stage 3 Real Studio Walkthrough + ZoomRegion
      {
        id: 'scene-04-studio-walkthrough',
        type: 'video',
        label: '阶段三 · 五轨时间轴与框选局部推镜',
        startSec: t3,
        endSec: beatEnd(3),
        sentenceIds: beatSentenceIds(3),
        transition: 'slide-left',
        props: {
          assetPath: assets.studioVideo || 'assets/studio_demo_clip.mp4',
          trimStartSec: 0.4,
          playbackRate: 1.0,
          muted: true,
          fit: 'contain',
          showDeviceFrame: true,
          caption: '阶段三 · CooDance v1.3.0 实机工作台与归一化 zoomRegion 局部放大推镜',
          zoomRegion: {
            enabled: true,
            x: 0.16,
            y: 0.14,
            width: 0.56,
            height: 0.56,
            startProgress: 0.34,
            endProgress: 0.84,
          },
        },
      },
      // 5. Split Compare (Visuals) — Dark Theme vs Light Theme + JSON Source
      {
        id: 'scene-05-dual-theme-json',
        type: 'split-compare',
        label: '暗亮双色工作台与 edit_plan.json 双向热更新',
        startSec: t4,
        endSec: beatEnd(4),
        sentenceIds: beatSentenceIds(4),
        transition: 'wipe',
        props: {
          leftTitle: '暗影工坊 · 视觉多轨编排',
          rightTitle: '极简白昼 · edit_plan.json 源码',
          badgeLeft: 'DARK STUDIO',
          badgeRight: 'LIVE JSON',
          ...(assets.storyboardDarkImg ? { leftAsset: assets.storyboardDarkImg } : {}),
          ...(assets.lightThemeJsonImg ? { rightAsset: assets.lightThemeJsonImg } : {}),
          leftPoints: [
            '6 类声明式分镜实时 60fps 渲染预览',
            '五轨同步时间轴与可视化属性表单',
          ],
          rightPoints: [
            '暗/亮双色主题与中英双语即时切换',
            '磁盘 edit_plan.json 双向 Chokidar 热重载',
          ],
        },
      },
      // 6. Image Showcase — Agent Hub MCP + Skill
      {
        id: 'scene-06-agent-mcp',
        type: 'image',
        label: '外部 AI Agent 协同 · MCP + Skill 接入中心',
        startSec: t5,
        endSec: beatEnd(5),
        sentenceIds: beatSentenceIds(5),
        transition: 'zoom-in',
        props: {
          assetPath: assets.agentHubImg || assets.storyboardDarkImg || 'assets/demo_agent_hub.png',
          fit: 'contain',
          kenBurns: 'zoom-out',
          caption: 'MCP + Skill 协同架构 · 一键安全接入 Cursor / Claude Code / Antigravity',
          showFrame: true,
        },
      },
      // 7. Web DOM — Multi-Platform Architecture & CN Mirror Auto-Update
      {
        id: 'scene-07-multi-platform',
        type: 'web-dom',
        label: '全平台多端架构与国内多镜像自动更新',
        startSec: t6,
        endSec: beatEnd(6),
        sentenceIds: beatSentenceIds(6),
        transition: 'slide-left',
        props: {
          url: 'https://github.com/icaruszezen/CooDance/releases/v1.3.0',
          pageTitle: 'CooDance v1.3.0 — Web · Docker · Desktop',
          heading: '一套代码，全面覆盖 Web 自托管与全平台桌面端',
          description: '支持固定本地 4170 端口、可选访问口令保护与国内多镜像加速自动更新',
          highlights: [
            {
              title: 'Web 自托管 / Docker',
              badge: 'HTTP + MCP',
              description: '一行 docker compose up 私有化部署，Bearer 口令同步保护工作台与 /mcp',
              active: true,
            },
            {
              title: 'Win / macOS / Linux 桌面端',
              badge: 'Electron',
              description: '内置 FFmpeg 与零依赖离线 stdio MCP，开机即用无需额外环境配置',
            },
            {
              title: '国内多镜像加速更新',
              badge: 'SHA256',
              description: '自动测速优选加速节点与断点续传，所有安装包强制校验完整性',
            },
          ],
          ctaLabel: '立即下载 v1.3.0',
          cursorTargetIndex: 2,
        },
      },
      // 8. Split Compare (Points) — Traditional NLE vs Code-as-Video
      {
        id: 'scene-08-paradigm-compare',
        type: 'split-compare',
        label: '传统非线性剪辑 vs CooDance 代码化管线',
        startSec: t7,
        endSec: beatEnd(7),
        sentenceIds: beatSentenceIds(7),
        transition: 'wipe',
        props: {
          leftTitle: '传统非线性剪辑软件',
          rightTitle: 'CooDance 代码化管线',
          badgeLeft: '手工重复',
          badgeRight: '声明式可复现',
          leftPoints: [
            '逐段手剪气口、反复对齐字幕耗时费力',
            '改一句口播文案就需要重拖整条多轨工程',
            '二进制工程难以做代码审查、版本 Diff 与协作',
          ],
          rightPoints: [
            '豆包 2.0 + 10ms RMS 气口裁切，哈希缓存秒级重跑',
            '声明式 edit_plan.json 精确定义推镜、标注与转场',
            '每工程独立 Git 仓库，支持单文件 Diff 与瞬间回退',
          ],
        },
      },
      // 9. Image Showcase — Stage 4 Render & Git Snapshots
      {
        id: 'scene-09-render-snapshots',
        type: 'image',
        label: '阶段四 · H.264 渲染导出与 Git 单文件 Diff 回退',
        startSec: t8,
        endSec: beatEnd(8),
        sentenceIds: beatSentenceIds(8),
        transition: 'slide-left',
        props: {
          assetPath: assets.renderSnapshotsImg || assets.storyboardDarkImg || 'assets/demo_render_snapshots.png',
          fit: 'contain',
          kenBurns: 'pan-left',
          caption: '阶段四 · 1080p60 / 720p30 双预设渲染 + Git 时间戳快照与单文件精准回退',
          showFrame: true,
        },
      },
      // 10. Data UI (Terminal) — CLI & Full-Chain Delivery Outro
      {
        id: 'scene-10-cli-outro',
        type: 'data-ui',
        label: '命令行管线与全链路交付终幕',
        startSec: t9,
        endSec: beatEnd(9),
        sentenceIds: beatSentenceIds(9),
        transition: 'fade',
        props: {
          variant: 'terminal',
          heading: '一条命令或一次点击，交付你的下一条成片',
          subheading: '工作台、Streamable HTTP MCP 与 10 个 CLI 脚本共享同一 @coodance/core 引擎',
          terminalLines: [
            '$ npm run init-project -- demo-coodance-launch --demo',
            '✔ Seeded 10-scene v1.3.0 promo project (Doubao 2.0 voiceover ready)',
            '$ npm run tts -- demo-coodance-launch --provider doubao --speed 1.08',
            '✔ 20 sentences synced (10ms RMS trimmed, SHA-256 incremental cache)',
            '$ npm run validate-plan -- demo-coodance-launch',
            '✔ Schema + gapless timeline + assets verified (0 errors)',
            '$ npm run render-project -- demo-coodance-launch --preset production',
            '✔ Exported 1920×1080 @ 60fps H.264 -> out/coodance-promo-1080p60.mp4',
          ],
        },
      },
    ],
    overlays,
    sfxEvents,
  };
}
