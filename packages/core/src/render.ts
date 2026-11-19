import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { AudioTimeline, EditPlan, RenderOptions, RenderResult } from './types.js';
import { ProjectPaths, ensureProjectDirs, resolveSafeProjectFile, toPosixPath } from './paths.js';
import { createProjectSnapshot } from './snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveRemotionPackageDir(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    process.env.COODANCE_REMOTION_DIR || '',
    resourcesPath ? path.join(resourcesPath, 'packages', 'remotion') : '',
    path.resolve(__dirname, '../../../remotion'),
    path.resolve(process.cwd(), 'packages/remotion'),
  ].filter(Boolean);
  for (const cand of candidates) {
    if (fs.existsSync(path.join(cand, 'src/registerRoot.ts'))) {
      return cand;
    }
  }
  return candidates[0];
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Starts a tiny local HTTP Range file server serving `<projectRoot>` for headless Remotion render.
 */
async function startEphemeralMediaServer(projectRoot: string): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const rel = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, '');
      const fullPath = resolveSafeProjectFile(projectRoot, rel);
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const stat = fs.statSync(fullPath);
      const mime = getMimeType(fullPath);
      const range = req.headers.range;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');

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
    } catch {
      res.writeHead(403);
      res.end('Forbidden');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function detectBrowserExecutable(): string | undefined {
  if (process.env.REMOTION_BROWSER_EXECUTABLE && fs.existsSync(process.env.REMOTION_BROWSER_EXECUTABLE)) {
    return process.env.REMOTION_BROWSER_EXECUTABLE;
  }
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return undefined;
}

/**
 * Syncs a project's `edit_plan.json`, `audio_timeline.json`, and media assets into
 * `packages/remotion` so `npm run studio` (Remotion Studio) immediately opens that episode.
 */
export function syncProjectForRemotionStudio(paths: ProjectPaths): {
  syncedJsonPath: string;
  publicDir: string;
} {
  const remotionDir = resolveRemotionPackageDir();
  const editPlan: EditPlan = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'));
  const timeline: AudioTimeline | null = fs.existsSync(paths.audioTimelineFile)
    ? JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8'))
    : null;

  const publicDir = path.join(remotionDir, 'public');
  const publicProjectDir = path.join(publicDir, 'project');
  fs.rmSync(publicProjectDir, { recursive: true, force: true });
  fs.mkdirSync(publicProjectDir, { recursive: true });

  // Copy assets and voiceover for standalone Remotion Studio staticFile() access
  if (fs.existsSync(paths.assetsDir)) {
    fs.cpSync(paths.assetsDir, path.join(publicProjectDir, 'assets'), { recursive: true });
  }
  if (fs.existsSync(paths.voiceoverFile)) {
    fs.mkdirSync(path.join(publicProjectDir, 'build'), { recursive: true });
    fs.copyFileSync(paths.voiceoverFile, path.join(publicProjectDir, 'build/voiceover.mp3'));
  }

  const payload = JSON.stringify(
    {
      projectSlug: paths.slug,
      mediaBaseUrl: '/project',
      editPlan,
      timeline,
    },
    null,
    2,
  );
  const syncedJsonPath = path.join(publicProjectDir, 'active-project.json');
  fs.writeFileSync(syncedJsonPath, payload, 'utf8');
  fs.writeFileSync(path.join(remotionDir, 'src/active-project.generated.json'), payload, 'utf8');

  return { syncedJsonPath, publicDir };
}

let cachedBundleLocation: string | null = null;

/**
 * Full Stage 5 Production / Draft Render Engine (`scripts/render-project.mjs` + Studio UI).
 * Outputs H.264 (`yuv420p`) MP4 at 1920x1080@60fps (production) or 1280x720@30fps (draft).
 */
export async function renderProjectVideo(
  paths: ProjectPaths,
  options: RenderOptions = {},
  onProgress?: (stage: string, progress: number, message: string) => void,
): Promise<RenderResult> {
  ensureProjectDirs(paths);

  if (!fs.existsSync(paths.editPlanFile)) {
    throw new Error(`edit_plan.json not found in ${paths.root}`);
  }

  const editPlan: EditPlan = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'));
  const timeline: AudioTimeline | null = fs.existsSync(paths.audioTimelineFile)
    ? JSON.parse(fs.readFileSync(paths.audioTimelineFile, 'utf8'))
    : null;

  const preset = options.preset ?? 'production';
  const width = preset === 'draft' ? 1280 : 1920;
  const height = preset === 'draft' ? 720 : 1080;
  const fps = preset === 'draft' ? 30 : 60;

  let snapshotTag: string | undefined;
  if (options.autoSnapshot !== false) {
    try {
      const snap = await createProjectSnapshot(paths, `Auto-snapshot before ${preset} render`);
      snapshotTag = snap.tag;
      onProgress?.('snapshot', 0.04, `渲染前已自动保存版本快照: ${snap.tag}`);
    } catch {
      // Non-fatal if git unavailable
    }
  }

  const remotionDir = resolveRemotionPackageDir();
  const entryPoint = path.join(remotionDir, 'src/registerRoot.ts');
  if (!fs.existsSync(entryPoint)) {
    throw new Error(`Remotion entry not found at ${entryPoint}`);
  }

  const mediaServer = await startEphemeralMediaServer(paths.root);
  const prevNoProxy = process.env.NO_PROXY;
  const prevLowerNoProxy = process.env.no_proxy;
  const nextNoProxy = prevNoProxy ? `${prevNoProxy},127.0.0.1,localhost` : '127.0.0.1,localhost';
  process.env.NO_PROXY = nextNoProxy;
  process.env.no_proxy = nextNoProxy;

  try {
    if (!cachedBundleLocation || !fs.existsSync(cachedBundleLocation)) {
      onProgress?.('bundle', 0.12, '正在编译 Remotion 视频合成工程...');
      cachedBundleLocation = await bundle({
        entryPoint,
        onProgress: (p) => {
          onProgress?.('bundle', 0.12 + (p / 100) * 0.18, `打包合成组件 ${Math.round(p)}%`);
        },
      });
    } else {
      onProgress?.('bundle', 0.28, '复用已缓存的 Remotion 合成包...');
    }

    const totalDurationSec = Math.max(
      timeline?.totalDurationSec || 0,
      editPlan.scenes.reduce((max, sc) => Math.max(max, sc.endSec || 0), 0),
      3,
    );
    const durationInFrames = Math.max(1, Math.ceil(totalDurationSec * fps));

    const inputProps = {
      projectSlug: paths.slug,
      mediaBaseUrl: mediaServer.baseUrl,
      editPlan: {
        ...editPlan,
        videoMeta: {
          ...editPlan.videoMeta,
          width,
          height,
          fps,
        },
      },
      timeline,
    };

    const browserExecutable = detectBrowserExecutable();
    const chromiumOptions = {
      disableWebSecurity: true,
      ignoreCertificateErrors: true,
      enableMultiProcessOnLinux: true,
    };

    onProgress?.('select', 0.32, `初始化无头渲染引擎 (${width}×${height} @ ${fps}fps)...`);

    const composition = await selectComposition({
      serveUrl: cachedBundleLocation,
      id: 'CooDanceMain',
      inputProps,
      browserExecutable,
      chromiumOptions,
    });

    const outFileName =
      options.outputName?.trim() ||
      (preset === 'draft' ? `${paths.slug}-draft-720p.mp4` : `${paths.slug}-1080p60.mp4`);
    const safeOutName = outFileName.endsWith('.mp4') ? outFileName : `${outFileName}.mp4`;
    const outputPath = path.join(paths.outDir, safeOutName);

    onProgress?.('render', 0.36, `开始逐帧渲染 ${durationInFrames} 帧 -> ${safeOutName}`);

    let lastReported = 0;
    await renderMedia({
      composition: {
        ...composition,
        width,
        height,
        fps,
        durationInFrames,
      },
      serveUrl: cachedBundleLocation,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      crf: options.crf ?? (preset === 'draft' ? 24 : 18),
      outputLocation: outputPath,
      inputProps,
      browserExecutable,
      chromiumOptions,
      concurrency: options.concurrency ?? 2,
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        if (progress - lastReported >= 0.03 || progress >= 1) {
          lastReported = progress;
          const pct = Math.round(progress * 100);
          onProgress?.(
            'render',
            0.36 + progress * 0.62,
            `渲染进度 ${pct}%（已渲染 ${renderedFrames}/${durationInFrames} 帧，已编码 ${encodedFrames} 帧）`,
          );
        }
      },
    });

    const stat = fs.statSync(outputPath);
    onProgress?.('done', 1, `成片导出完成: ${safeOutName} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      outputPath,
      relativePath: toPosixPath(path.relative(paths.root, outputPath)),
      durationSec: Number(totalDurationSec.toFixed(2)),
      width,
      height,
      fps,
      sizeBytes: stat.size,
      snapshotTag,
    };
  } finally {
    if (prevNoProxy === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = prevNoProxy;
    }
    if (prevLowerNoProxy === undefined) {
      delete process.env.no_proxy;
    } else {
      process.env.no_proxy = prevLowerNoProxy;
    }
    await mediaServer.close();
  }
}
