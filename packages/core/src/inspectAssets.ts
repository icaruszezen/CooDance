import fs from 'node:fs';
import path from 'node:path';
import {
  AssetKind,
  AssetManifestItem,
  AssetThumbInfo,
  AssetsManifest,
} from './types.js';
import { ProjectPaths, ensureProjectDirs, toPosixPath } from './paths.js';
import { runFfmpeg, runFfprobe } from './ffmpeg.js';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac']);

function classifyAsset(relativePath: string): AssetKind {
  const lower = relativePath.toLowerCase();
  const ext = path.extname(lower);
  if (lower.startsWith('assets/logos/') && IMAGE_EXTS.has(ext)) return 'logo';
  if (lower.startsWith('assets/lottie/') && ext === '.json') return 'lottie';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (ext === '.json') return 'lottie';
  return 'other';
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results.sort();
}

function parseFrameRate(raw?: string): number | undefined {
  if (!raw || raw === '0/0') return undefined;
  const [numStr, denStr] = raw.split('/');
  const num = Number(numStr);
  const den = Number(denStr || '1');
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
  return Number((num / den).toFixed(2));
}

export interface InspectOptions {
  thumbsPerVideo?: number;
  thumbWidth?: number;
}

export async function inspectProjectAssets(
  paths: ProjectPaths,
  options: InspectOptions = {},
  ffmpegCustom?: { ffmpegPath?: string; ffprobePath?: string },
  onProgress?: (progress: number, message: string) => void,
): Promise<AssetsManifest> {
  ensureProjectDirs(paths);

  const thumbsPerVideo = Math.max(2, Math.min(16, options.thumbsPerVideo ?? 6));
  const thumbWidth = options.thumbWidth ?? 480;
  const files = walkFiles(paths.assetsDir);
  const items: AssetManifestItem[] = [];

  onProgress?.(0.05, `正在扫描素材目录 (${files.length} 个文件)...`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const stat = fs.statSync(file);
    const relativePath = toPosixPath(path.relative(paths.root, file));
    const kind = classifyAsset(relativePath);
    const id = relativePath.replace(/[^a-zA-Z0-9_-]/g, '_');

    const item: AssetManifestItem = {
      id,
      name: path.basename(file),
      relativePath,
      kind,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };

    const pct = 0.08 + (i / Math.max(1, files.length)) * 0.85;
    onProgress?.(pct, `探测素材: ${relativePath}`);

    if (kind === 'video' || kind === 'audio' || (kind === 'image' && !file.endsWith('.svg'))) {
      try {
        const { stdout } = await runFfprobe(
          [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_format',
            '-show_streams',
            file,
          ],
          ffmpegCustom,
        );
        const probe = JSON.parse(stdout) as {
          format?: { duration?: string };
          streams?: Array<{
            codec_type?: string;
            codec_name?: string;
            width?: number;
            height?: number;
            avg_frame_rate?: string;
            r_frame_rate?: string;
            duration?: string;
          }>;
        };

        const videoStream = probe.streams?.find((s) => s.codec_type === 'video');
        const audioStream = probe.streams?.find((s) => s.codec_type === 'audio');

        if (videoStream) {
          item.width = videoStream.width;
          item.height = videoStream.height;
          item.codec = videoStream.codec_name;
          item.fps = parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate);
        }
        if (audioStream) {
          item.audioCodec = audioStream.codec_name;
        }
        const dur = Number(probe.format?.duration || videoStream?.duration || audioStream?.duration);
        if (Number.isFinite(dur) && dur > 0) {
          item.durationSec = Number(dur.toFixed(3));
        }
      } catch {
        // Keep basic file metadata if ffprobe fails on uncommon format
      }
    }

    // Extract uniform video keyframe thumbnails for fast storyboard timing & zoom box selection
    if (kind === 'video' && item.durationSec && item.durationSec > 0.1) {
      const thumbSubDir = path.join(paths.thumbsDir, id);
      fs.mkdirSync(thumbSubDir, { recursive: true });
      const thumbs: AssetThumbInfo[] = [];

      for (let t = 0; t < thumbsPerVideo; t++) {
        const ratio = thumbsPerVideo === 1 ? 0 : t / (thumbsPerVideo - 1);
        const timeSec = Number(
          Math.min(Math.max(0, item.durationSec - 0.08), ratio * item.durationSec).toFixed(2),
        );
        const outName = `thumb_${String(t).padStart(2, '0')}_${Math.round(timeSec * 1000)}ms.jpg`;
        const outPath = path.join(thumbSubDir, outName);
        try {
          await runFfmpeg(
            [
              '-y',
              '-ss',
              String(timeSec),
              '-i',
              file,
              '-frames:v',
              '1',
              '-vf',
              `scale=${thumbWidth}:-1`,
              '-q:v',
              '3',
              outPath,
            ],
            ffmpegCustom,
          );
          if (fs.existsSync(outPath)) {
            thumbs.push({
              timeSec,
              relativePath: toPosixPath(path.relative(paths.root, outPath)),
            });
          }
        } catch {
          // Skip individual frame extraction errors
        }
      }
      item.thumbs = thumbs;
    }

    items.push(item);
  }

  const manifest: AssetsManifest = {
    version: '1.0.0',
    scannedAt: new Date().toISOString(),
    projectSlug: paths.slug,
    assets: items,
  };

  fs.writeFileSync(paths.assetsManifestFile, JSON.stringify(manifest, null, 2), 'utf8');
  onProgress?.(1, `素材扫描完成：共 ${items.length} 个资源`);
  return manifest;
}
