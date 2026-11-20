import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import {
  AgentClientId,
  AppSettings,
  AssetsManifest,
  AudioTimeline,
  EditPlan,
  ImportAssetOptions,
  InstallAgentOptions,
  LOTTIE_PRESETS,
  RenderJobManager,
  SFX_PRESETS,
  SfxPresetId,
  buildAgentContextPrompt,
  buildSkillZipBuffer,
  checkFfmpegHealth,
  createProjectSnapshot,
  fetchAndSaveLogo,
  fetchAndSaveLottie,
  generateAiEditPlan,
  generateProjectSfx,
  getAgentIntegrationInfo,
  getProjectSummary,
  getSnapshotDiff,
  importProjectAsset,
  initProject,
  inspectProjectAssets,
  installAgentIntegration,
  listProjectSnapshots,
  listProjects,
  loadSettings,
  maskSettingsForClient,
  readSkillBundleFiles,
  renderProjectVideo,
  resolveProjectPaths,
  resolveRemotionPackageDir,
  resolveSafeProjectFile,
  restoreProjectSnapshot,
  runTtsPipeline,
  saveSettings,
  searchLocalLogos,
  seedDemoProject,
  syncProjectForRemotionStudio,
  uninstallAgentIntegration,
  validateEditPlan,
} from '@coodance/core';
import {
  COODANCE_MCP_RESOURCES_CATALOG,
  COODANCE_MCP_TOOLS_CATALOG,
  mountCoodanceMcpHttp,
} from '@coodance/mcp';
import { StudioEventHub } from './ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StartServerOptions {
  port?: number;
  host?: string;
  staticWebDir?: string;
  workspaceDirOverride?: string;
  isDesktop?: boolean;
  fixedPortRequested?: number | null;
  portFallbackReason?: string;
  electronExecutablePath?: string;
  mcpStdioScriptPath?: string;
  skillSourceDir?: string;
}

export interface RunningStudioServer {
  port: number;
  host: string;
  url: string;
  close: () => Promise<void>;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.srt': 'text/plain; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
  };
  return map[ext] || 'application/octet-stream';
}

function resolveDefaultWebDist(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return null;
}

export async function startStudioServer(
  options: StartServerOptions = {},
): Promise<RunningStudioServer> {
  if (options.workspaceDirOverride) {
    process.env.COODANCE_WORKSPACE = options.workspaceDirOverride;
  }

  let settings: AppSettings = loadSettings();
  fs.mkdirSync(settings.workspaceDir, { recursive: true });

  const app = express();
  const httpServer = http.createServer(app);
  const hub = new StudioEventHub(httpServer, () => settings.security.webAccessToken || '');
  hub.watchWorkspace(settings.workspaceDir);
  const renderJobManager = new RenderJobManager();

  let studioProc: ChildProcess | null = null;
  let actualPortRef = 0;
  let defaultServerUrlRef = '';

  app.use(
    cors({
      exposedHeaders: ['Mcp-Session-Id'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-coodance-token',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
        'Last-Event-ID',
      ],
    }),
  );
  app.use(express.json({ limit: '50mb' }));

  const isAuthorizedRequest = (req: Request): boolean => {
    const required = settings.security.webAccessToken;
    if (!required) return true;
    const authHeader = req.headers.authorization || '';
    const headerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : String(req.headers['x-coodance-token'] || '');
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    return headerToken === required || queryToken === required;
  };

  // Mount Streamable HTTP MCP endpoint (/mcp) sharing settings, auth, render jobs, and live WS progress
  const mcpHttp = mountCoodanceMcpHttp(app, {
    path: '/mcp',
    getSettings: () => settings,
    renderJobManager,
    isEnabled: () => settings.mcp.enabled,
    authorize: isAuthorizedRequest,
    onProgress: (ev) => hub.emitProgress(ev),
  });

  // Optional access token middleware for self-hosted Web mode
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health' || isAuthorizedRequest(req)) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized: invalid or missing access token' });
  });

  // 1. Health & Diagnostics
  app.get('/api/health', async (_req, res) => {
    const ffmpeg = await checkFfmpegHealth(settings.ffmpeg);
    res.json({
      ok: true,
      version: '1.1.3',
      platform: process.platform,
      nodeVersion: process.version,
      workspaceDir: settings.workspaceDir,
      authRequired: Boolean(settings.security.webAccessToken),
      mcp: {
        enabled: settings.mcp.enabled,
        endpoint: '/mcp',
        activeSessions: mcpHttp.getActiveSessionCount(),
      },
      ffmpeg,
    });
  });

  // 2. Settings
  app.get('/api/settings', async (_req, res) => {
    const ffmpeg = await checkFfmpegHealth(settings.ffmpeg);
    res.json({
      settings: maskSettingsForClient(settings),
      ffmpeg,
    });
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const incoming = req.body as Partial<AppSettings>;
      // Preserve existing secrets if frontend sends masked placeholder
      const sanitized: Partial<AppSettings> = {
        ...incoming,
        tts: incoming.tts
          ? {
              ...incoming.tts,
              doubao: incoming.tts.doubao
                ? {
                    ...incoming.tts.doubao,
                    accessToken:
                      incoming.tts.doubao.accessToken === '••••••••'
                        ? settings.tts.doubao.accessToken
                        : incoming.tts.doubao.accessToken,
                  }
                : settings.tts.doubao,
            }
          : undefined,
        ai: incoming.ai
          ? {
              ...incoming.ai,
              apiKey:
                incoming.ai.apiKey === '••••••••' ? settings.ai.apiKey : incoming.ai.apiKey,
            }
          : undefined,
        security: incoming.security
          ? {
              ...incoming.security,
              webAccessToken:
                incoming.security.webAccessToken === '••••••••'
                  ? settings.security.webAccessToken
                  : incoming.security.webAccessToken,
            }
          : undefined,
      };

      settings = saveSettings(sanitized);
      fs.mkdirSync(settings.workspaceDir, { recursive: true });
      hub.watchWorkspace(settings.workspaceDir);
      const ffmpeg = await checkFfmpegHealth(settings.ffmpeg);
      res.json({ settings: maskSettingsForClient(settings), ffmpeg });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 3. Projects CRUD
  app.get('/api/projects', async (_req, res) => {
    try {
      const projects = await listProjects(settings.workspaceDir);
      res.json({ workspaceDir: settings.workspaceDir, projects });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const { slug, title, theme, demo } = req.body as {
        slug?: string;
        title?: string;
        theme?: EditPlan['theme'];
        demo?: boolean;
      };
      const targetSlug = slug?.trim() || (demo ? 'demo-coodance-launch' : `video-${Date.now()}`);
      const paths = demo
        ? await seedDemoProject(settings.workspaceDir, targetSlug, settings.ffmpeg)
        : await initProject(settings.workspaceDir, targetSlug, { title, theme });
      const summary = await getProjectSummary(settings.workspaceDir, paths.slug);
      res.status(201).json({ project: summary });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:slug', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      if (!fs.existsSync(paths.root)) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const summary = await getProjectSummary(settings.workspaceDir, paths.slug);
      const script = fs.existsSync(paths.scriptFile)
        ? fs.readFileSync(paths.scriptFile, 'utf8')
        : '';
      let editPlan: EditPlan | null = null;
      let editPlanRaw = '';
      if (fs.existsSync(paths.editPlanFile)) {
        editPlanRaw = fs.readFileSync(paths.editPlanFile, 'utf8');
        try {
          editPlan = JSON.parse(editPlanRaw) as EditPlan;
        } catch {
          editPlan = null;
        }
      }

      const timeline: AudioTimeline | null = fs.existsSync(paths.audioTimelineFile)
        ? (JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8')) as AudioTimeline)
        : null;
      const manifest: AssetsManifest | null = fs.existsSync(paths.assetsManifestFile)
        ? (JSON.parse(fs.readFileSync(paths.assetsManifestFile, 'utf8')) as AssetsManifest)
        : null;
      const subtitlesSrt = fs.existsSync(paths.subtitlesFile)
        ? fs.readFileSync(paths.subtitlesFile, 'utf8')
        : '';
      const snapshots = await listProjectSnapshots(paths);

      const renders = fs.existsSync(paths.outDir)
        ? fs
            .readdirSync(paths.outDir)
            .filter((f) => f.endsWith('.mp4'))
            .map((f) => {
              const full = path.join(paths.outDir, f);
              const stat = fs.statSync(full);
              return {
                name: f,
                relativePath: `out/${f}`,
                sizeBytes: stat.size,
                modifiedAt: stat.mtime.toISOString(),
              };
            })
            .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        : [];

      res.json({
        summary,
        script,
        editPlan,
        editPlanRaw,
        timeline,
        manifest,
        subtitlesSrt,
        snapshots,
        renders,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/projects/:slug', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      if (fs.existsSync(paths.root)) {
        fs.rmSync(paths.root, { recursive: true, force: true });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 4. Stage 2: Script & TTS
  app.put('/api/projects/:slug/script', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { script } = req.body as { script: string };
      fs.writeFileSync(paths.scriptFile, script ?? '', 'utf8');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:slug/tts', async (req, res) => {
    const jobId = crypto.randomUUID();
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const body = req.body as {
        provider?: AppSettings['tts']['defaultProvider'];
        voice?: string;
        speed?: number;
        silenceThresholdDb?: number;
        maxInternalPauseMs?: number;
        paragraphPauseMs?: number;
        sentencePauseMs?: number;
        forceRegenerate?: boolean;
      };

      const provider = body.provider || settings.tts.defaultProvider;
      const voice =
        body.voice ||
        (provider === 'edge'
          ? settings.tts.edge.voice
          : provider === 'doubao'
            ? settings.tts.doubao.voiceType
            : 'studio-warm-zh');

      const timeline = await runTtsPipeline(
        paths,
        {
          provider,
          voice,
          speed: body.speed ?? settings.tts.defaultSpeed,
          silenceThresholdDb: body.silenceThresholdDb ?? settings.tts.silenceThresholdDb,
          maxInternalPauseMs: body.maxInternalPauseMs ?? settings.tts.maxInternalPauseMs,
          paragraphPauseMs: body.paragraphPauseMs ?? settings.tts.paragraphPauseMs,
          sentencePauseMs: body.sentencePauseMs ?? settings.tts.sentencePauseMs,
          forceRegenerate: body.forceRegenerate,
          doubaoAppId: settings.tts.doubao.appId,
          doubaoAccessToken: settings.tts.doubao.accessToken,
          doubaoResourceId: settings.tts.doubao.resourceId,
          doubaoEndpoint: settings.tts.doubao.endpoint,
        },
        settings.ffmpeg,
        (stage, progress, message, level) => {
          hub.emitProgress({
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

      res.json({ timeline });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      hub.emitProgress({
        jobId,
        projectSlug: req.params.slug,
        kind: 'tts',
        stage: 'error',
        progress: 1,
        message: msg,
        level: 'error',
      });
      res.status(500).json({ error: msg });
    }
  });

  // 5. Stage 3: Assets Upload, Inspection & Enrichment Tools
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        try {
          const paths = resolveProjectPaths(settings.workspaceDir, String(req.params.slug));
          fs.mkdirSync(paths.assetsDir, { recursive: true });
          cb(null, paths.assetsDir);
        } catch (err) {
          cb(err as Error, '');
        }
      },
      filename: (_req, file, cb) => {
        const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const safe = path.basename(decoded).replace(/[<>:"/\\|?*]+/g, '_');
        cb(null, safe || `asset-${Date.now()}`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB per upload
  });

  app.post('/api/projects/:slug/assets/upload', upload.array('files', 20), async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, String(req.params.slug));
      const manifest = await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
      res.json({ manifest });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:slug/assets/inspect', async (req, res) => {
    const jobId = crypto.randomUUID();
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const thumbsPerVideo = Number(req.body?.thumbsPerVideo) || 6;
      const manifest = await inspectProjectAssets(
        paths,
        { thumbsPerVideo },
        settings.ffmpeg,
        (progress, message) => {
          hub.emitProgress({
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
      res.json({ manifest });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/projects/:slug/assets', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const relativePath = String(req.query.path || '');
      if (!relativePath.startsWith('assets/')) {
        res.status(400).json({ error: 'Can only delete files under assets/' });
        return;
      }
      const target = resolveSafeProjectFile(paths.root, relativePath);
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        fs.unlinkSync(target);
      }
      const manifest = await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
      res.json({ manifest });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Enrichment Tools (Logo / Lottie / SFX)
  app.get('/api/tools/logos/search', (req, res) => {
    const q = String(req.query.q || '');
    const results = searchLocalLogos(q, 36);
    res.json({ results });
  });

  app.post('/api/projects/:slug/tools/fetch-logo', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { queryOrUrl, name } = req.body as { queryOrUrl: string; name?: string };
      const fetched = await fetchAndSaveLogo(paths, queryOrUrl, name);
      const manifest = await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
      res.json({ fetched, manifest });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/tools/lottie/presets', (_req, res) => {
    res.json({ presets: LOTTIE_PRESETS });
  });

  app.post('/api/projects/:slug/tools/fetch-lottie', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { presetOrUrl, name } = req.body as { presetOrUrl: string; name?: string };
      const fetched = await fetchAndSaveLottie(paths, presetOrUrl, name);
      const manifest = await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
      res.json({ fetched, manifest });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/tools/sfx/presets', (_req, res) => {
    res.json({ presets: SFX_PRESETS });
  });

  app.post('/api/projects/:slug/tools/generate-sfx', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { presets } = req.body as { presets?: SfxPresetId[] };
      const generated = generateProjectSfx(paths, presets);
      const manifest = await inspectProjectAssets(paths, { thumbsPerVideo: 6 }, settings.ffmpeg);
      res.json({ generated, manifest });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 5b. Unified External Asset Import (localPath / url / base64 / text SVG or JSON)
  app.post('/api/projects/:slug/assets/import', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const imported = await importProjectAsset(paths, req.body as ImportAssetOptions, settings.ffmpeg);
      res.status(201).json(imported);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 6. Stage 4: Edit Plan Validation, Persistence & AI Storyboard Assistant
  app.post('/api/projects/:slug/edit-plan/validate', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { editPlan, rawJson } = (req.body || {}) as { editPlan?: unknown; rawJson?: string };
      let candidate: unknown;
      if (typeof rawJson === 'string') {
        candidate = JSON.parse(rawJson);
      } else if (editPlan !== undefined) {
        candidate = editPlan;
      } else if (fs.existsSync(paths.editPlanFile)) {
        candidate = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'));
      } else {
        res.status(404).json({ error: 'edit_plan.json not found' });
        return;
      }
      const validation = validateEditPlan(paths, candidate);
      res.json(validation);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/projects/:slug/edit-plan', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { editPlan, rawJson } = req.body as { editPlan?: EditPlan; rawJson?: string };
      let serialized: string;
      let parsed: EditPlan;

      if (typeof rawJson === 'string') {
        parsed = JSON.parse(rawJson) as EditPlan;
        serialized = JSON.stringify(parsed, null, 2);
      } else if (editPlan) {
        parsed = editPlan;
        serialized = JSON.stringify(editPlan, null, 2);
      } else {
        res.status(400).json({ error: 'Missing editPlan or rawJson' });
        return;
      }

      fs.writeFileSync(paths.editPlanFile, serialized, 'utf8');
      res.json({ editPlan: parsed, editPlanRaw: serialized });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:slug/ai/storyboard', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { instruction, theme, useLlm } = req.body as {
        instruction?: string;
        theme?: EditPlan['theme'];
        useLlm?: boolean;
      };

      // Auto-snapshot before overwriting edit_plan.json
      const snap = await createProjectSnapshot(paths, 'Auto-snapshot before AI storyboard generation').catch(() => null);

      const result = await generateAiEditPlan(paths, {
        apiKey: useLlm === false ? '' : settings.ai.apiKey,
        baseUrl: settings.ai.baseUrl,
        model: settings.ai.model,
        theme,
        instruction,
      });

      const serialized = JSON.stringify(result.plan, null, 2);
      fs.writeFileSync(paths.editPlanFile, serialized, 'utf8');
      res.json({
        editPlan: result.plan,
        editPlanRaw: serialized,
        mode: result.mode,
        note: result.note,
        backupSnapshot: snap?.tag,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:slug/ai/agent-context', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const prompt = buildAgentContextPrompt(paths);
      res.json({ prompt });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 7. Stage 5: Remotion Studio Sync & Video Rendering (Sync + Async Jobs)
  app.post('/api/projects/:slug/sync-studio', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const synced = syncProjectForRemotionStudio(paths);
      const launch = Boolean(req.body?.launch);
      let studioUrl: string | undefined;

      if (launch) {
        if (studioProc && !studioProc.killed) {
          studioProc.kill();
        }
        const remotionDir = resolveRemotionPackageDir();
        const entry = path.join(remotionDir, 'src/registerRoot.ts');
        studioProc = spawn(
          process.platform === 'win32' ? 'npx.cmd' : 'npx',
          ['remotion', 'studio', entry, '--port', '3030'],
          {
            cwd: path.resolve(remotionDir, '../..'),
            stdio: 'ignore',
            detached: false,
          },
        );
        studioUrl = 'http://localhost:3030';
      }

      res.json({ synced, studioUrl });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:slug/render', async (req, res) => {
    const jobId = crypto.randomUUID();
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { preset, outputName, crf, autoSnapshot } = req.body as {
        preset?: 'production' | 'draft';
        outputName?: string;
        crf?: number;
        autoSnapshot?: boolean;
      };

      const result = await renderProjectVideo(
        paths,
        { preset, outputName, crf, autoSnapshot },
        (stage, progress, message) => {
          hub.emitProgress({
            jobId,
            projectSlug: paths.slug,
            kind: 'render',
            stage,
            progress,
            message,
            level: stage === 'done' ? 'success' : 'info',
          });
        },
      );

      res.json({ result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      hub.emitProgress({
        jobId,
        projectSlug: req.params.slug,
        kind: 'render',
        stage: 'error',
        progress: 1,
        message: msg,
        level: 'error',
      });
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/projects/:slug/render/async', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { preset, outputName, crf, autoSnapshot } = (req.body || {}) as {
        preset?: 'production' | 'draft';
        outputName?: string;
        crf?: number;
        autoSnapshot?: boolean;
      };
      const job = renderJobManager.startRenderJob(
        paths,
        { preset, outputName, crf, autoSnapshot },
        (j, stage, progress, message) => {
          hub.emitProgress({
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
      res.status(202).json({ job });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:slug/render/jobs', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const jobs = renderJobManager.listJobs(paths.slug, paths);
      res.json({ jobs });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/render-jobs/:jobId', (req, res) => {
    const slug = typeof req.query.slug === 'string' ? req.query.slug : undefined;
    const projectPaths = slug ? resolveProjectPaths(settings.workspaceDir, slug) : undefined;
    const job = renderJobManager.getJob(req.params.jobId, projectPaths);
    if (!job) {
      res.status(404).json({ error: 'Render job not found' });
      return;
    }
    res.json({ job });
  });

  // 8. Git Snapshots & Full / Single-File Rollback
  app.get('/api/projects/:slug/snapshots', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const snapshots = await listProjectSnapshots(paths);
      res.json({ snapshots });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:slug/snapshots', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { note } = req.body as { note?: string };
      const snapshot = await createProjectSnapshot(paths, note?.trim() || 'Manual snapshot');
      const snapshots = await listProjectSnapshots(paths);
      res.status(201).json({ snapshot, snapshots });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:slug/snapshots/:tag/diff', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const diff = await getSnapshotDiff(paths, req.params.tag);
      res.json(diff);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:slug/snapshots/:tag/restore', async (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, req.params.slug);
      const { filePath } = req.body as { filePath?: string };
      const restored = await restoreProjectSnapshot(paths, req.params.tag, filePath);
      const snapshots = await listProjectSnapshots(paths);
      res.json({ restored, snapshots });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 8b. External AI Agent Integration Hub (MCP + Skill Discovery, Export & One-Click Installer)
  const buildAgentCtx = (req: Request) => {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'http';
    const hostHeader = req.get('host');
    const httpBaseUrl = hostHeader ? `${proto}://${hostHeader}` : defaultServerUrlRef;
    return {
      settings,
      httpBaseUrl,
      actualPort: actualPortRef,
      fixedPortRequested: options.fixedPortRequested ?? null,
      portFallbackReason: options.portFallbackReason,
      isDesktop: options.isDesktop,
      electronExecutablePath: options.electronExecutablePath,
      mcpStdioScriptPath: options.mcpStdioScriptPath,
      skillSourceDir: options.skillSourceDir,
    };
  };

  app.get('/api/agent/info', (req, res) => {
    try {
      const info = getAgentIntegrationInfo(buildAgentCtx(req));
      res.json({
        info,
        activeMcpSessions: mcpHttp.getActiveSessionCount(),
        toolsCatalog: COODANCE_MCP_TOOLS_CATALOG,
        resourcesCatalog: COODANCE_MCP_RESOURCES_CATALOG,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/agent/install', (req, res) => {
    try {
      const result = installAgentIntegration(buildAgentCtx(req), req.body as InstallAgentOptions);
      const info = getAgentIntegrationInfo(buildAgentCtx(req));
      res.json({ result, info });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/agent/uninstall', (req, res) => {
    try {
      const { clientId, removeMcp, removeSkill } = req.body as {
        clientId: AgentClientId;
        removeMcp?: boolean;
        removeSkill?: boolean;
      };
      const result = uninstallAgentIntegration(clientId, { removeMcp, removeSkill });
      const info = getAgentIntegrationInfo(buildAgentCtx(req));
      res.json({ result, info });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/agent/skill/files', (_req, res) => {
    try {
      const bundle = readSkillBundleFiles(options.skillSourceDir);
      res.json(bundle);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/agent/skill.zip', (_req, res) => {
    try {
      const zipBuf = buildSkillZipBuffer(options.skillSourceDir);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="coodance-video-producer-skill.zip"',
      );
      res.setHeader('Content-Length', String(zipBuf.length));
      res.send(zipBuf);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9. Safe Project File Streaming with HTTP Range Support (for Video/Audio/Thumb/Lottie/MP4)
  app.get('/api/projects/:slug/files/*filePath', (req, res) => {
    try {
      const paths = resolveProjectPaths(settings.workspaceDir, String(req.params.slug));
      const rawParam = (req.params as Record<string, string | string[]>).filePath;
      const rel = Array.isArray(rawParam) ? rawParam.join('/') : String(rawParam || '');
      const fullPath = resolveSafeProjectFile(paths.root, rel);

      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const stat = fs.statSync(fullPath);
      const mime = getMimeType(fullPath);
      const range = req.headers.range;

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache');

      if (req.query.download === '1') {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(fullPath))}`,
        );
      }

      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        const start = match?.[1] ? parseInt(match[1], 10) : 0;
        const end = match?.[2] ? Math.min(stat.size - 1, parseInt(match[2], 10)) : stat.size - 1;
        const chunkSize = Math.max(0, end - start + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunkSize,
          'Content-Type': mime,
        });
        fs.createReadStream(fullPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': mime,
        });
        fs.createReadStream(fullPath).pipe(res);
      }
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 10. Serve built Web Frontend SPA if present
  const webDist = options.staticWebDir || resolveDefaultWebDist();
  if (webDist && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*spaFallback', (req, res, next) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/ws') ||
        req.path === '/mcp' ||
        req.path.startsWith('/mcp/')
      ) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  const host = options.host || process.env.COODANCE_HOST || '127.0.0.1';
  const port = options.port ?? (process.env.COODANCE_PORT ? Number(process.env.COODANCE_PORT) : 4170);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });

  const addr = httpServer.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`;
  actualPortRef = actualPort;
  defaultServerUrlRef = url;

  return {
    port: actualPort,
    host,
    url,
    close: async () => {
      if (studioProc && !studioProc.killed) {
        studioProc.kill();
      }
      await mcpHttp.close().catch(() => {});
      await hub.close().catch(() => {});
      await Promise.race([
        new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
          httpServer.closeIdleConnections?.();
          httpServer.closeAllConnections?.();
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    },
  };
}
