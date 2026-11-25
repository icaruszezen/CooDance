import fs from 'node:fs';
import path from 'node:path';
import {
  AssetsManifest,
  AudioTimeline,
  EditPlan,
  ProjectSummary,
  TtsRunOptions,
  VideoThemeId,
} from './types.js';
import { ProjectPaths, ensureProjectDirs, resolveProjectPaths } from './paths.js';
import { createProjectSnapshot, ensureProjectGitRepo, listProjectSnapshots } from './snapshot.js';
import { runFfmpeg } from './ffmpeg.js';
import { runTtsPipeline, TtsProgressCallback } from './tts/index.js';
import { inspectProjectAssets } from './inspectAssets.js';
import { fetchAndSaveLogo } from './fetchLogo.js';
import { fetchAndSaveLottie } from './fetchLottie.js';
import { generateProjectSfx } from './generateSfx.js';
import {
  DEMO_DEFAULT_SPEED,
  DEMO_DEFAULT_VOICE,
  PROMO_DEMO_SCRIPT,
  buildPromoDemoEditPlan,
  copyBundledDemoAudio,
  copyBundledDemoMedia,
} from './demoAssets.js';

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

export interface SeedDemoOptions {
  /** Optional live TTS configuration (e.g., user-configured Doubao 2.0 or explicit CLI override). */
  tts?: TtsRunOptions;
  /** Optional progress callback forwarded during TTS synthesis. */
  onProgress?: TtsProgressCallback;
  /** Optional override directory for bundled demo assets (primarily for tests). */
  demoAssetsDir?: string;
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
 * Generates the official CooDance v1.3.0 10-scene interactive product promo episode:
 * - Copies real v1.3.0 Studio UI screenshots, smooth walkthrough video, Aurora Prism logo, and ambient BGM
 * - Enriches with Lottie motion accents and procedural DSP SFX
 * - Runs live Doubao 2.0 (or requested provider) when configured; otherwise auto-fills the
 *   pre-rendered Doubao 2.0 (seed-tts-2.0) studio voiceover & timeline instead of degrading to local synth
 * - Aligns all 10 scenes, 6 chapters, 7 overlay types, and 12 SFX events precisely to sentence timestamps
 */
export async function seedDemoProject(
  workspaceDir: string,
  slug = 'demo-coodance-launch',
  ffmpegCustom?: { ffmpegPath?: string; ffprobePath?: string },
  options?: SeedDemoOptions,
): Promise<ProjectPaths> {
  const paths = await initProject(workspaceDir, slug, {
    title: 'CooDance v1.3.0 · 官方深度功能导览宣传片',
    theme: 'obsidian-studio',
    scriptContent: PROMO_DEMO_SCRIPT,
  });

  // If re-seeding an older demo project, snapshot first and refresh script.txt to the 10-scene promo script
  const existingScript = fs.existsSync(paths.scriptFile)
    ? fs.readFileSync(paths.scriptFile, 'utf8')
    : '';
  if (existingScript.trim() !== PROMO_DEMO_SCRIPT.trim()) {
    await createProjectSnapshot(paths, 'Auto-backup before refreshing 10-scene promo demo');
    fs.writeFileSync(paths.scriptFile, PROMO_DEMO_SCRIPT, 'utf8');
  }

  // 1. Copy real v1.3.0 CooDance Studio screenshots, walkthrough MP4, Aurora Prism logo, and ambient BGM
  const bundledMedia = copyBundledDemoMedia(paths, options?.demoAssetsDir);

  // Clean fallback only if bundled studio_demo_clip.mp4 is unavailable in a minimal dev layout
  const demoVideoPath = path.join(paths.assetsDir, 'studio_demo_clip.mp4');
  if (!bundledMedia.studioVideo && !fs.existsSync(demoVideoPath)) {
    try {
      await runFfmpeg(
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=#0c0c0e:s=1280x720:r=30:d=16',
          '-vf',
          'drawbox=x=40:y=40:w=1200:h=640:color=#18181c@0.95:t=fill,drawbox=x=80:y=96:w=740:h=416:color=#d99b26@0.35:t=4,drawbox=x=80:y=544:w=1120:h=100:color=#4cb487@0.25:t=fill',
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
      bundledMedia.studioVideo = 'assets/studio_demo_clip.mp4';
    } catch {
      // ignore if lavfi unavailable
    }
  }

  // 2. Populate sample logos, Lottie animations, and procedural DSP SFX
  const logoReact = await fetchAndSaveLogo(paths, 'react', 'react').catch(() => null);
  const logoNode = await fetchAndSaveLogo(paths, 'nodedotjs', 'nodejs').catch(() => null);
  const lottiePulse = await fetchAndSaveLottie(paths, 'pulse-ring', 'pulse-ring').catch(() => null);
  const lottieCheck = await fetchAndSaveLottie(paths, 'check-badge', 'check-badge').catch(() => null);
  const lottieAudioBars = await fetchAndSaveLottie(paths, 'audio-bars', 'audio-bars').catch(() => null);
  generateProjectSfx(paths, [
    'impact',
    'whoosh',
    'swoosh',
    'pop',
    'chime',
    'notification',
    'typing',
    'success',
  ]);

  // 3. Smart TTS strategy:
  //    (a) If caller explicitly configured Doubao 2.0 (with valid creds) or Edge/Local override, run live TTS;
  //        on any live synthesis failure, cleanly fall back to pre-baked Doubao 2.0 studio audio.
  //    (b) Otherwise immediately fill the pre-baked Doubao 2.0 (seed-tts-2.0) studio voiceover & timeline
  //        so zero-config / offline users enjoy broadcast-quality narration instead of robotic local synth.
  let timeline: AudioTimeline | null = null;
  const reqTts = options?.tts;
  const hasDoubaoCreds = Boolean(
    (reqTts?.doubaoAppId || process.env.VOLC_TTS_APP_ID) &&
      (reqTts?.doubaoAccessToken || process.env.VOLC_TTS_ACCESS_TOKEN),
  );
  const shouldAttemptLiveTts =
    Boolean(reqTts?.provider) &&
    (reqTts!.provider !== 'doubao' || hasDoubaoCreds);

  if (shouldAttemptLiveTts && reqTts) {
    try {
      const liveTimeline = await runTtsPipeline(
        paths,
        {
          provider: reqTts.provider,
          voice:
            reqTts.voice ||
            (reqTts.provider === 'doubao'
              ? DEMO_DEFAULT_VOICE
              : reqTts.provider === 'edge'
                ? 'zh-CN-YunxiNeural'
                : 'studio-warm-zh'),
          speed: reqTts.speed ?? DEMO_DEFAULT_SPEED,
          silenceThresholdDb: reqTts.silenceThresholdDb ?? -38,
          maxInternalPauseMs: reqTts.maxInternalPauseMs ?? 240,
          paragraphPauseMs: reqTts.paragraphPauseMs ?? 560,
          sentencePauseMs: reqTts.sentencePauseMs ?? 220,
          forceRegenerate: reqTts.forceRegenerate,
          doubaoAppId: reqTts.doubaoAppId,
          doubaoAccessToken: reqTts.doubaoAccessToken,
          doubaoResourceId: reqTts.doubaoResourceId,
          doubaoEndpoint: reqTts.doubaoEndpoint,
        },
        ffmpegCustom,
        options?.onProgress,
      );
      // If user requested Doubao/Edge but it silently degraded to robotic local synth, prefer pre-baked Doubao audio!
      if (reqTts.provider !== 'local' && liveTimeline.provider === 'local') {
        timeline = copyBundledDemoAudio(paths, options?.demoAssetsDir) || liveTimeline;
      } else {
        timeline = liveTimeline;
      }
    } catch {
      timeline = copyBundledDemoAudio(paths, options?.demoAssetsDir);
    }
  } else {
    timeline = copyBundledDemoAudio(paths, options?.demoAssetsDir);
  }

  // Last-resort safety net only if bundled demo audio assets are physically absent
  if (!timeline) {
    timeline = await runTtsPipeline(
      paths,
      { provider: 'local', voice: 'studio-warm-zh', speed: DEMO_DEFAULT_SPEED },
      ffmpegCustom,
      options?.onProgress,
    );
  }

  // 4. Inspect assets (FFprobe specs + 6 uniform video keyframes for studio_demo_clip.mp4)
  await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, ffmpegCustom);

  // 5. Build the 10-scene v1.3.0 showcase EditPlan aligned precisely to ground-truth sentence timestamps
  const plan = buildPromoDemoEditPlan(timeline, {
    ...bundledMedia,
    logoReact: logoReact?.relativePath,
    logoNode: logoNode?.relativePath,
    lottiePulse: lottiePulse?.relativePath,
    lottieCheck: lottieCheck?.relativePath,
    lottieAudioBars: lottieAudioBars?.relativePath,
  });

  fs.writeFileSync(paths.editPlanFile, JSON.stringify(plan, null, 2), 'utf8');
  await createProjectSnapshot(paths, 'Seeded CooDance v1.3.0 10-scene official promo demo');
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
