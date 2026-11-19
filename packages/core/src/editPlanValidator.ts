import fs from 'node:fs';
import { z } from 'zod';
import {
  AssetsManifest,
  AudioTimeline,
  EditPlan,
  EditPlanValidationIssue,
  EditPlanValidationResult,
  SceneItem,
} from './types.js';
import { ProjectPaths, resolveSafeProjectFile } from './paths.js';

const VideoThemeSchema = z.enum(['obsidian-studio', 'ivory-editorial', 'cyber-emerald']);
const SceneTypeSchema = z.enum([
  'title-card',
  'video',
  'image',
  'split-compare',
  'data-ui',
  'web-dom',
]);
const TransitionTypeSchema = z.enum(['none', 'fade', 'slide-left', 'zoom-in', 'wipe']);
const OverlayTypeSchema = z.enum([
  'callout',
  'arrow',
  'highlight-box',
  'badge',
  'lottie',
  'logo',
  'text-card',
]);

const ZoomRegionSchema = z.object({
  enabled: z.boolean(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
  startProgress: z.number().min(0).max(1).optional(),
  endProgress: z.number().min(0).max(1).optional(),
});

const TitleCardPropsSchema = z.object({
  eyebrow: z.string().optional(),
  heading: z.string().min(1, 'title-card requires a non-empty heading'),
  subheading: z.string().optional(),
  badge: z.string().optional(),
  logoAsset: z.string().optional(),
});

const VideoScenePropsSchema = z.object({
  assetPath: z.string().min(1, 'video scene requires assetPath'),
  trimStartSec: z.number().min(0).default(0),
  playbackRate: z.number().min(0.25).max(4).default(1),
  muted: z.boolean().optional(),
  volume: z.number().min(0).max(2).optional(),
  fit: z.enum(['contain', 'cover']).optional(),
  showDeviceFrame: z.boolean().optional(),
  caption: z.string().optional(),
  zoomRegion: ZoomRegionSchema.optional(),
});

const ImageScenePropsSchema = z.object({
  assetPath: z.string().min(1, 'image scene requires assetPath'),
  fit: z.enum(['contain', 'cover']).optional(),
  kenBurns: z.enum(['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right']).optional(),
  caption: z.string().optional(),
  showFrame: z.boolean().optional(),
});

const SplitComparePropsSchema = z.object({
  leftTitle: z.string().min(1, 'split-compare requires leftTitle'),
  rightTitle: z.string().min(1, 'split-compare requires rightTitle'),
  leftAsset: z.string().optional(),
  rightAsset: z.string().optional(),
  leftPoints: z.array(z.string()).optional(),
  rightPoints: z.array(z.string()).optional(),
  badgeLeft: z.string().optional(),
  badgeRight: z.string().optional(),
  splitRatio: z.number().min(0.2).max(0.8).optional(),
});

const DataUiPropsSchema = z.object({
  variant: z.enum(['metrics', 'terminal', 'pipeline', 'bar-chart']),
  heading: z.string().min(1, 'data-ui requires heading'),
  subheading: z.string().optional(),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().optional(),
        accent: z.enum(['primary', 'success', 'warning', 'neutral']).optional(),
      }),
    )
    .optional(),
  terminalLines: z.array(z.string()).optional(),
  pipelineSteps: z
    .array(
      z.object({
        title: z.string(),
        subtitle: z.string(),
        status: z.enum(['done', 'active', 'queued']),
      }),
    )
    .optional(),
  chartData: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        highlight: z.boolean().optional(),
      }),
    )
    .optional(),
});

const WebDomPropsSchema = z.object({
  url: z.string().min(1, 'web-dom requires url'),
  pageTitle: z.string().min(1, 'web-dom requires pageTitle'),
  heading: z.string().min(1, 'web-dom requires heading'),
  description: z.string().optional(),
  highlights: z
    .array(
      z.object({
        title: z.string(),
        badge: z.string().optional(),
        description: z.string(),
        active: z.boolean().optional(),
      }),
    )
    .optional(),
  ctaLabel: z.string().optional(),
  cursorTargetIndex: z.number().int().min(0).optional(),
});

const SceneItemSchema = z.object({
  id: z.string().min(1),
  type: SceneTypeSchema,
  label: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().gt(0),
  sentenceIds: z.array(z.number().int().min(0)).optional(),
  transition: TransitionTypeSchema.optional(),
  props: z.record(z.string(), z.unknown()),
});

const ChapterItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().gt(0).optional(),
  color: z.string().optional(),
});

const OverlayItemSchema = z.object({
  id: z.string().min(1),
  type: OverlayTypeSchema,
  label: z.string().min(1),
  startSec: z.number().min(0),
  endSec: z.number().gt(0),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1).optional(),
  height: z.number().gt(0).max(1).optional(),
  text: z.string().optional(),
  subtext: z.string().optional(),
  color: z.string().optional(),
  assetPath: z.string().optional(),
  lottiePreset: z.string().optional(),
  arrowDirection: z
    .enum([
      'up',
      'down',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ])
    .optional(),
  animation: z.enum(['pop', 'slide-up', 'fade', 'pulse']).optional(),
});

const SfxEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  assetPath: z.string().min(1),
  timeSec: z.number().min(0),
  volume: z.number().min(0).max(2).optional(),
});

const SubtitleStyleSchema = z.object({
  enabled: z.boolean().default(true),
  position: z.enum(['bottom', 'lower-third']).default('bottom'),
  fontSize: z.number().min(18).max(96).default(44),
  maxCharsPerLine: z.number().int().min(8).max(60).default(22),
  highlightActive: z.boolean().default(true),
});

const VideoMetaSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  width: z.number().int().min(640).max(3840).default(1920),
  height: z.number().int().min(360).max(2160).default(1080),
  fps: z.number().int().min(24).max(120).default(60),
  bgMusicAsset: z.string().optional(),
  bgMusicVolume: z.number().min(0).max(1).optional(),
});

export const EditPlanSchema = z.object({
  version: z.string().default('1.0.0'),
  theme: VideoThemeSchema.default('obsidian-studio'),
  videoMeta: VideoMetaSchema,
  subtitleStyle: SubtitleStyleSchema.default({
    enabled: true,
    position: 'bottom',
    fontSize: 44,
    maxCharsPerLine: 22,
    highlightActive: true,
  }),
  chapters: z.array(ChapterItemSchema).default([]),
  scenes: z.array(SceneItemSchema).min(1, 'At least one scene is required'),
  overlays: z.array(OverlayItemSchema).default([]),
  sfxEvents: z.array(SfxEventSchema).default([]),
});

function validateScenePropsByType(
  scene: SceneItem,
  idx: number,
  issues: EditPlanValidationIssue[],
): void {
  const propSchemas: Record<SceneItem['type'], z.ZodTypeAny> = {
    'title-card': TitleCardPropsSchema,
    video: VideoScenePropsSchema,
    image: ImageScenePropsSchema,
    'split-compare': SplitComparePropsSchema,
    'data-ui': DataUiPropsSchema,
    'web-dom': WebDomPropsSchema,
  };

  const schema = propSchemas[scene.type];
  const parsed = schema.safeParse(scene.props);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        severity: 'error',
        code: 'INVALID_SCENE_PROPS',
        path: `scenes[${idx}].props.${err.path.join('.')}`.replace(/\.$/, ''),
        message: `Scene "${scene.id}" (${scene.type}) invalid props: ${err.message}`,
        suggestion: `Fix field "${err.path.join('.') || 'props'}" to match ${scene.type} schema.`,
      });
    }
    return;
  }

  // Additional semantic checks for specific scene types
  if (scene.type === 'video') {
    const zr = scene.props.zoomRegion as
      | { enabled?: boolean; x: number; y: number; width: number; height: number; startProgress?: number; endProgress?: number }
      | undefined;
    if (zr?.enabled) {
      if (zr.x + zr.width > 1.01 || zr.y + zr.height > 1.01) {
        issues.push({
          severity: 'error',
          code: 'ZOOM_REGION_OUT_OF_BOUNDS',
          path: `scenes[${idx}].props.zoomRegion`,
          message: `Scene "${scene.id}" zoomRegion exceeds normalized [0,1] bounds (x+width=${(zr.x + zr.width).toFixed(2)}, y+height=${(zr.y + zr.height).toFixed(2)}).`,
          suggestion: 'Ensure x + width <= 1.0 and y + height <= 1.0.',
        });
      }
      if (
        typeof zr.startProgress === 'number' &&
        typeof zr.endProgress === 'number' &&
        zr.endProgress < zr.startProgress
      ) {
        issues.push({
          severity: 'error',
          code: 'ZOOM_PROGRESS_INVERTED',
          path: `scenes[${idx}].props.zoomRegion`,
          message: `Scene "${scene.id}" zoomRegion endProgress (${zr.endProgress}) < startProgress (${zr.startProgress}).`,
          suggestion: 'Set endProgress >= startProgress (e.g. startProgress: 0.15, endProgress: 0.85).',
        });
      }
    }
  } else if (scene.type === 'data-ui') {
    const variant = scene.props.variant as string;
    if (variant === 'metrics' && (!Array.isArray(scene.props.metrics) || scene.props.metrics.length === 0)) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_DATA_UI_CONTENT',
        path: `scenes[${idx}].props.metrics`,
        message: `Scene "${scene.id}" uses data-ui variant "metrics" with empty metrics array.`,
        suggestion: 'Add 2–4 metric items with label, value, and optional delta.',
      });
    } else if (
      variant === 'terminal' &&
      (!Array.isArray(scene.props.terminalLines) || scene.props.terminalLines.length === 0)
    ) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_DATA_UI_CONTENT',
        path: `scenes[${idx}].props.terminalLines`,
        message: `Scene "${scene.id}" uses data-ui variant "terminal" with empty terminalLines.`,
        suggestion: 'Provide command & output lines in terminalLines.',
      });
    } else if (
      variant === 'pipeline' &&
      (!Array.isArray(scene.props.pipelineSteps) || scene.props.pipelineSteps.length === 0)
    ) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_DATA_UI_CONTENT',
        path: `scenes[${idx}].props.pipelineSteps`,
        message: `Scene "${scene.id}" uses data-ui variant "pipeline" with empty pipelineSteps.`,
        suggestion: 'Provide 3–5 workflow steps in pipelineSteps.',
      });
    } else if (
      variant === 'bar-chart' &&
      (!Array.isArray(scene.props.chartData) || scene.props.chartData.length === 0)
    ) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_DATA_UI_CONTENT',
        path: `scenes[${idx}].props.chartData`,
        message: `Scene "${scene.id}" uses data-ui variant "bar-chart" with empty chartData.`,
        suggestion: 'Provide 3–6 bars in chartData with label and numeric value.',
      });
    }
  }
}

function suggestClosestAssets(missingPath: string, existingPaths: string[]): string | undefined {
  if (existingPaths.length === 0) return undefined;
  const lower = missingPath.toLowerCase();
  const base = lower.split('/').pop() || lower;
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '';
  const scored = existingPaths
    .map((p) => {
      const pLower = p.toLowerCase();
      let score = 0;
      if (ext && pLower.endsWith(ext)) score += 2;
      const pBase = pLower.split('/').pop() || pLower;
      if (pBase.includes(base.replace(ext, '')) || base.includes(pBase.replace(ext, ''))) {
        score += 4;
      }
      if (lower.includes('logo') && pLower.includes('logo')) score += 2;
      if (lower.includes('sfx') && pLower.includes('sfx')) score += 2;
      if (lower.includes('lottie') && pLower.includes('lottie')) score += 2;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3).map((s) => s.p);
  return `Available assets: ${top.join(', ')}. Or import/create the asset first with coodance_import_asset / coodance_enrich_assets.`;
}

export function validateEditPlan(
  paths: ProjectPaths,
  candidate: unknown,
  options: {
    timeline?: AudioTimeline | null;
    manifest?: AssetsManifest | null;
    gapToleranceSec?: number;
  } = {},
): EditPlanValidationResult {
  const issues: EditPlanValidationIssue[] = [];
  const gapTol = options.gapToleranceSec ?? 0.12;

  const timeline: AudioTimeline | null =
    options.timeline !== undefined
      ? options.timeline
      : fs.existsSync(paths.audioTimelineFile)
        ? (JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8')) as AudioTimeline)
        : null;

  const manifest: AssetsManifest | null =
    options.manifest !== undefined
      ? options.manifest
      : fs.existsSync(paths.assetsManifestFile)
        ? (JSON.parse(fs.readFileSync(paths.assetsManifestFile, 'utf8')) as AssetsManifest)
        : null;

  const existingAssetPaths = manifest ? manifest.assets.map((a) => a.relativePath) : [];
  const manifestByPath = new Map(manifest?.assets.map((a) => [a.relativePath, a]) || []);

  const parsed = EditPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        severity: 'error',
        code: 'SCHEMA_VALIDATION_ERROR',
        path: err.path.join('.') || '(root)',
        message: err.message,
        suggestion: 'Check edit_plan.json structure against coodance://schemas/edit-plan.',
      });
    }
    return {
      valid: false,
      errors: issues,
      warnings: [],
      summary: {
        sceneCount: 0,
        overlayCount: 0,
        sfxCount: 0,
        chapterCount: 0,
        planDurationSec: 0,
        audioDurationSec: timeline?.totalDurationSec ?? null,
        referencedAssets: [],
        missingAssets: [],
      },
    };
  }

  const plan = parsed.data as EditPlan;
  const referencedAssets = new Set<string>();
  const missingAssets = new Set<string>();

  const checkAssetRef = (relPath: unknown, fieldPath: string) => {
    if (typeof relPath !== 'string' || !relPath.trim()) return;
    const cleaned = relPath.trim().replace(/\\/g, '/');
    referencedAssets.add(cleaned);
    try {
      const full = resolveSafeProjectFile(paths.root, cleaned);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        missingAssets.add(cleaned);
        issues.push({
          severity: 'error',
          code: 'MISSING_ASSET_FILE',
          path: fieldPath,
          message: `Referenced asset "${cleaned}" does not exist on disk.`,
          suggestion: suggestClosestAssets(cleaned, existingAssetPaths),
        });
      }
    } catch {
      missingAssets.add(cleaned);
      issues.push({
        severity: 'error',
        code: 'UNSAFE_ASSET_PATH',
        path: fieldPath,
        message: `Asset path "${cleaned}" escapes the project root directory.`,
        suggestion: 'Use a relative path inside the project such as "assets/demo.mp4".',
      });
    }
  };

  if (plan.videoMeta.bgMusicAsset) {
    checkAssetRef(plan.videoMeta.bgMusicAsset, 'videoMeta.bgMusicAsset');
  }

  // Validate scenes individually & chronologically
  const seenSceneIds = new Set<string>();
  const scenes = plan.scenes;
  let consecutiveSameType = 1;

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (seenSceneIds.has(s.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_SCENE_ID',
        path: `scenes[${i}].id`,
        message: `Duplicate scene id "${s.id}".`,
        suggestion: `Assign a unique id such as "scene-${i + 1}".`,
      });
    }
    seenSceneIds.add(s.id);

    if (s.endSec <= s.startSec) {
      issues.push({
        severity: 'error',
        code: 'INVALID_SCENE_DURATION',
        path: `scenes[${i}]`,
        message: `Scene "${s.id}" has endSec (${s.endSec}) <= startSec (${s.startSec}).`,
        suggestion: 'Ensure endSec is strictly greater than startSec.',
      });
    }

    validateScenePropsByType(s, i, issues);

    // Asset reference checks inside scene props
    if (typeof s.props.assetPath === 'string') {
      checkAssetRef(s.props.assetPath, `scenes[${i}].props.assetPath`);
    }
    if (typeof s.props.logoAsset === 'string') {
      checkAssetRef(s.props.logoAsset, `scenes[${i}].props.logoAsset`);
    }
    if (typeof s.props.leftAsset === 'string') {
      checkAssetRef(s.props.leftAsset, `scenes[${i}].props.leftAsset`);
    }
    if (typeof s.props.rightAsset === 'string') {
      checkAssetRef(s.props.rightAsset, `scenes[${i}].props.rightAsset`);
    }

    // Check video trimStartSec against manifest duration
    if (s.type === 'video' && typeof s.props.assetPath === 'string') {
      const item = manifestByPath.get(s.props.assetPath);
      const trimStart = Number(s.props.trimStartSec ?? 0);
      if (item?.durationSec && trimStart >= item.durationSec) {
        issues.push({
          severity: 'error',
          code: 'TRIM_EXCEEDS_VIDEO_DURATION',
          path: `scenes[${i}].props.trimStartSec`,
          message: `Scene "${s.id}" trimStartSec (${trimStart}s) exceeds video duration (${item.durationSec.toFixed(2)}s).`,
          suggestion: `Set trimStartSec between 0 and ${Math.max(0, item.durationSec - 1).toFixed(2)}.`,
        });
      }
    }

    // Continuity checks with previous scene
    if (i > 0) {
      const prev = scenes[i - 1];
      if (s.startSec < prev.startSec) {
        issues.push({
          severity: 'error',
          code: 'SCENES_UNSORTED',
          path: `scenes[${i}].startSec`,
          message: `Scene "${s.id}" starts at ${s.startSec}s which is earlier than previous scene "${prev.id}" (${prev.startSec}s).`,
          suggestion: 'Sort scenes in chronological order by startSec.',
        });
      } else {
        const delta = Number((s.startSec - prev.endSec).toFixed(3));
        if (delta > gapTol) {
          issues.push({
            severity: 'error',
            code: 'TIMELINE_GAP',
            path: `scenes[${i}].startSec`,
            message: `Timeline gap of ${delta}s between "${prev.id}" (end ${prev.endSec}s) and "${s.id}" (start ${s.startSec}s).`,
            suggestion: `Set scenes[${i}].startSec = ${prev.endSec} (or extend previous scene endSec to ${s.startSec}).`,
          });
        } else if (delta < -gapTol) {
          issues.push({
            severity: 'error',
            code: 'TIMELINE_OVERLAP',
            path: `scenes[${i}].startSec`,
            message: `Timeline overlap of ${Math.abs(delta)}s between "${prev.id}" (end ${prev.endSec}s) and "${s.id}" (start ${s.startSec}s).`,
            suggestion: `Align scenes[${i}].startSec = ${prev.endSec} so scenes do not collide.`,
          });
        }
      }

      if (s.type === prev.type) {
        consecutiveSameType += 1;
        if (consecutiveSameType >= 3) {
          issues.push({
            severity: 'warning',
            code: 'REPETITIVE_SCENE_TYPE',
            path: `scenes[${i}].type`,
            message: `Scene type "${s.type}" repeats ${consecutiveSameType} times consecutively at "${s.id}".`,
            suggestion: 'Mix scene types (e.g., data-ui, split-compare, web-dom, image, video) to keep viewer engagement high.',
          });
        }
      } else {
        consecutiveSameType = 1;
      }
    }
  }

  const firstStart = scenes[0]?.startSec ?? 0;
  const planDurationSec = Number(
    scenes.reduce((max, s) => Math.max(max, s.endSec), 0).toFixed(3),
  );

  if (firstStart > gapTol) {
    issues.push({
      severity: 'error',
      code: 'TIMELINE_LATE_START',
      path: 'scenes[0].startSec',
      message: `First scene starts at ${firstStart}s instead of 0s, causing an initial blank frame.`,
      suggestion: 'Set scenes[0].startSec = 0.',
    });
  }

  if (timeline && timeline.totalDurationSec > 0) {
    const diff = Number((timeline.totalDurationSec - planDurationSec).toFixed(3));
    if (diff > 0.35) {
      issues.push({
        severity: 'error',
        code: 'TIMELINE_INCOMPLETE_COVERAGE',
        path: `scenes[${scenes.length - 1}].endSec`,
        message: `Scenes end at ${planDurationSec}s, leaving ${diff}s of audio uncovered (audio totalDurationSec = ${timeline.totalDurationSec}s).`,
        suggestion: `Extend the final scene's endSec to ${timeline.totalDurationSec} (or add a closing scene).`,
      });
    } else if (diff < -1.5) {
      issues.push({
        severity: 'warning',
        code: 'TIMELINE_LONGER_THAN_AUDIO',
        path: `scenes[${scenes.length - 1}].endSec`,
        message: `Scenes end at ${planDurationSec}s which is ${Math.abs(diff)}s longer than audio (${timeline.totalDurationSec}s).`,
        suggestion: `Trim final scene endSec closer to ${timeline.totalDurationSec} unless an outro hold is intentional.`,
      });
    }
  }

  // Validate overlays
  for (let i = 0; i < plan.overlays.length; i++) {
    const ov = plan.overlays[i];
    if (ov.endSec <= ov.startSec) {
      issues.push({
        severity: 'error',
        code: 'INVALID_OVERLAY_DURATION',
        path: `overlays[${i}]`,
        message: `Overlay "${ov.id}" has endSec (${ov.endSec}) <= startSec (${ov.startSec}).`,
        suggestion: 'Ensure overlay endSec > startSec.',
      });
    }
    if (ov.assetPath) {
      checkAssetRef(ov.assetPath, `overlays[${i}].assetPath`);
    }
    if (ov.type === 'logo' && !ov.assetPath) {
      issues.push({
        severity: 'error',
        code: 'MISSING_OVERLAY_ASSET',
        path: `overlays[${i}].assetPath`,
        message: `Logo overlay "${ov.id}" requires assetPath.`,
        suggestion: 'Fetch a logo via coodance_enrich_assets(action="fetch_logo") and set assetPath.',
      });
    }
    if (ov.type === 'lottie' && !ov.assetPath && !ov.lottiePreset) {
      issues.push({
        severity: 'error',
        code: 'MISSING_LOTTIE_SOURCE',
        path: `overlays[${i}]`,
        message: `Lottie overlay "${ov.id}" requires either assetPath or lottiePreset.`,
        suggestion: 'Set lottiePreset (e.g. "pulse-ring", "check-badge") or fetch a Lottie file.',
      });
    }
    if (plan.subtitleStyle.enabled && ov.y > 0.82) {
      issues.push({
        severity: 'warning',
        code: 'OVERLAY_SUBTITLE_COLLISION',
        path: `overlays[${i}].y`,
        message: `Overlay "${ov.id}" is positioned at y=${ov.y}, which may overlap bottom subtitles.`,
        suggestion: 'Keep overlays at y <= 0.78 when subtitles are enabled.',
      });
    }
  }

  // Validate SFX events
  const effectiveDuration = Math.max(planDurationSec, timeline?.totalDurationSec ?? 0);
  for (let i = 0; i < plan.sfxEvents.length; i++) {
    const sfx = plan.sfxEvents[i];
    checkAssetRef(sfx.assetPath, `sfxEvents[${i}].assetPath`);
    if (effectiveDuration > 0 && sfx.timeSec > effectiveDuration + 0.5) {
      issues.push({
        severity: 'warning',
        code: 'SFX_AFTER_VIDEO_END',
        path: `sfxEvents[${i}].timeSec`,
        message: `SFX "${sfx.id}" triggers at ${sfx.timeSec}s, past the video duration (${effectiveDuration}s).`,
        suggestion: `Move timeSec within [0, ${effectiveDuration}].`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      sceneCount: scenes.length,
      overlayCount: plan.overlays.length,
      sfxCount: plan.sfxEvents.length,
      chapterCount: plan.chapters.length,
      planDurationSec,
      audioDurationSec: timeline?.totalDurationSec ?? null,
      referencedAssets: Array.from(referencedAssets),
      missingAssets: Array.from(missingAssets),
    },
    normalizedPlan: errors.length === 0 ? plan : undefined,
  };
}
