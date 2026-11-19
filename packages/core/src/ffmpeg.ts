import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

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
  try {
    const mod = require('ffmpeg-static') as string | null;
    if (typeof mod === 'string') {
      const candidate = fixAsarUnpacked(mod);
      if (isExecutableFile(candidate)) bundledFfmpeg = candidate;
    }
  } catch {
    // ignore if optional
  }
  try {
    const mod = require('ffprobe-static') as { path?: string } | null;
    if (mod?.path) {
      const candidate = fixAsarUnpacked(mod.path);
      if (isExecutableFile(candidate)) bundledFfprobe = candidate;
    }
  } catch {
    // ignore if optional
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
  try {
    const { stdout } = await execFileAsync(bins.ffmpeg, ['-version'], { windowsHide: true });
    await execFileAsync(bins.ffprobe, ['-version'], { windowsHide: true });
    const firstLine = stdout.split(/\r?\n/)[0]?.trim() || 'ffmpeg available';
    return {
      ok: true,
      source: bins.source,
      ffmpegPath: bins.ffmpeg,
      ffprobePath: bins.ffprobe,
      ffmpegVersion: firstLine,
    };
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
