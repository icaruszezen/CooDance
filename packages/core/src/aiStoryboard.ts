import fs from 'node:fs';
import {
  AssetsManifest,
  AudioTimeline,
  ChapterItem,
  EditPlan,
  OverlayItem,
  SceneItem,
  SfxEvent,
  VideoThemeId,
} from './types.js';
import { ProjectPaths } from './paths.js';

export interface AiStoryboardOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  theme?: VideoThemeId;
  instruction?: string;
}

/**
 * Generates a deterministic, well-structured storyboard directly from `audio_timeline.json`
 * and `assets_manifest.json` without requiring any external LLM.
 */
export function generateDeterministicEditPlan(params: {
  title: string;
  timeline?: AudioTimeline | null;
  manifest?: AssetsManifest | null;
  theme?: VideoThemeId;
}): EditPlan {
  const theme = params.theme ?? 'obsidian-studio';
  const timeline = params.timeline;
  const manifest = params.manifest;

  const videos = manifest?.assets.filter((a) => a.kind === 'video') || [];
  const images = manifest?.assets.filter((a) => a.kind === 'image') || [];
  const logos = manifest?.assets.filter((a) => a.kind === 'logo') || [];
  const lotties = manifest?.assets.filter((a) => a.kind === 'lottie') || [];
  const sfxAssets = manifest?.assets.filter((a) => a.kind === 'audio' && a.relativePath.includes('sfx')) || [];

  const totalDur = Math.max(8, timeline?.totalDurationSec || 18);
  const sentences = timeline?.sentences || [];

  const scenes: SceneItem[] = [];
  const chapters: ChapterItem[] = [];
  const overlays: OverlayItem[] = [];
  const sfxEvents: SfxEvent[] = [];

  if (sentences.length === 0) {
    scenes.push({
      id: 'scene-intro',
      type: 'title-card',
      label: '开场主标题',
      startSec: 0,
      endSec: totalDur,
      transition: 'fade',
      props: {
        eyebrow: 'COODANCE STUDIO',
        heading: params.title,
        subheading: 'Code-as-Video 16:9 自动化视频生产管线',
        badge: '1920×1080 · 60fps',
        logoAsset: logos[0]?.relativePath,
      },
    });
    chapters.push({ id: 'ch-1', title: '开场概览', startSec: 0, endSec: totalDur });
  } else {
    const count = sentences.length;
    const findSfx = (name: string) => sfxAssets.find((s) => s.name.includes(name))?.relativePath;

    sentences.forEach((sent, idx) => {
      const startSec = idx === 0 ? 0 : sent.startSec;
      const endSec = idx === count - 1 ? totalDur : sentences[idx + 1].startSec;

      if (idx === 0) {
        chapters.push({ id: 'ch-intro', title: '开场引入', startSec: 0 });
        scenes.push({
          id: `scene-${idx + 1}`,
          type: 'title-card',
          label: sent.note || '开场标题',
          startSec,
          endSec,
          sentenceIds: [sent.id],
          transition: 'fade',
          props: {
            eyebrow: 'CODE-AS-VIDEO WORKFLOW',
            heading: params.title,
            subheading: sent.text.slice(0, 38),
            badge: '1080P · 60FPS',
            logoAsset: logos[0]?.relativePath,
          },
        });
        const impactSfx = findSfx('impact') || findSfx('whoosh');
        if (impactSfx) {
          sfxEvents.push({ id: `sfx-${idx + 1}`, name: '开场音效', assetPath: impactSfx, timeSec: 0.08, volume: 0.45 });
        }
      } else if (idx === 1 && videos.length > 0) {
        chapters.push({ id: 'ch-demo', title: '实操演示', startSec });
        scenes.push({
          id: `scene-${idx + 1}`,
          type: 'video',
          label: sent.note || `录屏演示 · ${videos[0].name}`,
          startSec,
          endSec,
          sentenceIds: [sent.id],
          transition: 'slide-left',
          props: {
            assetPath: videos[0].relativePath,
            trimStartSec: 0,
            playbackRate: 1.0,
            muted: true,
            fit: 'contain',
            showDeviceFrame: true,
            caption: sent.note || videos[0].name,
            zoomRegion: {
              enabled: true,
              x: 0.14,
              y: 0.16,
              width: 0.56,
              height: 0.54,
              startProgress: 0.25,
              endProgress: 0.78,
            },
          },
        });
        overlays.push({
          id: `ov-callout-${idx}`,
          type: 'callout',
          label: '关键区域说明',
          startSec: Number((startSec + 0.5).toFixed(2)),
          endSec: Number(Math.max(startSec + 1.2, endSec - 0.3).toFixed(2)),
          x: 0.74,
          y: 0.24,
          text: sent.note || '重点交互演示',
          subtext: '自动缩放聚焦与时间轴同步',
          animation: 'pop',
        });
      } else if (idx % 4 === 2) {
        chapters.push({ id: `ch-arch-${idx}`, title: sent.note?.slice(0, 8) || '核心架构', startSec });
        scenes.push({
          id: `scene-${idx + 1}`,
          type: 'data-ui',
          label: sent.note || '管线架构指标',
          startSec,
          endSec,
          sentenceIds: [sent.id],
          transition: 'zoom-in',
          props: {
            variant: 'pipeline',
            heading: sent.note || '自动化生产管线',
            subheading: sent.text.slice(0, 42),
            pipelineSteps: [
              { title: 'TTS 语音与 10ms RMS 气口裁切', subtitle: 'SHA-256 哈希缓存 + 精准字幕时间轴', status: 'done' },
              { title: 'FFprobe 探测与均匀抽帧场记', subtitle: '自动提取分辨率/帧率/关键帧缩略图', status: 'done' },
              { title: 'Remotion 1080p@60fps 声明式渲染', subtitle: 'React 组件化分镜 + Git 时间戳快照', status: 'active' },
            ],
          },
        });
        const chime = findSfx('chime') || findSfx('pop');
        if (chime) {
          sfxEvents.push({ id: `sfx-${idx + 1}`, name: '节点提示', assetPath: chime, timeSec: startSec, volume: 0.35 });
        }
      } else if (idx % 4 === 3 && images.length > 0) {
        scenes.push({
          id: `scene-${idx + 1}`,
          type: 'image',
          label: sent.note || `画面展示 · ${images[0].name}`,
          startSec,
          endSec,
          sentenceIds: [sent.id],
          transition: 'fade',
          props: {
            assetPath: images[0].relativePath,
            fit: 'contain',
            kenBurns: 'zoom-in',
            showFrame: true,
            caption: sent.note || images[0].name,
          },
        });
      } else if (idx === count - 1) {
        chapters.push({ id: 'ch-outro', title: '总结交付', startSec });
        scenes.push({
          id: `scene-${idx + 1}`,
          type: 'split-compare',
          label: sent.note || '效率对比总结',
          startSec,
          endSec,
          sentenceIds: [sent.id],
          transition: 'wipe',
          props: {
            leftTitle: '传统手动剪辑',
            rightTitle: 'CooDance 代码化管线',
            badgeLeft: '耗时重复',
            badgeRight: '100% 可复现',
            leftPoints: ['逐句手动剪气口与对字幕', '反复拖动素材对齐时间点', '修改文案需重做整条轨道'],
            rightPoints: ['10ms RMS 自动去静音 + SRT 同步', 'JSON 声明式分镜与局部缩放', 'Git 时间戳快照一键精准回退'],
          },
        });
        if (lotties[0]) {
          overlays.push({
            id: 'ov-lottie-end',
            type: 'lottie',
            label: '完成动效',
            startSec: Number((startSec + 0.4).toFixed(2)),
            endSec,
            x: 0.86,
            y: 0.2,
            width: 0.12,
            height: 0.18,
            assetPath: lotties[0].relativePath,
          });
        }
      } else {
        scenes.push({
          id: `scene-${idx + 1}`,
          type: 'web-dom',
          label: sent.note || '界面功能演示',
          startSec,
          endSec,
          sentenceIds: [sent.id],
          transition: 'fade',
          props: {
            url: 'https://studio.coodance.app/workspace',
            pageTitle: 'CooDance Studio · Code-as-Video',
            heading: sent.note || '可视化编排与代码源码双向同步',
            description: sent.text,
            highlights: [
              { title: 'edit_plan.json 热重载', badge: '双向同步', description: '外部 AI 或编辑器修改文件后实时刷新画面', active: true },
              { title: '跨平台原生渲染', badge: 'Web / Win / Mac', description: '内置 FFmpeg 与 Remotion 渲染管线' },
            ],
            ctaLabel: '导出 1080p@60fps MP4',
            cursorTargetIndex: 0,
          },
        });
      }
    });
  }

  return {
    version: '1.0.0',
    theme,
    videoMeta: {
      title: params.title,
      subtitle: 'Generated by CooDance Studio',
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
    chapters,
    scenes,
    overlays,
    sfxEvents,
  };
}

/**
 * Generates a copy-paste-ready structured context prompt for external AI coding tools
 * (Claude Code / Cursor / Codex / Antigravity) to edit `script.txt` or `edit_plan.json`.
 */
export function buildAgentContextPrompt(paths: ProjectPaths): string {
  const script = fs.existsSync(paths.scriptFile) ? fs.readFileSync(paths.scriptFile, 'utf8') : '';
  const timeline = fs.existsSync(paths.audioTimelineFile)
    ? JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8'))
    : null;
  const manifest = fs.existsSync(paths.assetsManifestFile)
    ? JSON.parse(fs.readFileSync(paths.assetsManifestFile, 'utf8'))
    : null;
  const currentPlan = fs.existsSync(paths.editPlanFile)
    ? fs.readFileSync(paths.editPlanFile, 'utf8')
    : '';

  const compactTimeline = timeline
    ? {
        totalDurationSec: timeline.totalDurationSec,
        sentences: timeline.sentences.map((s: { id: number; startSec: number; endSec: number; text: string; note?: string }) => ({
          id: s.id,
          startSec: s.startSec,
          endSec: s.endSec,
          note: s.note,
          text: s.text,
        })),
      }
    : null;

  const compactAssets = manifest
    ? manifest.assets.map((a: { relativePath: string; kind: string; width?: number; height?: number; durationSec?: number }) => ({
        relativePath: a.relativePath,
        kind: a.kind,
        width: a.width,
        height: a.height,
        durationSec: a.durationSec,
      }))
    : [];

  return `# CooDance Code-as-Video Project Context (${paths.slug})

## Project Path
\`${paths.root}\`

## Goal
Update \`edit_plan.json\` to craft a crisp, engaging 16:9 (1920x1080 @ 60fps) video synced accurately to \`build/audio_timeline.json\`.

## Supported Scene Types
- \`title-card\`: \`{ eyebrow?, heading, subheading?, badge?, logoAsset? }\`
- \`video\`: \`{ assetPath, trimStartSec, playbackRate, muted?, showDeviceFrame?, caption?, zoomRegion?: { enabled, x, y, width, height } }\`
- \`image\`: \`{ assetPath, fit?, kenBurns?: "none"|"zoom-in"|"zoom-out"|"pan-left"|"pan-right", caption?, showFrame? }\`
- \`split-compare\`: \`{ leftTitle, rightTitle, badgeLeft?, badgeRight?, leftPoints[], rightPoints[], leftAsset?, rightAsset? }\`
- \`data-ui\`: \`{ variant: "metrics"|"terminal"|"pipeline"|"bar-chart", heading, subheading?, metrics?, terminalLines?, pipelineSteps?, chartData? }\`
- \`web-dom\`: \`{ url, pageTitle, heading, description?, highlights[], ctaLabel?, cursorTargetIndex? }\`

## Supported Overlay Types
- \`callout\`, \`arrow\`, \`highlight-box\`, \`badge\`, \`lottie\`, \`logo\`, \`text-card\` (all positioned with normalized \`x\`, \`y\`, \`width\`, \`height\` in \`0..1\`).

## Script (\`script.txt\`)
\`\`\`text
${script.trim()}
\`\`\`

## Audio Timeline (\`build/audio_timeline.json\`)
\`\`\`json
${JSON.stringify(compactTimeline, null, 2)}
\`\`\`

## Available Assets (\`build/assets_manifest.json\`)
\`\`\`json
${JSON.stringify(compactAssets, null, 2)}
\`\`\`

## Current \`edit_plan.json\`
\`\`\`json
${currentPlan.trim().slice(0, 6000)}
\`\`\`
`;
}

/**
 * Optional OpenAI-compatible AI storyboard generator.
 * Falls back cleanly to `generateDeterministicEditPlan` if no API key is configured.
 */
export async function generateAiEditPlan(
  paths: ProjectPaths,
  options: AiStoryboardOptions = {},
): Promise<{ plan: EditPlan; mode: 'llm' | 'deterministic'; note: string }> {
  const timeline: AudioTimeline | null = fs.existsSync(paths.audioTimelineFile)
    ? JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8'))
    : null;
  const manifest: AssetsManifest | null = fs.existsSync(paths.assetsManifestFile)
    ? JSON.parse(fs.readFileSync(paths.assetsManifestFile, 'utf8'))
    : null;
  const existing: EditPlan | null = fs.existsSync(paths.editPlanFile)
    ? JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'))
    : null;

  const title = existing?.videoMeta?.title || paths.slug;
  const theme = options.theme || existing?.theme || 'obsidian-studio';

  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    const plan = generateDeterministicEditPlan({ title, timeline, manifest, theme });
    return {
      plan,
      mode: 'deterministic',
      note: '未配置大模型 API Key，已使用确定性智能对齐引擎根据口播时间轴与素材清单自动生成分镜方案。',
    };
  }

  const baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = options.model || 'gpt-4o-mini';
  const context = buildAgentContextPrompt(paths);

  const systemPrompt =
    'You are an expert Code-as-Video technical director. Return ONLY a valid JSON object matching the EditPlan schema with no markdown code fences. Ensure all scenes seamlessly cover 0..totalDurationSec without gaps, reference only existing asset relativePaths, and align startSec/endSec with audio_timeline sentences.';
  const userPrompt = `${context}\n\nAdditional user direction: ${options.instruction || 'Create a high-craft, visually varied technical presentation storyboard.'}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI API error HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('AI API returned empty completion content.');
  }

  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned) as EditPlan;
  if (!parsed || !Array.isArray(parsed.scenes)) {
    throw new Error('AI output is missing required `scenes` array.');
  }

  return {
    plan: {
      version: parsed.version || '1.0.0',
      theme: parsed.theme || theme,
      videoMeta: {
        title: parsed.videoMeta?.title || title,
        subtitle: parsed.videoMeta?.subtitle || '',
        width: 1920,
        height: 1080,
        fps: 60,
        bgMusicAsset: parsed.videoMeta?.bgMusicAsset,
        bgMusicVolume: parsed.videoMeta?.bgMusicVolume,
      },
      subtitleStyle: parsed.subtitleStyle || {
        enabled: true,
        position: 'bottom',
        fontSize: 44,
        maxCharsPerLine: 22,
        highlightActive: true,
      },
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
      scenes: parsed.scenes,
      overlays: Array.isArray(parsed.overlays) ? parsed.overlays : [],
      sfxEvents: Array.isArray(parsed.sfxEvents) ? parsed.sfxEvents : [],
    },
    mode: 'llm',
    note: `已通过 ${model} 自动生成分镜方案（共 ${parsed.scenes.length} 个分镜）。`,
  };
}
