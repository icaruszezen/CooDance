import fs from 'node:fs';
import path from 'node:path';
import {
  AssetsManifest,
  AudioTimeline,
  EditPlan,
  ProjectSummary,
  VideoThemeId,
} from './types.js';
import { ProjectPaths, ensureProjectDirs, resolveProjectPaths } from './paths.js';
import { createProjectSnapshot, ensureProjectGitRepo, listProjectSnapshots } from './snapshot.js';
import { runFfmpeg } from './ffmpeg.js';
import { runTtsPipeline } from './tts/index.js';
import { inspectProjectAssets } from './inspectAssets.js';
import { fetchAndSaveLogo } from './fetchLogo.js';
import { fetchAndSaveLottie } from './fetchLottie.js';
import { generateProjectSfx } from './generateSfx.js';

const DEFAULT_SCRIPT = `# 开场标题：引出主题
欢迎来到 CooDance 代码化视频工作台，在这里，文案、素材与分镜全部由声明式代码自动编译为 1080p 60帧成片。

# 核心演示：配音与气口自动裁切
只需写好口播脚本，系统会按句计算哈希缓存，并通过 10 毫秒 RMS 能量检测自动裁切死静音和过长气口。

# 架构亮点：声明式分镜编排
结合素材抽帧场记与实时时间轴，你可以像写代码一样精确控制视频裁剪、局部缩放、网页演示与叠加标注。

# 总结收尾：一键渲染与 Git 快照
每次修改自动生成时间戳快照，支持单文件精准回退，随时一键导出高质量 H.264 视频成片。
`;

export interface InitProjectOptions {
  title?: string;
  theme?: VideoThemeId;
  scriptContent?: string;
}

export async function initProject(
  workspaceDir: string,
  slug: string,
  options: InitProjectOptions = {},
): Promise<ProjectPaths> {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const paths = resolveProjectPaths(workspaceDir, slug);
  ensureProjectDirs(paths);

  const title = options.title?.trim() || paths.slug;
  const theme = options.theme ?? 'obsidian-studio';

  if (!fs.existsSync(paths.scriptFile)) {
    fs.writeFileSync(paths.scriptFile, options.scriptContent ?? DEFAULT_SCRIPT, 'utf8');
  }

  if (!fs.existsSync(paths.editPlanFile)) {
    const initialPlan: EditPlan = {
      version: '1.0.0',
      theme,
      videoMeta: {
        title,
        subtitle: '16:9 Code-as-Video Production',
        width: 1920,
        height: 1080,
        fps: 60,
      },
      subtitleStyle: {
        enabled: true,
        position: 'bottom',
        fontSize: 44,
        maxCharsPerLine: 22,
        highlightActive: true,
      },
      chapters: [
        { id: 'ch-1', title: '开场概览', startSec: 0, endSec: 6 },
        { id: 'ch-2', title: '核心演示', startSec: 6, endSec: 12 },
      ],
      scenes: [
        {
          id: 'scene-1',
          type: 'title-card',
          label: '开场主标题',
          startSec: 0,
          endSec: 6,
          transition: 'fade',
          props: {
            eyebrow: 'COODANCE STUDIO',
            heading: title,
            subheading: 'Node.js + TTS + FFmpeg + Remotion 声明式自动化视频管线',
            badge: '1920×1080 · 60fps',
          },
        },
        {
          id: 'scene-2',
          type: 'data-ui',
          label: '流水线步骤预览',
          startSec: 6,
          endSec: 12,
          transition: 'slide-left',
          props: {
            variant: 'pipeline',
            heading: '5 阶段自动化视频构建管线',
            subheading: '从口播文案到成片导出的全链路代码化编排',
            pipelineSteps: [
              { title: '1. 工程初始化与目录隔离', subtitle: 'script.txt / assets / edit_plan.json / out', status: 'done' },
              { title: '2. 逐句 TTS 哈希缓存与 RMS 裁切', subtitle: '自动生成 voiceover.mp3 与 audio_timeline.json', status: 'active' },
              { title: '3. Remotion 实时预览与 60fps 导出', subtitle: '1920×1080 H.264 成片 + Git 时间戳快照', status: 'queued' },
            ],
          },
        },
      ],
      overlays: [],
      sfxEvents: [],
    };
    fs.writeFileSync(paths.editPlanFile, JSON.stringify(initialPlan, null, 2), 'utf8');
  }

  await ensureProjectGitRepo(paths);
  const snaps = await listProjectSnapshots(paths);
  if (snaps.length === 0) {
    await createProjectSnapshot(paths, 'Initial project scaffold');
  }

  return paths;
}

/**
 * Generates a realistic synthetic 16:9 demo screen recording MP4 and a crisp cover image PNG
 * via FFmpeg, runs TTS + Asset Inspect + Logo/Lottie/SFX enrichment, and builds a complete
 * ready-to-play 6-scene demo episode!
 */
export async function seedDemoProject(
  workspaceDir: string,
  slug = 'demo-coodance-launch',
  ffmpegCustom?: { ffmpegPath?: string; ffprobePath?: string },
): Promise<ProjectPaths> {
  const demoScript = `# 开场标题：代码化视频制作新范式
欢迎体验 CooDance，一套纯代码化的 16 比 9 自动化视频生产工作台，直接把文案、录屏与分镜编译为 1080p 60帧成片。

# 语音与时间轴：豆包 2.0 + 10ms RMS 气口裁切
每句口播按内容哈希独立缓存，系统通过 10 毫秒 RMS 能量检测自动裁切死静音和过长气口，精准输出时间轴与 SRT 字幕。

# 录屏演示：自动抽帧场记与局部放大聚焦
导入录屏后，FFprobe 自动生成素材清单与关键帧缩略图，框选画面即可为重点操作添加丝滑的镜头推进与悬浮标注。

# 架构展示：Web 与桌面端统一渲染引擎
工作台原生支持 Web 自托管、Windows 与 macOS 桌面端，内置数据卡片、终端演示和网页 DOM 还原等 React 场景组件。

# 效率对比：告别重复拖轨道
对比传统剪辑软件，修改单句文案只需秒级增量重跑，搭配 Git 时间戳快照，随时一键回退整库或单个分镜文件。

# 结语交付：一键导出 H.264 成品
现在点击播放或导出按钮，即刻预览你的全自动视频生产管线。
`;

  const paths = await initProject(workspaceDir, slug, {
    title: 'CooDance 自动化视频工坊 · 实机演示',
    theme: 'obsidian-studio',
    scriptContent: demoScript,
  });

  // 1. Generate synthetic 16:9 demo screen-recording clip (`assets/studio_demo_clip.mp4`) using FFmpeg
  const demoVideoPath = path.join(paths.assetsDir, 'studio_demo_clip.mp4');
  if (!fs.existsSync(demoVideoPath)) {
    try {
      await runFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=1280x720:rate=30:duration=8',
          '-vf',
          'eq=brightness=-0.12:saturation=0.85,drawbox=x=40:y=40:w=1200:h=640:color=#0ea5e9@0.28:t=4,drawbox=x=120:y=130:w=560:h=340:color=#f59e0b@0.55:t=5',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          demoVideoPath,
        ],
        ffmpegCustom,
      );
    } catch {
      // If lavfi filter unavailable, skip video generation cleanly
    }
  }

  // 2. Generate a clean visual showcase PNG (`assets/pipeline_blueprint.png`)
  const demoImgPath = path.join(paths.assetsDir, 'pipeline_blueprint.png');
  if (!fs.existsSync(demoImgPath)) {
    try {
      await runFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=#11151d:s=1280x720:d=0.1',
          '-vf',
          'drawbox=x=70:y=70:w=1140:h=580:color=#1e293b@0.9:t=fill,drawbox=x=110:y=120:w=320:h=480:color=#f59e0b@0.25:t=fill,drawbox=x=470:y=120:w=320:h=480:color=#0ea5e9@0.25:t=fill,drawbox=x=830:y=120:w=320:h=480:color=#10b981@0.25:t=fill',
          '-frames:v',
          '1',
          demoImgPath,
        ],
        ffmpegCustom,
      );
    } catch {
      // ignore
    }
  }

  // 3. Populate sample logos, Lottie animations, and generated SFX
  const logoReact = await fetchAndSaveLogo(paths, 'react', 'react').catch(() => null);
  await fetchAndSaveLogo(paths, 'nodedotjs', 'nodejs').catch(() => null);
  const lottiePulse = await fetchAndSaveLottie(paths, 'pulse-ring', 'pulse-ring').catch(() => null);
  const lottieCheck = await fetchAndSaveLottie(paths, 'check-badge', 'check-badge').catch(() => null);
  generateProjectSfx(paths, ['impact', 'whoosh', 'pop', 'chime', 'success']);

  // 4. Run Stage 2 TTS (local instant zero-config cadence) & Stage 3 Asset Inspection
  const timeline = await runTtsPipeline(
    paths,
    { provider: 'local', voice: 'studio-warm-zh', speed: 1.05 },
    ffmpegCustom,
  );
  await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, ffmpegCustom);

  // 5. Build a showcase EditPlan aligned precisely to the generated sentence timestamps
  const s = timeline.sentences;
  const t = (idx: number, fallback: number) => s[idx]?.startSec ?? fallback;
  const totalDur = Math.max(12, timeline.totalDurationSec);

  const plan: EditPlan = {
    version: '1.0.0',
    theme: 'obsidian-studio',
    videoMeta: {
      title: 'CooDance 自动化视频工坊 · 实机演示',
      subtitle: 'Code-as-Video 16:9 Production Pipeline',
      width: 1920,
      height: 1080,
      fps: 60,
    },
    subtitleStyle: {
      enabled: true,
      position: 'bottom',
      fontSize: 44,
      maxCharsPerLine: 22,
      highlightActive: true,
    },
    chapters: [
      { id: 'ch-1', title: '开场引入', startSec: 0, endSec: t(1, 5) },
      { id: 'ch-2', title: '配音与气口裁切', startSec: t(1, 5), endSec: t(2, 10) },
      { id: 'ch-3', title: '录屏缩放演示', startSec: t(2, 10), endSec: t(3, 16) },
      { id: 'ch-4', title: '多端组件体系', startSec: t(3, 16), endSec: t(4, 22) },
      { id: 'ch-5', title: '对比与交付', startSec: t(4, 22), endSec: totalDur },
    ],
    scenes: [
      {
        id: 'scene-intro',
        type: 'title-card',
        label: '开场主标题',
        startSec: 0,
        endSec: t(1, 5),
        sentenceIds: s[0] ? [s[0].id] : [],
        transition: 'fade',
        props: {
          eyebrow: 'CODE-AS-VIDEO STUDIO · V1.0',
          heading: 'CooDance 自动化视频生产管线',
          subheading: 'Node.js v24 · 火山豆包 2.0 TTS · FFmpeg · Remotion 4.0',
          badge: '1920×1080 @ 60fps',
          logoAsset: logoReact?.relativePath,
        },
      },
      {
        id: 'scene-tts-metrics',
        type: 'data-ui',
        label: 'TTS 缓存与 10ms RMS 气口裁切指标',
        startSec: t(1, 5),
        endSec: t(2, 10),
        sentenceIds: s[1] ? [s[1].id] : [],
        transition: 'slide-left',
        props: {
          variant: 'metrics',
          heading: '采样级气口裁切 & 哈希增量缓存',
          subheading: '单句修改仅重跑变更部分，毫秒级精准对齐字幕轨道',
          metrics: [
            { label: 'RMS 检测窗口', value: '10 ms', delta: '精准切除死静音', accent: 'primary' },
            { label: '缓存复用率', value: '94.6%', delta: 'SHA-256 逐句哈希', accent: 'success' },
            { label: '导出帧率规格', value: '60 fps', delta: '1920×1080 H.264', accent: 'primary' },
            { label: '字幕对齐误差', value: '< 16 ms', delta: '自动导出标准 SRT', accent: 'warning' },
          ],
        },
      },
      {
        id: 'scene-video-demo',
        type: 'video',
        label: '录屏裁剪与局部放大聚焦',
        startSec: t(2, 10),
        endSec: t(3, 16),
        sentenceIds: s[2] ? [s[2].id] : [],
        transition: 'zoom-in',
        props: {
          assetPath: 'assets/studio_demo_clip.mp4',
          trimStartSec: 1.0,
          playbackRate: 1.15,
          muted: true,
          fit: 'contain',
          showDeviceFrame: true,
          caption: 'studio_demo_clip.mp4 · 局部聚焦 1.8x 推镜',
          zoomRegion: {
            enabled: true,
            x: 0.1,
            y: 0.16,
            width: 0.45,
            height: 0.5,
            startProgress: 0.2,
            endProgress: 0.8,
          },
        },
      },
      {
        id: 'scene-web-dom',
        type: 'web-dom',
        label: '网页 DOM 还原与多端架构演示',
        startSec: t(3, 16),
        endSec: t(4, 22),
        sentenceIds: s[3] ? [s[3].id] : [],
        transition: 'slide-left',
        props: {
          url: 'https://coodance.local/studio/demo-coodance-launch',
          pageTitle: 'CooDance Studio — Web / Windows / macOS',
          heading: '一套代码，同时驱动 Web、Windows 与 macOS 桌面端',
          description: '可视化多轨编排与磁盘 script.txt / edit_plan.json 实时双向热更新',
          highlights: [
            { title: 'Remotion Player 实时预览', badge: '60fps', description: '浏览器与桌面端即改即看，无需等待导出', active: true },
            { title: '内置 FFmpeg 跨平台打包', badge: 'Win / Mac', description: 'Electron 打包零依赖开箱即用' },
            { title: 'AI 分镜助手 & Agent 上下文', badge: '可选扩展', description: '一键导出上下文与外部 AI 协同编排' },
          ],
          ctaLabel: '立即渲染 1080p 成片',
          cursorTargetIndex: 0,
        },
      },
      {
        id: 'scene-split-compare',
        type: 'split-compare',
        label: '传统剪辑 vs 代码化管线对比',
        startSec: t(4, 22),
        endSec: t(5, 28),
        sentenceIds: s[4] ? [s[4].id] : [],
        transition: 'wipe',
        props: {
          leftTitle: '传统非线性剪辑',
          rightTitle: 'CooDance 代码化管线',
          badgeLeft: '手工重复',
          badgeRight: '声明式可复现',
          leftPoints: [
            '逐段手动找气口、对齐字幕耗时费力',
            '换一句文案需要重新拖动所有轨道',
            '工程文件难以做 Diff 审查与单文件回退',
          ],
          rightPoints: [
            '10ms RMS 自动裁切 + 哈希缓存秒级重跑',
            'edit_plan.json 声明分镜与镜头缩放坐标',
            'Git 时间戳快照支持一键对比与精准回退',
          ],
        },
      },
      {
        id: 'scene-outro',
        type: 'data-ui',
        label: '命令行与一键交付终幕',
        startSec: t(5, 28),
        endSec: totalDur,
        sentenceIds: s[5] ? [s[5].id] : [],
        transition: 'fade',
        props: {
          variant: 'terminal',
          heading: '一条命令或一次点击，完成全链路交付',
          subheading: 'CLI 脚本与桌面/Web 工作台共享同一套 @coodance/core 引擎',
          terminalLines: [
            '$ npm run tts -- demo-coodance-launch',
            '✔ 6 sentences synthesized (10ms RMS trimmed, 0.84s silence removed)',
            '$ npm run inspect-assets -- demo-coodance-launch',
            '✔ Manifest & 6 keyframe thumbnails written to build/',
            '$ npm run render-project -- demo-coodance-launch',
            '✔ Rendered 1920x1080 @ 60fps H.264 -> out/demo-coodance-launch.mp4',
            '$ npm run snapshot -- demo-coodance-launch "Release v1.0"',
            '✔ Tagged snap-20261118-183000 in Git & SNAPSHOTS.md',
          ],
        },
      },
    ],
    overlays: [
      {
        id: 'ov-badge-top',
        type: 'badge',
        label: '管线状态徽标',
        startSec: t(1, 5) + 0.4,
        endSec: t(2, 10) - 0.3,
        x: 0.78,
        y: 0.12,
        text: 'SHA-256 增量缓存已启用',
        color: '#10b981',
        animation: 'pop',
      },
      {
        id: 'ov-callout-zoom',
        type: 'callout',
        label: '局部缩放说明',
        startSec: t(2, 10) + 0.7,
        endSec: t(3, 16) - 0.4,
        x: 0.72,
        y: 0.25,
        text: '关键操作区域自动推镜',
        subtext: '在场记缩略图上拖拽即可更新坐标',
        color: '#f59e0b',
        animation: 'slide-up',
      },
      ...(lottiePulse
        ? [
            {
              id: 'ov-lottie-pulse',
              type: 'lottie' as const,
              label: '焦点雷达动效',
              startSec: t(2, 10) + 0.9,
              endSec: t(3, 16) - 0.5,
              x: 0.32,
              y: 0.42,
              width: 0.1,
              height: 0.16,
              assetPath: lottiePulse.relativePath,
            },
          ]
        : []),
      ...(lottieCheck
        ? [
            {
              id: 'ov-lottie-done',
              type: 'lottie' as const,
              label: '完成徽章动效',
              startSec: t(5, 28) + 0.6,
              endSec: totalDur,
              x: 0.87,
              y: 0.16,
              width: 0.1,
              height: 0.16,
              assetPath: lottieCheck.relativePath,
            },
          ]
        : []),
    ],
    sfxEvents: [
      { id: 'sfx-1', name: '开场低频重击', assetPath: 'assets/sfx/impact.wav', timeSec: 0.05, volume: 0.45 },
      { id: 'sfx-2', name: '分镜转场 Whoosh', assetPath: 'assets/sfx/whoosh.wav', timeSec: t(1, 5), volume: 0.35 },
      { id: 'sfx-3', name: '推镜提示 Pop', assetPath: 'assets/sfx/pop.wav', timeSec: t(2, 10) + 0.6, volume: 0.38 },
      { id: 'sfx-4', name: '亮点提示 Chime', assetPath: 'assets/sfx/chime.wav', timeSec: t(3, 16), volume: 0.32 },
      { id: 'sfx-5', name: '交付完成和弦', assetPath: 'assets/sfx/success.wav', timeSec: t(5, 28) + 0.4, volume: 0.4 },
    ],
  };

  fs.writeFileSync(paths.editPlanFile, JSON.stringify(plan, null, 2), 'utf8');
  await createProjectSnapshot(paths, 'Seeded complete 6-scene interactive demo episode');
  return paths;
}

export async function getProjectSummary(
  workspaceDir: string,
  slug: string,
): Promise<ProjectSummary> {
  const paths = resolveProjectPaths(workspaceDir, slug);
  const stat = fs.statSync(paths.root);

  let title = paths.slug;
  let sceneCount = 0;
  let durationSec = 0;

  if (fs.existsSync(paths.editPlanFile)) {
    try {
      const plan = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8')) as EditPlan;
      title = plan.videoMeta?.title || title;
      sceneCount = Array.isArray(plan.scenes) ? plan.scenes.length : 0;
      if (plan.scenes?.length) {
        durationSec = Math.max(...plan.scenes.map((sc) => sc.endSec || 0));
      }
    } catch {
      // ignore invalid JSON during manual edit
    }
  }

  if (fs.existsSync(paths.audioTimelineFile)) {
    try {
      const tl = JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8')) as AudioTimeline;
      if (tl.totalDurationSec > 0) {
        durationSec = Math.max(durationSec, tl.totalDurationSec);
      }
    } catch {
      // ignore
    }
  }

  let assetCount = 0;
  if (fs.existsSync(paths.assetsManifestFile)) {
    try {
      const m = JSON.parse(fs.readFileSync(paths.assetsManifestFile, 'utf8')) as AssetsManifest;
      assetCount = m.assets?.length || 0;
    } catch {
      // ignore
    }
  }

  const outMp4s = fs.existsSync(paths.outDir)
    ? fs
        .readdirSync(paths.outDir)
        .filter((f) => f.endsWith('.mp4'))
        .sort((a, b) => {
          const sa = fs.statSync(path.join(paths.outDir, a)).mtimeMs;
          const sb = fs.statSync(path.join(paths.outDir, b)).mtimeMs;
          return sb - sa;
        })
    : [];

  const snapshots = await listProjectSnapshots(paths);

  return {
    slug: paths.slug,
    title,
    path: paths.root,
    updatedAt: stat.mtime.toISOString(),
    hasScript: fs.existsSync(paths.scriptFile),
    hasVoiceover: fs.existsSync(paths.voiceoverFile),
    hasTimeline: fs.existsSync(paths.audioTimelineFile),
    hasAssetsManifest: fs.existsSync(paths.assetsManifestFile),
    hasEditPlan: fs.existsSync(paths.editPlanFile),
    hasRenderedVideo: outMp4s.length > 0,
    durationSec: Number(durationSec.toFixed(2)),
    sceneCount,
    assetCount,
    snapshotCount: snapshots.length,
    latestRenderFile: outMp4s[0] ? `out/${outMp4s[0]}` : undefined,
  };
}

export async function listProjects(workspaceDir: string): Promise<ProjectSummary[]> {
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
    return [];
  }

  const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
  const summaries: ProjectSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const candidateRoot = path.join(workspaceDir, entry.name);
    const looksLikeProject =
      fs.existsSync(path.join(candidateRoot, 'script.txt')) ||
      fs.existsSync(path.join(candidateRoot, 'edit_plan.json'));
    if (!looksLikeProject) continue;

    try {
      summaries.push(await getProjectSummary(workspaceDir, entry.name));
    } catch {
      // skip invalid directory names
    }
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
