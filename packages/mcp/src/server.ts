import fs from 'node:fs';
import crypto from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AppSettings,
  AssetsManifest,
  AudioTimeline,
  EditPlan,
  LOTTIE_PRESETS,
  ProgressEvent,
  RenderJobManager,
  SFX_PRESETS,
  SfxPresetId,
  buildAgentContextPrompt,
  createProjectSnapshot,
  defaultRenderJobManager,
  fetchAndSaveLogo,
  fetchAndSaveLottie,
  generateAiEditPlan,
  generateProjectSfx,
  getProjectSummary,
  getSnapshotDiff,
  importProjectAsset,
  initProject,
  inspectProjectAssets,
  listProjectSnapshots,
  listProjects,
  loadSettings,
  parseScriptText,
  readSkillBundleFiles,
  resolveProjectPaths,
  restoreProjectSnapshot,
  runTtsPipeline,
  searchLocalLogos,
  seedDemoProject,
  validateEditPlan,
} from '@coodance/core';

export interface CoodanceMcpServerDeps {
  getSettings?: () => AppSettings;
  renderJobManager?: RenderJobManager;
  onProgress?: (ev: Omit<ProgressEvent, 'timestamp'>) => void;
}

export interface McpCatalogItem {
  name: string;
  stage: 'project' | 'script' | 'assets' | 'storyboard' | 'render' | 'safety';
  title: string;
  description: string;
  guardrail?: string;
}

export const COODANCE_MCP_TOOLS_CATALOG: McpCatalogItem[] = [
  {
    name: 'coodance_manage_project',
    stage: 'project',
    title: '项目管理 (List / Get / Init / Demo / Delete)',
    description: '列出工作区视频工程、查看工程完整摘要、初始化新工程或一键生成 6 镜实机示例。',
  },
  {
    name: 'coodance_update_script',
    stage: 'script',
    title: '更新口播文案 (script.txt)',
    description: '写入或更新口播文案，按行解析句子、视觉备注 [note] 与段落停顿。',
    guardrail: '覆盖前自动打 Git 快照',
  },
  {
    name: 'coodance_run_tts',
    stage: 'script',
    title: '合成配音与毫秒级时间轴 (TTS)',
    description: '逐句语音合成 + 10ms RMS 气口裁切，输出 voiceover.mp3、audio_timeline.json 与 subtitles.srt。',
    guardrail: '默认复用 SHA-256 缓存；付费豆包引擎受安全开关保护',
  },
  {
    name: 'coodance_import_asset',
    stage: 'assets',
    title: '外部素材统一入库 (Import Asset)',
    description: '接收外部 Agent 生产的图片/录屏/SVG 文本/Lottie JSON/Base64/URL，安全落盘至 assets/ 并自动触发 FFprobe 探测。',
    guardrail: '防目录穿越 + 大小上限 + 自动刷新 assets_manifest.json',
  },
  {
    name: 'coodance_enrich_assets',
    stage: 'assets',
    title: '内置素材工坊 (Logo / Lottie / SFX)',
    description: '搜索并拉取品牌矢量 Logo、Lottie 矢量动效预设以及程序化 DSP 音效，自动入库。',
  },
  {
    name: 'coodance_inspect_assets',
    stage: 'assets',
    title: '素材探测与均匀抽帧 (FFprobe)',
    description: '扫描 assets/ 目录、探测宽高/帧率/时长并为视频均匀抽取缩略图，刷新 assets_manifest.json。',
  },
  {
    name: 'coodance_validate_edit_plan',
    stage: 'storyboard',
    title: '分镜强校验演练 (Validate EditPlan)',
    description: '在不写入磁盘的前提下校验 Zod Schema、时间轴无断层/重叠、素材路径存在性与推镜坐标边界。',
    guardrail: '返回精确字段路径与自愈修复建议',
  },
  {
    name: 'coodance_save_edit_plan',
    stage: 'storyboard',
    title: '校验并保存分镜 (Save EditPlan)',
    description: '通过强校验门禁后保存 edit_plan.json（或触发确定性/AI 自动对齐生成），工作台实时热更新。',
    guardrail: '强制校验阻断脏数据 + 覆盖前自动 Git 快照',
  },
  {
    name: 'coodance_render_video',
    stage: 'render',
    title: '启动异步渲染任务 (Render MP4)',
    description: '校验分镜后启动非阻塞 Remotion H.264 MP4 渲染任务（draft 720p30 / production 1080p60），立即返回 jobId。',
    guardrail: '异步防超时 + 渲染前强校验与自动快照',
  },
  {
    name: 'coodance_get_render_status',
    stage: 'render',
    title: '查询渲染进度与结果 (Render Status)',
    description: '按 jobId 或工程名轮询异步渲染进度、阶段日志与最终 MP4 文件路径及大小。',
  },
  {
    name: 'coodance_manage_snapshot',
    stage: 'safety',
    title: 'Git 快照与精准回退 (Snapshot)',
    description: '列出、创建、对比 Diff 或回退整工程 / 单文件（如 edit_plan.json）的历史快照。',
  },
];

export const COODANCE_MCP_RESOURCES_CATALOG = [
  {
    uri: 'coodance://workspace/projects',
    name: '工作区工程列表',
    description: '当前 CooDance 工作区下的所有工程摘要与路径状态。',
  },
  {
    uri: 'coodance://schemas/edit-plan',
    name: 'EditPlan 完整规范',
    description: '6 类场景组件、7 类叠加标注层、3 套主题与校验规则的权威参考文档。',
  },
  {
    uri: 'coodance://project/{slug}/context',
    name: '单工程实时上下文',
    description: '指定工程的口播文案、精确时间轴、素材清单与当前分镜配置。',
  },
  {
    uri: 'coodance://skill/guide',
    name: 'CooDance 5 阶段编导指南 (SKILL.md)',
    description: '供无 Skill 目录支持的通用客户端按需读取的完整创作 SOP。',
  },
];

function jsonResult(data: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return jsonResult({ ok: false, error: message }, true);
}

export function createCoodanceMcpServer(deps: CoodanceMcpServerDeps = {}): McpServer {
  const getSettings = deps.getSettings || loadSettings;
  const renderJobs = deps.renderJobManager || defaultRenderJobManager;

  const server = new McpServer({
    name: 'coodance-studio',
    version: '1.2.0',
  });

  // ---------------------------------------------------------------------------
  // 1. coodance_manage_project
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_manage_project',
    {
      title: 'Manage CooDance Projects',
      description:
        'List all projects, inspect a project workspace summary (script, timeline, assets, editPlan), initialize a new project, seed the 6-scene demo project, or delete a project.',
      inputSchema: {
        action: z.enum(['list', 'get', 'init', 'seed_demo', 'delete']),
        slug: z.string().optional().describe('Project slug (required for get, init, delete; optional for seed_demo)'),
        title: z.string().optional().describe('Human-readable video title (for init)'),
        theme: z
          .enum(['obsidian-studio', 'ivory-editorial', 'cyber-emerald'])
          .optional()
          .describe('Visual theme (for init)'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        fs.mkdirSync(settings.workspaceDir, { recursive: true });

        if (args.action === 'list') {
          const projects = await listProjects(settings.workspaceDir);
          return jsonResult({
            ok: true,
            workspaceDir: settings.workspaceDir,
            count: projects.length,
            projects,
          });
        }

        if (args.action === 'seed_demo') {
          const targetSlug = args.slug?.trim() || 'demo-coodance-launch';
          const paths = await seedDemoProject(settings.workspaceDir, targetSlug, settings.ffmpeg);
          const summary = await getProjectSummary(settings.workspaceDir, paths.slug);
          return jsonResult({ ok: true, project: summary });
        }

        if (!args.slug?.trim()) {
          return jsonResult({ ok: false, error: `slug is required for action="${args.action}"` }, true);
        }

        if (args.action === 'init') {
          const paths = await initProject(settings.workspaceDir, args.slug, {
            title: args.title,
            theme: args.theme,
          });
          const summary = await getProjectSummary(settings.workspaceDir, paths.slug);
          return jsonResult({ ok: true, project: summary });
        }

        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);

        if (args.action === 'delete') {
          if (!fs.existsSync(paths.root)) {
            return jsonResult({ ok: false, error: `Project "${paths.slug}" does not exist.` }, true);
          }
          fs.rmSync(paths.root, { recursive: true, force: true });
          return jsonResult({ ok: true, deletedSlug: paths.slug });
        }

        // action === 'get'
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }
        const summary = await getProjectSummary(settings.workspaceDir, paths.slug);
        const script = fs.existsSync(paths.scriptFile) ? fs.readFileSync(paths.scriptFile, 'utf8') : '';
        const timeline: AudioTimeline | null = fs.existsSync(paths.audioTimelineFile)
          ? (JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8')) as AudioTimeline)
          : null;
        const manifest: AssetsManifest | null = fs.existsSync(paths.assetsManifestFile)
          ? (JSON.parse(fs.readFileSync(paths.assetsManifestFile, 'utf8')) as AssetsManifest)
          : null;
        const editPlan: EditPlan | null = fs.existsSync(paths.editPlanFile)
          ? (JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8')) as EditPlan)
          : null;
        const snapshots = await listProjectSnapshots(paths);

        return jsonResult({
          ok: true,
          summary,
          script,
          timeline: timeline
            ? {
                provider: timeline.provider,
                voice: timeline.voice,
                speed: timeline.speed,
                totalDurationSec: timeline.totalDurationSec,
                sentenceCount: timeline.sentences.length,
                sentences: timeline.sentences.map((s) => ({
                  id: s.id,
                  startSec: s.startSec,
                  endSec: s.endSec,
                  durationSec: s.durationSec,
                  note: s.note,
                  text: s.text,
                })),
              }
            : null,
          assets: manifest?.assets ?? [],
          editPlan,
          recentSnapshots: snapshots.slice(0, 8),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 2. coodance_update_script
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_update_script',
    {
      title: 'Update Spoken Script (script.txt)',
      description:
        'Write or replace script.txt for a project (one spoken sentence per line, optional [visual note], blank lines for paragraph pauses). Automatically creates a Git snapshot before overwriting existing content.',
      inputSchema: {
        slug: z.string().min(1),
        script: z.string().min(1).describe('Full spoken narration script text'),
        skipSnapshot: z.boolean().optional().describe('Set true only if skipping pre-write backup snapshot'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found. Call coodance_manage_project(action="init") first.` }, true);
        }

        let backupSnapshot: string | undefined;
        if (
          settings.mcp.autoSnapshotOnAgentWrite &&
          !args.skipSnapshot &&
          fs.existsSync(paths.scriptFile)
        ) {
          const snap = await createProjectSnapshot(paths, 'Auto-snapshot before MCP script update').catch(() => null);
          backupSnapshot = snap?.tag;
        }

        fs.writeFileSync(paths.scriptFile, args.script.trimEnd() + '\n', 'utf8');
        const parsedLines = parseScriptText(args.script, {
          sentencePauseMs: settings.tts.sentencePauseMs,
          paragraphPauseMs: settings.tts.paragraphPauseMs,
        });

        return jsonResult({
          ok: true,
          slug: paths.slug,
          sentenceCount: parsedLines.length,
          backupSnapshot,
          sentences: parsedLines.map((l) => ({
            id: l.index,
            note: l.note,
            text: l.text,
            pauseAfterMs: l.pauseAfterMs,
          })),
          nextStep: 'Call coodance_run_tts to synthesize audio and lock exact sentence timestamps.',
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 3. coodance_run_tts
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_run_tts',
    {
      title: 'Run TTS & Generate Audio Timeline',
      description:
        'Synthesize sentence-by-sentence narration with SHA-256 caching and 10ms RMS breath/silence trimming, producing build/voiceover.mp3, build/audio_timeline.json, and build/subtitles.srt.',
      inputSchema: {
        slug: z.string().min(1),
        provider: z.enum(['doubao', 'edge', 'local']).optional(),
        voice: z.string().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
        forceRegenerate: z.boolean().optional().describe('Default false (reuses SHA-256 sentence cache)'),
        confirmPaidProvider: z
          .boolean()
          .optional()
          .describe('Explicit acknowledgment when using paid Doubao TTS if permitted by settings'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.scriptFile)) {
          return jsonResult({ ok: false, error: `script.txt not found for "${paths.slug}". Call coodance_update_script first.` }, true);
        }

        let provider = args.provider || settings.tts.defaultProvider;
        const hasDoubaoCreds = Boolean(settings.tts.doubao.appId && settings.tts.doubao.accessToken);

        // Cost guardrail: prevent silent paid API spending by external agents unless enabled in settings
        if (provider === 'doubao' && hasDoubaoCreds && !settings.mcp.allowPaidTtsFromAgent) {
          if (args.provider === 'doubao') {
            return jsonResult(
              {
                ok: false,
                code: 'PAID_TTS_GUARDRAIL_BLOCKED',
                error:
                  'Paid Volcengine Doubao 2.0 TTS is currently guarded against external agent calls (settings.mcp.allowPaidTtsFromAgent=false).',
                suggestion:
                  'Retry with provider="edge" (free neural TTS) or provider="local" (offline preview), or ask the user to enable "允许 Agent 触发付费豆包 TTS" in CooDance Studio Settings / Agent Hub.',
              },
              true,
            );
          }
          // When agent didn't force doubao explicitly, cleanly downgrade default to free edge-tts
          provider = 'edge';
        }

        const voice =
          args.voice ||
          (provider === 'edge'
            ? settings.tts.edge.voice
            : provider === 'doubao'
              ? settings.tts.doubao.voiceType
              : 'studio-warm-zh');

        const jobId = crypto.randomUUID();
        const timeline = await runTtsPipeline(
          paths,
          {
            provider,
            voice,
            speed: args.speed ?? settings.tts.defaultSpeed,
            silenceThresholdDb: settings.tts.silenceThresholdDb,
            maxInternalPauseMs: settings.tts.maxInternalPauseMs,
            paragraphPauseMs: settings.tts.paragraphPauseMs,
            sentencePauseMs: settings.tts.sentencePauseMs,
            forceRegenerate: args.forceRegenerate ?? false,
            doubaoAppId: settings.tts.doubao.appId,
            doubaoAccessToken: settings.tts.doubao.accessToken,
            doubaoResourceId: settings.tts.doubao.resourceId,
            doubaoEndpoint: settings.tts.doubao.endpoint,
          },
          settings.ffmpeg,
          (stage, progress, message, level) => {
            deps.onProgress?.({
              jobId,
              projectSlug: paths.slug,
              kind: 'tts',
              stage,
              progress,
              message,
              level: level || 'info',
            });
          },
        );

        const cachedCount = timeline.sentences.filter((s) => s.cached).length;
        return jsonResult({
          ok: true,
          slug: paths.slug,
          provider: timeline.provider,
          voice: timeline.voice,
          speed: timeline.speed,
          totalDurationSec: timeline.totalDurationSec,
          sentenceCount: timeline.sentences.length,
          cachedSentences: cachedCount,
          voiceoverFile: timeline.voiceoverFile,
          subtitlesFile: timeline.subtitlesFile,
          sentences: timeline.sentences.map((s) => ({
            id: s.id,
            startSec: s.startSec,
            endSec: s.endSec,
            durationSec: s.durationSec,
            trimmedMs: s.trimmedMs,
            cached: s.cached,
            note: s.note,
            text: s.text,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 4. coodance_import_asset
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_import_asset',
    {
      title: 'Import External Asset into Project',
      description:
        'Ingest an external agent-produced asset (local file path, HTTP(S) URL, base64 image/media, or UTF-8 text such as custom SVG diagram or Lottie JSON) safely into assets/ and automatically run FFprobe inspection.',
      inputSchema: {
        slug: z.string().min(1),
        sourceType: z.enum(['localPath', 'url', 'base64', 'text']),
        filename: z.string().min(1).describe('Target filename with extension, e.g. "arch-diagram.svg", "hero.png", "demo.mp4"'),
        category: z
          .enum(['auto', 'media', 'logos', 'lottie', 'sfx'])
          .optional()
          .describe('Subdirectory routing inside assets/ (default auto)'),
        localPath: z.string().optional().describe('Absolute local path when sourceType="localPath"'),
        url: z.string().optional().describe('HTTP(S) URL when sourceType="url"'),
        base64: z.string().optional().describe('Base64 string or data URI when sourceType="base64"'),
        content: z.string().optional().describe('UTF-8 SVG or JSON string when sourceType="text"'),
        overwrite: z.boolean().optional().describe('Overwrite existing file with same name (default true)'),
        autoInspect: z.boolean().optional().describe('Automatically run inspect_assets after saving (default true)'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }

        const jobId = crypto.randomUUID();
        deps.onProgress?.({
          jobId,
          projectSlug: paths.slug,
          kind: 'tool',
          stage: 'import',
          progress: 0.3,
          message: `Importing external asset ${args.filename}...`,
          level: 'info',
        });

        const imported = await importProjectAsset(
          paths,
          {
            sourceType: args.sourceType,
            filename: args.filename,
            category: args.category,
            localPath: args.localPath,
            url: args.url,
            base64: args.base64,
            content: args.content,
            overwrite: args.overwrite ?? true,
            autoInspect: args.autoInspect ?? true,
          },
          settings.ffmpeg,
        );

        deps.onProgress?.({
          jobId,
          projectSlug: paths.slug,
          kind: 'tool',
          stage: 'done',
          progress: 1,
          message: `Imported ${imported.relativePath}`,
          level: 'success',
        });

        return jsonResult({
          ok: true,
          relativePath: imported.relativePath,
          sizeBytes: imported.sizeBytes,
          kind: imported.kind,
          category: imported.category,
          assetItem: imported.assetItem,
          totalAssets: imported.manifest?.assets.length,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 5. coodance_enrich_assets
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_enrich_assets',
    {
      title: 'CooDance Built-in Asset Workshop (Logo / Lottie / SFX)',
      description:
        'Search & fetch brand vector logos (Simple Icons / LobeHub Icons / URL), list or fetch Lottie vector motion accents, or generate procedural DSP sound effects into project assets/.',
      inputSchema: {
        action: z.enum([
          'search_logos',
          'fetch_logo',
          'list_lottie_presets',
          'fetch_lottie',
          'list_sfx_presets',
          'generate_sfx',
        ]),
        slug: z.string().optional().describe('Project slug (required for fetch_logo, fetch_lottie, generate_sfx)'),
        query: z.string().optional().describe('Search keyword, logo slug/URL, or Lottie preset/URL'),
        name: z.string().optional().describe('Optional custom output filename stem'),
        sfxPresets: z
          .array(z.enum(['whoosh', 'pop', 'click', 'chime', 'riser', 'success']))
          .optional()
          .describe('SFX presets to synthesize for action="generate_sfx"'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();

        if (args.action === 'search_logos') {
          return jsonResult({ ok: true, results: searchLocalLogos(args.query || '', 30) });
        }
        if (args.action === 'list_lottie_presets') {
          return jsonResult({ ok: true, presets: LOTTIE_PRESETS });
        }
        if (args.action === 'list_sfx_presets') {
          return jsonResult({ ok: true, presets: SFX_PRESETS });
        }

        if (!args.slug?.trim()) {
          return jsonResult({ ok: false, error: `slug is required for action="${args.action}"` }, true);
        }
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }

        if (args.action === 'fetch_logo') {
          if (!args.query?.trim()) {
            return jsonResult({ ok: false, error: 'query (logo slug or URL) is required for fetch_logo.' }, true);
          }
          const fetched = await fetchAndSaveLogo(paths, args.query, args.name);
          await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
          return jsonResult({ ok: true, fetched });
        }

        if (args.action === 'fetch_lottie') {
          if (!args.query?.trim()) {
            return jsonResult({ ok: false, error: 'query (preset id or Lottie JSON URL) is required for fetch_lottie.' }, true);
          }
          const fetched = await fetchAndSaveLottie(paths, args.query, args.name);
          await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
          return jsonResult({ ok: true, fetched });
        }

        // generate_sfx
        const presets = (args.sfxPresets && args.sfxPresets.length > 0
          ? args.sfxPresets
          : ['whoosh', 'pop', 'chime', 'success']) as SfxPresetId[];
        const generated = generateProjectSfx(paths, presets);
        await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
        return jsonResult({ ok: true, generated });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 6. coodance_inspect_assets
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_inspect_assets',
    {
      title: 'Inspect Project Assets & Extract Video Keyframes',
      description:
        'Scan assets/ using FFprobe to refresh build/assets_manifest.json with dimensions, fps, duration, codecs, and evenly-spaced video thumbnails.',
      inputSchema: {
        slug: z.string().min(1),
        thumbsPerVideo: z.number().int().min(1).max(16).optional(),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }
        const jobId = crypto.randomUUID();
        const manifest = await inspectProjectAssets(
          paths,
          { thumbsPerVideo: args.thumbsPerVideo ?? 6 },
          settings.ffmpeg,
          (progress, message) => {
            deps.onProgress?.({
              jobId,
              projectSlug: paths.slug,
              kind: 'inspect',
              stage: 'inspect',
              progress,
              message,
              level: progress >= 1 ? 'success' : 'info',
            });
          },
        );
        return jsonResult({ ok: true, manifest });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 7. coodance_validate_edit_plan
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_validate_edit_plan',
    {
      title: 'Validate EditPlan (Dry-Run Gate)',
      description:
        'Validate a candidate edit_plan object (or current on-disk edit_plan.json if omitted) against Zod schema, audio_timeline coverage/gaps/overlaps, zoomRegion bounds, and asset file existence without writing to disk.',
      inputSchema: {
        slug: z.string().min(1),
        editPlan: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Candidate EditPlan JSON object; omit to validate current on-disk edit_plan.json'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }

        let target: unknown = args.editPlan;
        if (!target) {
          if (!fs.existsSync(paths.editPlanFile)) {
            return jsonResult({ ok: false, error: 'edit_plan.json does not exist yet on disk.' }, true);
          }
          target = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'));
        }

        const validation = validateEditPlan(paths, target);
        return jsonResult({
          ok: validation.valid,
          valid: validation.valid,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
          errors: validation.errors,
          warnings: validation.warnings,
          summary: validation.summary,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 8. coodance_save_edit_plan
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_save_edit_plan',
    {
      title: 'Validate & Save edit_plan.json',
      description:
        'Save a new edit_plan.json after passing the strict schema + timeline + asset validation gate, or auto-generate a synchronized scaffold (mode="deterministic"|"llm"). Automatically creates a Git backup snapshot before overwriting.',
      inputSchema: {
        slug: z.string().min(1),
        editPlan: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Complete EditPlan JSON object to validate and save'),
        autoGenerate: z
          .enum(['deterministic', 'llm'])
          .optional()
          .describe('Optional: auto-generate an initial aligned EditPlan instead of passing editPlan'),
        theme: z.enum(['obsidian-studio', 'ivory-editorial', 'cyber-emerald']).optional(),
        instruction: z.string().optional().describe('Extra creative direction when autoGenerate="llm"'),
        skipSnapshot: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }

        let candidate: unknown = args.editPlan;
        let generationNote: string | undefined;

        if (!candidate && args.autoGenerate) {
          const gen = await generateAiEditPlan(paths, {
            apiKey: args.autoGenerate === 'llm' ? settings.ai.apiKey : '',
            baseUrl: settings.ai.baseUrl,
            model: settings.ai.model,
            theme: args.theme,
            instruction: args.instruction,
          });
          candidate = gen.plan;
          generationNote = gen.note;
        }

        if (!candidate) {
          return jsonResult(
            { ok: false, error: 'Provide either editPlan object or autoGenerate="deterministic"|"llm".' },
            true,
          );
        }

        const validation = validateEditPlan(paths, candidate);
        if (!validation.valid || !validation.normalizedPlan) {
          return jsonResult(
            {
              ok: false,
              code: 'EDIT_PLAN_VALIDATION_FAILED',
              message:
                'Refused to write edit_plan.json because validation failed. Fix the listed errors and call coodance_save_edit_plan again.',
              errors: validation.errors,
              warnings: validation.warnings,
              summary: validation.summary,
            },
            true,
          );
        }

        let backupSnapshot: string | undefined;
        if (
          settings.mcp.autoSnapshotOnAgentWrite &&
          !args.skipSnapshot &&
          fs.existsSync(paths.editPlanFile)
        ) {
          const snap = await createProjectSnapshot(paths, 'Auto-snapshot before MCP edit_plan save').catch(() => null);
          backupSnapshot = snap?.tag;
        }

        const serialized = JSON.stringify(validation.normalizedPlan, null, 2) + '\n';
        fs.writeFileSync(paths.editPlanFile, serialized, 'utf8');

        return jsonResult({
          ok: true,
          slug: paths.slug,
          savedPath: 'edit_plan.json',
          backupSnapshot,
          note: generationNote,
          warnings: validation.warnings,
          summary: validation.summary,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 9. coodance_render_video (Non-blocking Async Job)
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_render_video',
    {
      title: 'Start Async Video Render (MP4)',
      description:
        'Validate edit_plan.json and start an asynchronous Remotion H.264 MP4 render job (draft 720p30 or production 1080p60). Returns jobId immediately so the call never times out; poll coodance_get_render_status for progress.',
      inputSchema: {
        slug: z.string().min(1),
        preset: z.enum(['draft', 'production']).optional().describe('Default "draft" for fast checks, "production" for 1080p60'),
        outputName: z.string().optional(),
        crf: z.number().int().min(10).max(32).optional(),
        autoSnapshot: z.boolean().optional().describe('Default true'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.editPlanFile)) {
          return jsonResult({ ok: false, error: `edit_plan.json not found for "${paths.slug}".` }, true);
        }

        const plan = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'));
        const validation = validateEditPlan(paths, plan);
        if (!validation.valid) {
          return jsonResult(
            {
              ok: false,
              code: 'RENDER_BLOCKED_BY_VALIDATION',
              message: 'Cannot start render because edit_plan.json has validation errors.',
              errors: validation.errors,
              warnings: validation.warnings,
            },
            true,
          );
        }

        const job = renderJobs.startRenderJob(
          paths,
          {
            preset: args.preset || 'draft',
            outputName: args.outputName,
            crf: args.crf,
            autoSnapshot: args.autoSnapshot ?? settings.mcp.autoSnapshotOnAgentWrite,
          },
          (j, stage, progress, message) => {
            deps.onProgress?.({
              jobId: j.jobId,
              projectSlug: paths.slug,
              kind: 'render',
              stage,
              progress,
              message,
              level: stage === 'done' ? 'success' : stage === 'error' ? 'error' : 'info',
            });
          },
        );

        return jsonResult({
          ok: true,
          jobId: job.jobId,
          projectSlug: job.projectSlug,
          preset: job.preset,
          status: job.status,
          warnings: validation.warnings,
          nextStep: `Poll coodance_get_render_status(jobId="${job.jobId}", slug="${paths.slug}") until status is "succeeded" or "failed".`,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 10. coodance_get_render_status
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_get_render_status',
    {
      title: 'Get Async Render Job Status',
      description:
        'Check progress, stage logs, and final MP4 output details for a render jobId or list recent render jobs for a project.',
      inputSchema: {
        jobId: z.string().optional().describe('Specific jobId returned by coodance_render_video'),
        slug: z.string().optional().describe('Project slug (used to list recent jobs or read persisted job history)'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const projectPaths = args.slug
          ? resolveProjectPaths(settings.workspaceDir, args.slug)
          : undefined;

        if (args.jobId) {
          const job = renderJobs.getJob(args.jobId, projectPaths);
          if (!job) {
            return jsonResult({ ok: false, error: `Render job "${args.jobId}" not found.` }, true);
          }
          return jsonResult({
            ok: true,
            job: {
              ...job,
              progressPercent: Math.round(job.progress * 100),
              recentLogs: job.logs.slice(-10),
            },
          });
        }

        const jobs = renderJobs.listJobs(args.slug, projectPaths).slice(0, 10);
        return jsonResult({
          ok: true,
          count: jobs.length,
          jobs: jobs.map((j) => ({
            jobId: j.jobId,
            projectSlug: j.projectSlug,
            preset: j.preset,
            status: j.status,
            stage: j.stage,
            progressPercent: Math.round(j.progress * 100),
            message: j.message,
            createdAt: j.createdAt,
            completedAt: j.completedAt,
            result: j.result,
            error: j.error,
          })),
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // 11. coodance_manage_snapshot
  // ---------------------------------------------------------------------------
  server.registerTool(
    'coodance_manage_snapshot',
    {
      title: 'Manage Project Git Snapshots',
      description:
        'List, create, inspect diff, or restore full-project or single-file Git timestamp snapshots for safe iterative editing.',
      inputSchema: {
        action: z.enum(['list', 'create', 'diff', 'restore']),
        slug: z.string().min(1),
        note: z.string().optional().describe('Snapshot note (for action="create")'),
        tag: z.string().optional().describe('Snapshot tag name (for action="diff" | "restore")'),
        filePath: z
          .string()
          .optional()
          .describe('Optional relative file path (e.g. "edit_plan.json") for single-file restore'),
      },
    },
    async (args) => {
      try {
        const settings = getSettings();
        const paths = resolveProjectPaths(settings.workspaceDir, args.slug);
        if (!fs.existsSync(paths.root)) {
          return jsonResult({ ok: false, error: `Project "${paths.slug}" not found.` }, true);
        }

        if (args.action === 'list') {
          const snapshots = await listProjectSnapshots(paths);
          return jsonResult({ ok: true, count: snapshots.length, snapshots });
        }

        if (args.action === 'create') {
          const snapshot = await createProjectSnapshot(paths, args.note?.trim() || 'MCP agent snapshot');
          return jsonResult({ ok: true, snapshot });
        }

        if (!args.tag?.trim()) {
          return jsonResult({ ok: false, error: `tag is required for action="${args.action}".` }, true);
        }

        if (args.action === 'diff') {
          const diff = await getSnapshotDiff(paths, args.tag);
          return jsonResult({ ok: true, tag: args.tag, diff });
        }

        const restored = await restoreProjectSnapshot(paths, args.tag, args.filePath);
        return jsonResult({ ok: true, restored });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // MCP Resources (Progressive Context Disclosure)
  // ---------------------------------------------------------------------------
  server.registerResource(
    'workspace-projects',
    'coodance://workspace/projects',
    {
      title: 'CooDance Workspace Projects',
      description: 'List of all video projects in the active CooDance workspace.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const settings = getSettings();
      const projects = await listProjects(settings.workspaceDir);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ workspaceDir: settings.workspaceDir, projects }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'edit-plan-schema',
    'coodance://schemas/edit-plan',
    {
      title: 'CooDance EditPlan Schema & Reference',
      description: 'Complete field reference for edit_plan.json (6 scene types, 7 overlay types, themes, and validation rules).',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const { files } = readSkillBundleFiles();
      const schemaDoc = files.find((f) => f.relativePath === 'references/edit-plan-schema.md');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text:
              schemaDoc?.content ||
              '# EditPlan Schema\nSupported scene types: title-card, video, image, split-compare, data-ui, web-dom.',
          },
        ],
      };
    },
  );

  server.registerResource(
    'skill-guide',
    'coodance://skill/guide',
    {
      title: 'CooDance Video Producer SOP (SKILL.md)',
      description: '5-stage Code-as-Video director workflow & external asset production guide.',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const { files } = readSkillBundleFiles();
      const skillDoc = files.find((f) => f.relativePath === 'SKILL.md');
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text:
              skillDoc?.content ||
              '# CooDance Video Producer\nUse coodance_* MCP tools in 5 stages: init/script -> TTS -> assets -> validate/save edit_plan -> render.',
          },
        ],
      };
    },
  );

  server.registerResource(
    'project-context',
    new ResourceTemplate('coodance://project/{slug}/context', {
      list: async () => {
        const settings = getSettings();
        const projects = await listProjects(settings.workspaceDir);
        return {
          resources: projects.map((p) => ({
            uri: `coodance://project/${encodeURIComponent(p.slug)}/context`,
            name: `${p.title} (${p.slug})`,
            description: `Live script, audio_timeline, assets_manifest & edit_plan for ${p.slug}`,
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    {
      title: 'Project Live Context',
      description: 'Structured project context combining script.txt, audio_timeline.json, assets_manifest.json, and edit_plan.json.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const settings = getSettings();
      const rawSlug = Array.isArray(variables.slug) ? variables.slug[0] : String(variables.slug || '');
      const paths = resolveProjectPaths(settings.workspaceDir, decodeURIComponent(rawSlug));
      const context = buildAgentContextPrompt(paths);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: context,
          },
        ],
      };
    },
  );

  return server;
}
