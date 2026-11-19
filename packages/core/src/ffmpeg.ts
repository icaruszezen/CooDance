import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface FfmpegBinaries {
  ffmpeg: string;
  ffprobe: string;
  source: 'custom' | 'env' | 'bundled' | 'system';
}

function fixAsarUnpacked(binPath: string): string {
  if (binPath.includes('app.asar') && !binPath.includes('app.asar.unpacked')) {
    const unpacked = binPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
  }
  return binPath;
}

function isExecutableFile(filePath: string | undefined | null): filePath is string {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function getUnpackedNodeModulesCandidates(): string[] {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '';
  return [
    resourcesPath ? path.join(resourcesPath, 'app.asar.unpacked', 'node_modules') : '',
    path.resolve(__dirname, '../app.asar.unpacked/node_modules'),
  ].filter((dir) => Boolean(dir) && fs.existsSync(dir));
}

function tryLoadStaticModule<T>(pkgName: string): T | null {
  try {
    return require(pkgName) as T;
  } catch {
    // Fall back to app.asar.unpacked when executed from bundled resources/mcp/stdio.mjs
  }
  for (const nmDir of getUnpackedNodeModulesCandidates()) {
    const pkgEntry = path.join(nmDir, pkgName, 'index.js');
    if (fs.existsSync(pkgEntry)) {
      try {
        return require(pkgEntry) as T;
      } catch {
        // continue
      }
    }
  }
  return null;
}

export function resolveFfmpegBinaries(custom?: {
  ffmpegPath?: string;
  ffprobePath?: string;
}): FfmpegBinaries {
  // 1. Custom user settings
  if (isExecutableFile(custom?.ffmpegPath) && isExecutableFile(custom?.ffprobePath)) {
    return {
      ffmpeg: custom!.ffmpegPath!,
      ffprobe: custom!.ffprobePath!,
      source: 'custom',
    };
  }

  // 2. Environment variables
  if (isExecutableFile(process.env.FFMPEG_PATH) && isExecutableFile(process.env.FFPROBE_PATH)) {
    return {
      ffmpeg: process.env.FFMPEG_PATH!,
      ffprobe: process.env.FFPROBE_PATH!,
      source: 'env',
    };
  }

  // 3. Bundled static binaries (Electron / cross-platform zero-config)
  let bundledFfmpeg: string | null = null;
  let bundledFfprobe: string | null = null;
  const ffmpegMod = tryLoadStaticModule<string | null>('ffmpeg-static');
  if (typeof ffmpegMod === 'string') {
    const candidate = fixAsarUnpacked(ffmpegMod);
    if (isExecutableFile(candidate)) bundledFfmpeg = candidate;
  }
  const ffprobeMod = tryLoadStaticModule<{ path?: string } | null>('ffprobe-static');
  if (ffprobeMod?.path) {
    const candidate = fixAsarUnpacked(ffprobeMod.path);
    if (isExecutableFile(candidate)) bundledFfprobe = candidate;
  }

  if (bundledFfmpeg && bundledFfprobe) {
    return {
      ffmpeg: bundledFfmpeg,
      ffprobe: bundledFfprobe,
      source: 'bundled',
    };
  }

  // 4. Fallback to system PATH
  return {
    ffmpeg: bundledFfmpeg || custom?.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobe: bundledFfprobe || custom?.ffprobePath || process.env.FFPROBE_PATH || 'ffprobe',
    source: 'system',
  };
}

export async function runFfmpeg(
  args: string[],
  custom?: { ffmpegPath?: string; ffprobePath?: string },
): Promise<{ stdout: string; stderr: string }> {
  const bins = resolveFfmpegBinaries(custom);
  return execFileAsync(bins.ffmpeg, args, {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
}

export async function runFfprobe(
  args: string[],
  custom?: { ffmpegPath?: string; ffprobePath?: string },
): Promise<{ stdout: string; stderr: string }> {
  const bins = resolveFfmpegBinaries(custom);
  return execFileAsync(bins.ffprobe, args, {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

interface CachedHealthResult {
  key: string;
  expiresAt: number;
  value: {
    ok: boolean;
    source: FfmpegBinaries['source'];
    ffmpegPath: string;
    ffprobePath: string;
    ffmpegVersion?: string;
    error?: string;
  };
}

let cachedHealth: CachedHealthResult | null = null;

export async function checkFfmpegHealth(custom?: {
  ffmpegPath?: string;
  ffprobePath?: string;
}): Promise<{
  ok: boolean;
  source: FfmpegBinaries['source'];
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion?: string;
  error?: string;
}> {
  const bins = resolveFfmpegBinaries(custom);
  const cacheKey = `${bins.source}|${bins.ffmpeg}|${bins.ffprobe}`;
  if (cachedHealth && cachedHealth.key === cacheKey && Date.now() < cachedHealth.expiresAt) {
    return cachedHealth.value;
  }

  try {
    const [{ stdout }] = await Promise.all([
      execFileAsync(bins.ffmpeg, ['-version'], { windowsHide: true }),
      execFileAsync(bins.ffprobe, ['-version'], { windowsHide: true }),
    ]);
    const firstLine = stdout.split(/\r?\n/)[0]?.trim() || 'ffmpeg available';
    const value = {
      ok: true,
      source: bins.source,
      ffmpegPath: bins.ffmpeg,
      ffprobePath: bins.ffprobe,
      ffmpegVersion: firstLine,
    };
    cachedHealth = { key: cacheKey, expiresAt: Date.now() + 60_000, value };
    return value;
  } catch (err) {
    return {
      ok: false,
      source: bins.source,
      ffmpegPath: bins.ffmpeg,
      ffprobePath: bins.ffprobe,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
