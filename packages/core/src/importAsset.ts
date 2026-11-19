import fs from 'node:fs';
import path from 'node:path';
import {
  AssetKind,
  ImportAssetCategory,
  ImportAssetOptions,
  ImportAssetResult,
} from './types.js';
import { ProjectPaths, ensureProjectDirs, resolveSafeProjectFile, toPosixPath } from './paths.js';
import { inspectProjectAssets } from './inspectAssets.js';

const MAX_IMPORT_BYTES = 250 * 1024 * 1024; // 250 MB safety cap

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw.trim()).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-');
  const collapsed = base.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (!collapsed || collapsed === '.' || collapsed === '..') {
    throw new Error('Invalid asset filename.');
  }
  return collapsed;
}

function resolveCategory(
  category: ImportAssetCategory | undefined,
  filename: string,
): Exclude<ImportAssetCategory, 'auto'> {
  if (category && category !== 'auto') {
    return category;
  }
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.json') return 'lottie';
  return 'media';
}

function classifyAssetKind(relativePath: string): AssetKind {
  const ext = path.extname(relativePath).toLowerCase();
  const normalized = relativePath.toLowerCase();
  if (normalized.startsWith('assets/logos/')) return 'logo';
  if (normalized.startsWith('assets/lottie/') || ext === '.json') return 'lottie';
  if (['.mp4', '.mov', '.webm', '.mkv', '.avi'].includes(ext)) return 'video';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) return 'image';
  if (['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'].includes(ext)) return 'audio';
  return 'other';
}

function targetDirForCategory(
  paths: ProjectPaths,
  category: Exclude<ImportAssetCategory, 'auto'>,
): string {
  switch (category) {
    case 'logos':
      return paths.logosDir;
    case 'lottie':
      return paths.lottieDir;
    case 'sfx':
      return paths.sfxDir;
    case 'media':
    default:
      return paths.assetsDir;
  }
}

export async function importProjectAsset(
  paths: ProjectPaths,
  options: ImportAssetOptions,
  ffmpegConfig?: { ffmpegPath?: string; ffprobePath?: string },
): Promise<ImportAssetResult> {
  ensureProjectDirs(paths);

  const safeName = sanitizeFilename(options.filename);
  const resolvedCategory = resolveCategory(options.category, safeName);
  const targetDir = targetDirForCategory(paths, resolvedCategory);
  fs.mkdirSync(targetDir, { recursive: true });

  const relFromRoot = toPosixPath(path.relative(paths.root, path.join(targetDir, safeName)));
  const fullPath = resolveSafeProjectFile(paths.root, relFromRoot);

  if (fs.existsSync(fullPath) && options.overwrite === false) {
    throw new Error(
      `Asset "${relFromRoot}" already exists and overwrite=false. Pass overwrite=true or choose a new filename.`,
    );
  }

  let dataBuffer: Buffer;

  switch (options.sourceType) {
    case 'localPath': {
      if (!options.localPath?.trim()) {
        throw new Error('localPath is required when sourceType="localPath".');
      }
      const srcPath = path.resolve(options.localPath.trim());
      if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) {
        throw new Error(`Source file not found: ${srcPath}`);
      }
      const stat = fs.statSync(srcPath);
      if (stat.size > MAX_IMPORT_BYTES) {
        throw new Error(`Source file exceeds ${MAX_IMPORT_BYTES / (1024 * 1024)} MB limit.`);
      }
      fs.copyFileSync(srcPath, fullPath);
      dataBuffer = Buffer.alloc(0);
      break;
    }

    case 'url': {
      if (!options.url?.trim()) {
        throw new Error('url is required when sourceType="url".');
      }
      const parsedUrl = new URL(options.url.trim());
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error(`Unsupported URL protocol "${parsedUrl.protocol}". Only http/https are allowed.`);
      }
      const res = await fetch(parsedUrl.toString(), {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch URL (${res.status} ${res.statusText}): ${parsedUrl.toString()}`);
      }
      const contentLen = Number(res.headers.get('content-length') || 0);
      if (contentLen > MAX_IMPORT_BYTES) {
        throw new Error(`Remote file exceeds ${MAX_IMPORT_BYTES / (1024 * 1024)} MB limit.`);
      }
      const arr = await res.arrayBuffer();
      if (arr.byteLength > MAX_IMPORT_BYTES) {
        throw new Error(`Remote file exceeds ${MAX_IMPORT_BYTES / (1024 * 1024)} MB limit.`);
      }
      dataBuffer = Buffer.from(arr);
      fs.writeFileSync(fullPath, dataBuffer);
      break;
    }

    case 'base64': {
      if (!options.base64?.trim()) {
        throw new Error('base64 is required when sourceType="base64".');
      }
      const stripped = options.base64.trim().replace(/^data:[^;]+;base64,/i, '');
      dataBuffer = Buffer.from(stripped, 'base64');
      if (dataBuffer.byteLength === 0) {
        throw new Error('Decoded base64 content is empty.');
      }
      if (dataBuffer.byteLength > MAX_IMPORT_BYTES) {
        throw new Error(`Base64 payload exceeds ${MAX_IMPORT_BYTES / (1024 * 1024)} MB limit.`);
      }
      fs.writeFileSync(fullPath, dataBuffer);
      break;
    }

    case 'text': {
      if (typeof options.content !== 'string' || options.content.length === 0) {
        throw new Error('content is required when sourceType="text".');
      }
      dataBuffer = Buffer.from(options.content, 'utf8');
      if (dataBuffer.byteLength > MAX_IMPORT_BYTES) {
        throw new Error(`Text content exceeds ${MAX_IMPORT_BYTES / (1024 * 1024)} MB limit.`);
      }
      // If JSON (e.g. Lottie), validate syntax before writing
      if (path.extname(safeName).toLowerCase() === '.json') {
        try {
          JSON.parse(options.content);
        } catch (err) {
          throw new Error(
            `Invalid JSON content for "${safeName}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      fs.writeFileSync(fullPath, dataBuffer);
      break;
    }

    default:
      throw new Error(`Unsupported sourceType: ${String(options.sourceType)}`);
  }

  const finalStat = fs.statSync(fullPath);
  const autoInspect = options.autoInspect !== false;
  let manifest;
  let assetItem;

  if (autoInspect) {
    manifest = await inspectProjectAssets(
      paths,
      { thumbsPerVideo: options.thumbsPerVideo ?? 6 },
      ffmpegConfig,
    );
    assetItem = manifest.assets.find((a) => a.relativePath === relFromRoot);
  }

  return {
    relativePath: relFromRoot,
    fullPath,
    sizeBytes: finalStat.size,
    kind: assetItem?.kind ?? classifyAssetKind(relFromRoot),
    category: resolvedCategory,
    assetItem,
    manifest,
  };
}
