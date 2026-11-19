import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ProjectPaths {
  root: string;
  slug: string;
  scriptFile: string;
  editPlanFile: string;
  snapshotsDoc: string;
  assetsDir: string;
  logosDir: string;
  lottieDir: string;
  sfxDir: string;
  cacheDir: string;
  ttsCacheDir: string;
  buildDir: string;
  thumbsDir: string;
  voiceoverFile: string;
  audioTimelineFile: string;
  subtitlesFile: string;
  assetsManifestFile: string;
  outDir: string;
}

export function sanitizeSlug(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!cleaned) {
    throw new Error('Invalid project slug: must contain alphanumeric or Chinese characters.');
  }
  if (cleaned.includes('..') || cleaned.includes('/') || cleaned.includes('\\')) {
    throw new Error('Invalid project slug: path traversal is not allowed.');
  }
  return cleaned;
}

export function getDefaultWorkspaceDir(): string {
  if (process.env.COODANCE_WORKSPACE) {
    return path.resolve(process.env.COODANCE_WORKSPACE);
  }
  return path.join(os.homedir(), 'CooDanceProjects');
}

export function getConfigDir(): string {
  if (process.env.COODANCE_CONFIG_DIR) {
    return path.resolve(process.env.COODANCE_CONFIG_DIR);
  }
  return path.join(os.homedir(), '.coodance');
}

export function resolveProjectPaths(workspaceDir: string, slug: string): ProjectPaths {
  const safeSlug = sanitizeSlug(slug);
  const root = path.resolve(workspaceDir, safeSlug);
  const normalizedWorkspace = path.resolve(workspaceDir);
  if (!root.startsWith(normalizedWorkspace + path.sep) && root !== normalizedWorkspace) {
    throw new Error('Resolved project directory escapes workspace.');
  }
  const assetsDir = path.join(root, 'assets');
  const cacheDir = path.join(root, 'cache');
  const buildDir = path.join(root, 'build');
  const outDir = path.join(root, 'out');
  return {
    root,
    slug: safeSlug,
    scriptFile: path.join(root, 'script.txt'),
    editPlanFile: path.join(root, 'edit_plan.json'),
    snapshotsDoc: path.join(root, 'SNAPSHOTS.md'),
    assetsDir,
    logosDir: path.join(assetsDir, 'logos'),
    lottieDir: path.join(assetsDir, 'lottie'),
    sfxDir: path.join(assetsDir, 'sfx'),
    cacheDir,
    ttsCacheDir: path.join(cacheDir, 'tts'),
    buildDir,
    thumbsDir: path.join(buildDir, 'thumbs'),
    voiceoverFile: path.join(buildDir, 'voiceover.mp3'),
    audioTimelineFile: path.join(buildDir, 'audio_timeline.json'),
    subtitlesFile: path.join(buildDir, 'subtitles.srt'),
    assetsManifestFile: path.join(buildDir, 'assets_manifest.json'),
    outDir,
  };
}

export function ensureProjectDirs(paths: ProjectPaths): void {
  const dirs = [
    paths.root,
    paths.assetsDir,
    paths.logosDir,
    paths.lottieDir,
    paths.sfxDir,
    paths.cacheDir,
    paths.ttsCacheDir,
    paths.buildDir,
    paths.thumbsDir,
    paths.outDir,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function resolveSafeProjectFile(projectRoot: string, relativeFilePath: string): string {
  const normalizedRel = relativeFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const full = path.resolve(projectRoot, normalizedRel);
  const base = path.resolve(projectRoot);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`Unsafe file path outside project root: ${relativeFilePath}`);
  }
  return full;
}

export function toPosixPath(p: string): string {
  return p.split(path.sep).join('/');
}
