import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppUpdateSettings,
  UpdateAssetInfo,
  UpdateCheckResult,
  UpdateInstallKind,
  UpdateManifest,
  UpdateMirrorNode,
  UpdateMirrorTestResult,
  UpdateRuntimeTarget,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type UpdaterFetchFn = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const DEFAULT_GITHUB_REPO = 'icaruszezen/CooDance';

export const BUILTIN_UPDATE_MIRRORS: UpdateMirrorNode[] = [
  {
    id: 'gh-proxy-org',
    label: '国内加速 · gh-proxy.org',
    region: 'cn',
    prefix: 'https://gh-proxy.org/',
  },
  {
    id: 'hk-gh-proxy',
    label: '香港加速 · hk.gh-proxy.org',
    region: 'hk',
    prefix: 'https://hk.gh-proxy.org/',
  },
  {
    id: 'ghfast-top',
    label: '国内加速 · ghfast.top',
    region: 'cn',
    prefix: 'https://ghfast.top/',
  },
  {
    id: 'ghproxy-net',
    label: '国内加速 · ghproxy.net',
    region: 'cn',
    prefix: 'https://ghproxy.net/',
  },
  {
    id: 'github-direct',
    label: 'GitHub 官方直连',
    region: 'direct',
    prefix: '',
  },
];

export function getUpdateRepo(): string {
  return (process.env.COODANCE_UPDATE_REPO || DEFAULT_GITHUB_REPO).trim();
}

let cachedAppVersion: string | null = null;

export function getAppVersion(): string {
  if (cachedAppVersion) return cachedAppVersion;
  const candidates = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../../package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ];
  for (const cand of candidates) {
    try {
      if (!fs.existsSync(cand)) continue;
      const parsed = JSON.parse(fs.readFileSync(cand, 'utf8')) as { version?: string };
      if (parsed.version && typeof parsed.version === 'string') {
        cachedAppVersion = normalizeVersion(parsed.version);
        return cachedAppVersion;
      }
    } catch {
      // try next candidate
    }
  }
  cachedAppVersion = '1.3.1';
  return cachedAppVersion;
}

export function normalizeVersion(raw: string): string {
  return String(raw || '').trim().replace(/^v/i, '');
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}

export function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = normalizeVersion(raw).split('+')[0];
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(cleaned);
  if (!match) return null;
  const prerelease = match[4]
    ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : [];
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

export function isPrereleaseVersion(raw: string): boolean {
  const parsed = parseSemver(raw);
  if (parsed) return parsed.prerelease.length > 0;
  return /-(alpha|beta|rc|pre|next|canary|dev)/i.test(raw);
}

/**
 * SemVer 2.0 comparison: returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return normalizeVersion(a).localeCompare(normalizeVersion(b), undefined, { numeric: true });
  }
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  const aPre = pa.prerelease;
  const bPre = pb.prerelease;
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1; // stable > prerelease
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const x = aPre[i];
    const y = bPre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x === 'number') return -1; // numeric identifiers have lower precedence
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function normalizeMirrorPrefix(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return '';
  if (trimmed.includes('{url}') || trimmed.includes('{encoded_url}')) {
    return trimmed;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function buildCustomMirrorNode(customMirrorPrefix: string): UpdateMirrorNode | null {
  const normalized = normalizeMirrorPrefix(customMirrorPrefix);
  if (!normalized) return null;
  let hostLabel = normalized;
  try {
    hostLabel = new URL(normalized.replace(/\{(?:encoded_)?url\}/g, '')).host || normalized;
  } catch {
    hostLabel = normalized;
  }
  return {
    id: 'custom',
    label: `自定义加速 · ${hostLabel}`,
    region: 'custom',
    prefix: normalized,
  };
}

export function resolveMirrorCandidates(
  updateSettings: Pick<AppUpdateSettings, 'mirrorMode' | 'customMirrorPrefix'>,
  preferMirrorId?: string,
): UpdateMirrorNode[] {
  const cnMirrors = BUILTIN_UPDATE_MIRRORS.filter((m) => m.region === 'cn' || m.region === 'hk');
  const directNode = BUILTIN_UPDATE_MIRRORS.find((m) => m.region === 'direct')!;
  const customNode = buildCustomMirrorNode(updateSettings.customMirrorPrefix);

  let ordered: UpdateMirrorNode[];
  switch (updateSettings.mirrorMode) {
    case 'direct':
      ordered = [directNode];
      break;
    case 'custom':
      ordered = customNode ? [customNode] : [...cnMirrors, directNode];
      break;
    case 'cn-only':
      ordered = customNode ? [customNode, ...cnMirrors] : [...cnMirrors];
      break;
    case 'auto':
    default:
      ordered = customNode ? [customNode, ...cnMirrors, directNode] : [...cnMirrors, directNode];
      break;
  }

  if (preferMirrorId) {
    const idx = ordered.findIndex((m) => m.id === preferMirrorId);
    if (idx > 0) {
      const [preferred] = ordered.splice(idx, 1);
      ordered.unshift(preferred);
    }
  }

  return ordered;
}

export function buildMirroredUrl(rawGithubUrl: string, mirror: UpdateMirrorNode): string {
  if (!mirror.prefix || mirror.region === 'direct') {
    return rawGithubUrl;
  }
  if (mirror.prefix.includes('{encoded_url}')) {
    return mirror.prefix.replace(/\{encoded_url\}/g, encodeURIComponent(rawGithubUrl));
  }
  if (mirror.prefix.includes('{url}')) {
    const queryIdx = mirror.prefix.indexOf('?');
    const tokenIdx = mirror.prefix.indexOf('{url}');
    const replacement =
      queryIdx !== -1 && tokenIdx > queryIdx ? encodeURIComponent(rawGithubUrl) : rawGithubUrl;
    return mirror.prefix.replace(/\{url\}/g, replacement);
  }
  const base = mirror.prefix.endsWith('/') ? mirror.prefix : `${mirror.prefix}/`;
  return `${base}${rawGithubUrl}`;
}

export function inferAssetMetadata(
  name: string,
): Pick<UpdateAssetInfo, 'platform' | 'arch' | 'installKind'> {
  const lower = name.toLowerCase();
  if (lower.endsWith('-setup.exe') || (lower.includes('win') && lower.endsWith('.exe'))) {
    return {
      platform: 'win32',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'nsis',
    };
  }
  if (lower.includes('win') && lower.endsWith('.zip')) {
    return {
      platform: 'win32',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'portable-zip',
    };
  }
  if (lower.endsWith('.dmg')) {
    return {
      platform: 'darwin',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'dmg',
    };
  }
  if (lower.endsWith('.appimage')) {
    return {
      platform: 'linux',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'appimage',
    };
  }
  return {};
}

export function parseSha256Sums(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([a-fA-F0-9]{64})\s+[*]?(.+)$/.exec(line);
    if (!match) continue;
    const hash = match[1].toLowerCase();
    const filename = path.basename(match[2].trim());
    if (filename) {
      map.set(filename, hash);
    }
  }
  return map;
}

export function matchAssetForTarget(
  assets: UpdateAssetInfo[],
  target: UpdateRuntimeTarget,
): UpdateAssetInfo | null {
  if (!target.isDesktop || target.installKind === 'web') {
    return null;
  }

  const enriched = assets.map((a) => ({
    ...inferAssetMetadata(a.name),
    ...a,
  }));

  // Exact match on platform + arch + installKind
  const exact = enriched.find(
    (a) =>
      a.platform === target.platform &&
      a.arch === target.arch &&
      a.installKind === target.installKind,
  );
  if (exact) return exact;

  // Fallback for Windows: if portable-zip requested but only setup.exe exists (or vice versa)
  if (target.platform === 'win32') {
    const byArch = enriched.find((a) => a.platform === 'win32' && a.arch === target.arch);
    if (byArch) return byArch;
    const anyWin = enriched.find((a) => a.platform === 'win32');
    if (anyWin) return anyWin;
  }

  // macOS: match exact arch strictly (arm64 vs x64)
  if (target.platform === 'darwin') {
    const macMatch = enriched.find(
      (a) => a.platform === 'darwin' && a.arch === target.arch && a.installKind === 'dmg',
    );
    if (macMatch) return macMatch;
  }

  // Linux AppImage
  if (target.platform === 'linux') {
    const linuxMatch = enriched.find((a) => a.platform === 'linux');
    if (linuxMatch) return linuxMatch;
  }

  return null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function htmlToReadableNotes(rawHtml: string): string {
  const decoded = decodeHtmlEntities(rawHtml);
  return decoded
    .replace(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gis, '\n### $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface AtomReleaseEntry {
  tag: string;
  version: string;
  title: string;
  updatedAt: string;
  releaseUrl: string;
  prerelease: boolean;
  releaseNotes: string;
}

export function parseGithubReleasesAtom(xml: string, repo = getUpdateRepo()): AtomReleaseEntry[] {
  const entries: AtomReleaseEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const linkMatch = /<link[^>]+href="([^"]+)"/i.exec(block);
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const updatedMatch = /<updated[^>]*>([\s\S]*?)<\/updated>/i.exec(block);
    const contentMatch = /<content[^>]*>([\s\S]*?)<\/content>/i.exec(block);

    const href = linkMatch?.[1] ? decodeHtmlEntities(linkMatch[1]) : '';
    const tagMatch = /\/releases\/tag\/([^/?#]+)/i.exec(href);
    const tag = tagMatch?.[1] ? decodeURIComponent(tagMatch[1]) : '';
    if (!tag) continue;

    const version = normalizeVersion(tag);
    if (!parseSemver(version)) continue;

    const releaseUrl = href.startsWith('http')
      ? href
      : `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;

    entries.push({
      tag,
      version,
      title: titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]).trim() : `CooDance Studio ${tag}`,
      updatedAt: updatedMatch?.[1]?.trim() || new Date().toISOString(),
      releaseUrl,
      prerelease: isPrereleaseVersion(version),
      releaseNotes: contentMatch?.[1] ? htmlToReadableNotes(contentMatch[1]) : '',
    });
  }
  return entries;
}

async function fetchWithTimeout(
  fetchFn: UpdaterFetchFn,
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort(new Error(`请求超时 (${timeoutMs}ms)`));
  }, timeoutMs);

  try {
    const headers = new Headers(init.headers);
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', `CooDance-Studio/${getAppVersion()}`);
    }
    return await fetchFn(url, {
      ...init,
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

function isValidManifest(data: unknown): data is UpdateManifest {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Partial<UpdateManifest>;
  return (
    typeof obj.version === 'string' &&
    typeof obj.tag === 'string' &&
    Array.isArray(obj.assets)
  );
}

function normalizeManifestAssets(manifest: UpdateManifest, repo: string): UpdateAssetInfo[] {
  return manifest.assets
    .filter((a) => a && typeof a.name === 'string' && a.name.trim().length > 0)
    .map((a) => {
      const inferred = inferAssetMetadata(a.name);
      return {
        name: a.name,
        size: typeof a.size === 'number' && Number.isFinite(a.size) ? a.size : 0,
        sha256: typeof a.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(a.sha256.trim())
          ? a.sha256.trim().toLowerCase()
          : undefined,
        downloadUrl:
          a.downloadUrl ||
          `https://github.com/${repo}/releases/download/${encodeURIComponent(manifest.tag)}/${encodeURIComponent(a.name)}`,
        platform: a.platform || inferred.platform,
        arch: a.arch || inferred.arch,
        installKind: a.installKind || inferred.installKind,
      };
    });
}

function buildCheckResult(params: {
  manifest: UpdateManifest;
  repo: string;
  target: UpdateRuntimeTarget;
  skippedVersion: string;
  sourceNode: UpdateMirrorNode;
  manifestSource: UpdateCheckResult['manifestSource'];
}): UpdateCheckResult {
  const allAssets = normalizeManifestAssets(params.manifest, params.repo);
  const currentVersion = normalizeVersion(params.target.currentVersion);
  const latestVersion = normalizeVersion(params.manifest.version || params.manifest.tag);
  const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
  const isSkipped = Boolean(
    params.skippedVersion &&
      normalizeVersion(params.skippedVersion) === latestVersion,
  );
  const matchedAsset = matchAssetForTarget(allAssets, params.target);

  return {
    currentVersion,
    latestVersion,
    latestTag: params.manifest.tag || `v${latestVersion}`,
    releaseName: params.manifest.name || `CooDance Studio v${latestVersion}`,
    updateAvailable,
    isPrerelease: Boolean(params.manifest.prerelease || isPrereleaseVersion(latestVersion)),
    isSkipped,
    publishedAt: params.manifest.publishedAt || new Date().toISOString(),
    releaseUrl:
      params.manifest.releaseUrl ||
      `https://github.com/${params.repo}/releases/tag/${encodeURIComponent(params.manifest.tag || `v${latestVersion}`)}`,
    releaseNotes: params.manifest.releaseNotes || '',
    sourceNode: {
      id: params.sourceNode.id,
      label: params.sourceNode.label,
      region: params.sourceNode.region,
    },
    manifestSource: params.manifestSource,
    matchedAsset,
    allAssets,
    checkedAt: new Date().toISOString(),
    target: params.target,
  };
}

interface GithubApiRelease {
  tag_name: string;
  name?: string;
  body?: string;
  prerelease?: boolean;
  draft?: boolean;
  published_at?: string;
  html_url?: string;
  assets?: Array<{
    name: string;
    size: number;
    browser_download_url: string;
    digest?: string;
  }>;
}

async function fetchSha256SumsViaMirrors(
  repo: string,
  tag: string,
  mirrors: UpdateMirrorNode[],
  fetchFn: UpdaterFetchFn,
): Promise<{ sums: Map<string, string>; mirror: UpdateMirrorNode } | null> {
  const rawSumsUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/SHA256SUMS.txt`;
  for (const mirror of mirrors) {
    try {
      const url = buildMirroredUrl(rawSumsUrl, mirror);
      const res = await fetchWithTimeout(fetchFn, url, { cache: 'no-store' }, 8000);
      if (res.ok) {
        const text = await res.text();
        const sums = parseSha256Sums(text);
        if (sums.size > 0) {
          return { sums, mirror };
        }
      }
    } catch {
      // try next mirror
    }
  }
  return null;
}

async function fetchManifestForTagViaMirrors(
  repo: string,
  tag: string,
  mirrors: UpdateMirrorNode[],
  fetchFn: UpdaterFetchFn,
): Promise<{ manifest: UpdateManifest; mirror: UpdateMirrorNode } | { notFoundMirror: UpdateMirrorNode } | null> {
  const rawUrl =
    tag === 'latest'
      ? `https://github.com/${repo}/releases/latest/download/update-manifest.json`
      : `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/update-manifest.json`;

  let notFoundMirror: UpdateMirrorNode | null = null;
  for (const mirror of mirrors) {
    try {
      const url = buildMirroredUrl(rawUrl, mirror);
      const res = await fetchWithTimeout(
        fetchFn,
        url,
        { headers: { Accept: 'application/json' }, cache: 'no-store' },
        8000,
      );
      if (res.ok) {
        const parsed = (await res.json()) as unknown;
        if (isValidManifest(parsed)) {
          return { manifest: parsed, mirror };
        }
      } else if (res.status === 404) {
        // Mirror itself is reachable, this release just doesn't ship update-manifest.json yet
        if (!notFoundMirror) notFoundMirror = mirror;
        break;
      }
    } catch {
      // try next mirror
    }
  }
  return notFoundMirror ? { notFoundMirror } : null;
}

async function fetchGithubApiRelease(
  repo: string,
  includePrerelease: boolean,
  fetchFn: UpdaterFetchFn,
): Promise<GithubApiRelease | null> {
  const apiUrl = includePrerelease
    ? `https://api.github.com/repos/${repo}/releases?per_page=15`
    : `https://api.github.com/repos/${repo}/releases/latest`;
  try {
    const res = await fetchWithTimeout(
      fetchFn,
      apiUrl,
      { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' },
      8000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as GithubApiRelease | GithubApiRelease[];
    if (Array.isArray(data)) {
      const candidates = data
        .filter((r) => r && !r.draft && r.tag_name)
        .filter((r) => includePrerelease || !r.prerelease);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => compareSemver(b.tag_name, a.tag_name));
      return candidates[0];
    }
    if (data && !data.draft && data.tag_name) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export interface CheckForUpdatesOptions {
  settings: AppUpdateSettings;
  target: UpdateRuntimeTarget;
  repo?: string;
  fetchFn?: UpdaterFetchFn;
  manifestUrlOverride?: string;
}

export async function checkForUpdates(
  options: CheckForUpdatesOptions,
): Promise<UpdateCheckResult> {
  const fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  const repo = (options.repo || getUpdateRepo()).trim();
  const manifestOverride = (
    options.manifestUrlOverride ||
    process.env.COODANCE_UPDATE_MANIFEST_URL ||
    ''
  ).trim();

  // 0. Explicit local/test manifest URL override
  if (manifestOverride) {
    const res = await fetchWithTimeout(
      fetchFn,
      manifestOverride,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
      8000,
    );
    if (!res.ok) {
      throw new Error(`无法获取自定义更新清单 (${res.status}): ${manifestOverride}`);
    }
    const parsed = (await res.json()) as unknown;
    if (!isValidManifest(parsed)) {
      throw new Error('自定义更新清单 JSON 格式无效');
    }
    return buildCheckResult({
      manifest: parsed,
      repo: parsed.repo || repo,
      target: options.target,
      skippedVersion: options.settings.skippedVersion,
      sourceNode: {
        id: 'custom-manifest',
        label: '自定义清单源',
        region: 'custom',
        prefix: '',
      },
      manifestSource: 'custom-manifest',
    });
  }

  const mirrors = resolveMirrorCandidates(options.settings);
  const errors: string[] = [];

  // 1. Stable channel fast path: fetch releases/latest/download/update-manifest.json via China mirrors
  let reachableMirrorFrom404: UpdateMirrorNode | null = null;
  if (!options.settings.includePrerelease) {
    const manifestLookup = await fetchManifestForTagViaMirrors(repo, 'latest', mirrors, fetchFn);
    if (manifestLookup && 'manifest' in manifestLookup) {
      return buildCheckResult({
        manifest: manifestLookup.manifest,
        repo,
        target: options.target,
        skippedVersion: options.settings.skippedVersion,
        sourceNode: manifestLookup.mirror,
        manifestSource: 'update-manifest',
      });
    }
    if (manifestLookup && 'notFoundMirror' in manifestLookup) {
      reachableMirrorFrom404 = manifestLookup.notFoundMirror;
    }
  }

  // 2. Mirror-accelerated Atom feed discovery (zero GitHub API rate limit; supports BOTH Stable & Pre-release!)
  const atomMirrors = reachableMirrorFrom404
    ? resolveMirrorCandidates(options.settings, reachableMirrorFrom404.id)
    : mirrors;
  const rawAtomUrl = `https://github.com/${repo}/releases.atom`;

  for (const mirror of atomMirrors) {
    try {
      const atomUrl = buildMirroredUrl(rawAtomUrl, mirror);
      const atomRes = await fetchWithTimeout(fetchFn, atomUrl, { cache: 'no-store' }, 8000);
      if (!atomRes.ok) {
        errors.push(`${mirror.label}: Atom HTTP ${atomRes.status}`);
        continue;
      }
      const xml = await atomRes.text();
      const entries = parseGithubReleasesAtom(xml, repo).filter(
        (entry) => options.settings.includePrerelease || !entry.prerelease,
      );
      if (entries.length === 0) {
        errors.push(`${mirror.label}: 未解析到可用版本条目`);
        continue;
      }

      entries.sort((a, b) => compareSemver(b.version, a.version));
      const best = entries[0];
      const preferredMirrors = resolveMirrorCandidates(options.settings, mirror.id);

      // 2a. Try tag-specific update-manifest.json first (covers pre-releases and future releases cleanly!)
      const tagManifest = await fetchManifestForTagViaMirrors(
        repo,
        best.tag,
        preferredMirrors,
        fetchFn,
      );
      if (tagManifest && 'manifest' in tagManifest) {
        return buildCheckResult({
          manifest: tagManifest.manifest,
          repo,
          target: options.target,
          skippedVersion: options.settings.skippedVersion,
          sourceNode: tagManifest.mirror,
          manifestSource: 'update-manifest',
        });
      }

      // 2b. Legacy release compatibility (e.g. v1.1.3): fetch SHA256SUMS.txt via mirror to get exact asset list + hashes
      const sumsResult = await fetchSha256SumsViaMirrors(repo, best.tag, preferredMirrors, fetchFn);
      const assetsFromSums: UpdateAssetInfo[] = [];
      if (sumsResult) {
        for (const [filename, sha256] of sumsResult.sums.entries()) {
          if (filename === 'SHA256SUMS.txt' || filename === 'update-manifest.json') continue;
          assetsFromSums.push({
            name: filename,
            size: 0,
            sha256,
            downloadUrl: `https://github.com/${repo}/releases/download/${encodeURIComponent(best.tag)}/${encodeURIComponent(filename)}`,
            ...inferAssetMetadata(filename),
          });
        }
      }

      // Enrich asset sizes & full markdown release notes via GitHub API if not in cn-only mode
      let releaseNotes = best.releaseNotes;
      let releaseName = best.title;
      let publishedAt = best.updatedAt;
      if (options.settings.mirrorMode !== 'cn-only' && options.settings.mirrorMode !== 'custom') {
        const apiRel = await fetchGithubApiRelease(repo, options.settings.includePrerelease, fetchFn);
        if (apiRel && normalizeVersion(apiRel.tag_name) === best.version) {
          if (apiRel.body) releaseNotes = apiRel.body;
          if (apiRel.name) releaseName = apiRel.name;
          if (apiRel.published_at) publishedAt = apiRel.published_at;
          if (apiRel.assets && apiRel.assets.length > 0) {
            const sizeByName = new Map(apiRel.assets.map((a) => [a.name, a.size]));
            const digestByName = new Map(
              apiRel.assets
                .filter((a) => a.digest?.startsWith('sha256:'))
                .map((a) => [a.name, a.digest!.slice('sha256:'.length).toLowerCase()]),
            );
            for (const asset of assetsFromSums) {
              if (!asset.size && sizeByName.has(asset.name)) {
                asset.size = sizeByName.get(asset.name)!;
              }
              if (!asset.sha256 && digestByName.has(asset.name)) {
                asset.sha256 = digestByName.get(asset.name);
              }
            }
            if (assetsFromSums.length === 0) {
              for (const apiAsset of apiRel.assets) {
                if (apiAsset.name === 'SHA256SUMS.txt' || apiAsset.name === 'update-manifest.json') {
                  continue;
                }
                assetsFromSums.push({
                  name: apiAsset.name,
                  size: apiAsset.size || 0,
                  sha256: digestByName.get(apiAsset.name),
                  downloadUrl: apiAsset.browser_download_url,
                  ...inferAssetMetadata(apiAsset.name),
                });
              }
            }
          }
        }
      }

      const fallbackManifest: UpdateManifest = {
        schemaVersion: 1,
        repo,
        version: best.version,
        tag: best.tag,
        name: releaseName,
        publishedAt,
        prerelease: best.prerelease,
        releaseUrl: best.releaseUrl,
        releaseNotes,
        assets: assetsFromSums,
      };

      return buildCheckResult({
        manifest: fallbackManifest,
        repo,
        target: options.target,
        skippedVersion: options.settings.skippedVersion,
        sourceNode: sumsResult?.mirror || mirror,
        manifestSource: 'releases-atom',
      });
    } catch (err) {
      errors.push(`${mirror.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Final fallback: GitHub REST API directly (if allowed by mirrorMode)
  if (options.settings.mirrorMode !== 'cn-only' && options.settings.mirrorMode !== 'custom') {
    const apiRel = await fetchGithubApiRelease(repo, options.settings.includePrerelease, fetchFn);
    if (apiRel) {
      const sumsResult = await fetchSha256SumsViaMirrors(repo, apiRel.tag_name, mirrors, fetchFn);
      const assets: UpdateAssetInfo[] = (apiRel.assets || [])
        .filter((a) => a.name !== 'SHA256SUMS.txt' && a.name !== 'update-manifest.json')
        .map((a) => {
          const digestSha = a.digest?.startsWith('sha256:')
            ? a.digest.slice('sha256:'.length).toLowerCase()
            : undefined;
          return {
            name: a.name,
            size: a.size || 0,
            sha256: sumsResult?.sums.get(a.name) || digestSha,
            downloadUrl: a.browser_download_url,
            ...inferAssetMetadata(a.name),
          };
        });

      const directNode = BUILTIN_UPDATE_MIRRORS.find((m) => m.region === 'direct')!;
      const apiManifest: UpdateManifest = {
        schemaVersion: 1,
        repo,
        version: normalizeVersion(apiRel.tag_name),
        tag: apiRel.tag_name,
        name: apiRel.name || `CooDance Studio ${apiRel.tag_name}`,
        publishedAt: apiRel.published_at || new Date().toISOString(),
        prerelease: Boolean(apiRel.prerelease || isPrereleaseVersion(apiRel.tag_name)),
        releaseUrl:
          apiRel.html_url ||
          `https://github.com/${repo}/releases/tag/${encodeURIComponent(apiRel.tag_name)}`,
        releaseNotes: apiRel.body || '',
        assets,
      };

      return buildCheckResult({
        manifest: apiManifest,
        repo,
        target: options.target,
        skippedVersion: options.settings.skippedVersion,
        sourceNode: directNode,
        manifestSource: 'github-api',
      });
    }
  }

  const summary = errors.length > 0 ? errors.slice(0, 3).join('；') : '所有镜像节点均不可达';
  throw new Error(`检测更新失败，请检查网络连接或在设置中调整国内加速镜像（${summary}）`);
}

export async function probeUpdateMirrors(
  updateSettings: Pick<AppUpdateSettings, 'mirrorMode' | 'customMirrorPrefix'>,
  options: { repo?: string; fetchFn?: UpdaterFetchFn; timeoutMs?: number } = {},
): Promise<UpdateMirrorTestResult[]> {
  const fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  const repo = (options.repo || getUpdateRepo()).trim();
  const timeoutMs = options.timeoutMs ?? 5500;
  const customNode = buildCustomMirrorNode(updateSettings.customMirrorPrefix);

  const nodesToTest: UpdateMirrorNode[] = [
    ...(customNode ? [customNode] : []),
    ...BUILTIN_UPDATE_MIRRORS,
  ];
  const probeRawUrl = `https://github.com/${repo}/releases.atom`;

  return Promise.all(
    nodesToTest.map(async (node): Promise<UpdateMirrorTestResult> => {
      const started = Date.now();
      const targetUrl = buildMirroredUrl(probeRawUrl, node);
      try {
        const res = await fetchWithTimeout(
          fetchFn,
          targetUrl,
          {
            method: 'GET',
            headers: { Range: 'bytes=0-128' },
            cache: 'no-store',
          },
          timeoutMs,
        );
        // Drain/cancel body to release socket immediately
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        const latencyMs = Date.now() - started;
        const ok = res.ok || res.status === 206;
        return {
          id: node.id,
          label: node.label,
          region: node.region,
          prefix: node.prefix,
          ok,
          latencyMs: ok ? latencyMs : null,
          statusCode: res.status,
          error: ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          id: node.id,
          label: node.label,
          region: node.region,
          prefix: node.prefix,
          ok: false,
          latencyMs: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
    stream.on('error', reject);
  });
}

export interface DownloadProgressInfo {
  assetName: string;
  totalBytes: number;
  downloadedBytes: number;
  percent: number;
  speedBytesPerSec: number;
  etaSec: number | null;
  activeMirrorId: string;
  activeMirrorLabel: string;
  attempt: number;
  maxAttempts: number;
  resumed: boolean;
}

export interface DownloadAndVerifyOptions {
  asset: UpdateAssetInfo;
  mirrors: UpdateMirrorNode[];
  destDir: string;
  fetchFn?: UpdaterFetchFn;
  signal?: AbortSignal;
  stallTimeoutMs?: number;
  onProgress?: (info: DownloadProgressInfo) => void;
  onVerifying?: (info: DownloadProgressInfo) => void;
}

export interface DownloadAndVerifyResult {
  filePath: string;
  sha256: string;
  sizeBytes: number;
  mirror: UpdateMirrorNode;
  fromCache: boolean;
}

interface PartialDownloadMeta {
  assetName: string;
  expectedSha256: string;
  totalBytes: number;
}

function safeUnlink(targetPath: string): void {
  try {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  } catch {
    // ignore
  }
}

export async function downloadAndVerifyUpdateAsset(
  options: DownloadAndVerifyOptions,
): Promise<DownloadAndVerifyResult> {
  const fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  const stallTimeoutMs = options.stallTimeoutMs ?? 25000;
  const expectedSha256 = (options.asset.sha256 || '').trim().toLowerCase();

  // Mandatory SHA256 integrity gate (strict security when using third-party China mirrors)
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error(
      `安全校验失败：未获取到 ${options.asset.name} 的官方 SHA256 校验和，已拒绝自动下载安装。请前往 GitHub Release 页面手动核验下载。`,
    );
  }

  if (options.mirrors.length === 0) {
    throw new Error('没有可用的下载镜像节点，请在设置中检查更新加速配置。');
  }

  fs.mkdirSync(options.destDir, { recursive: true });
  const safeName = path.basename(options.asset.name);
  const finalPath = path.join(options.destDir, safeName);
  const partPath = `${finalPath}.part`;
  const metaPath = `${finalPath}.meta.json`;

  // 1. Check if already downloaded and verified on disk
  if (fs.existsSync(finalPath)) {
    try {
      const existingSha = await computeFileSha256(finalPath);
      if (existingSha === expectedSha256) {
        const stat = fs.statSync(finalPath);
        const mirror = options.mirrors[0];
        options.onProgress?.({
          assetName: safeName,
          totalBytes: stat.size,
          downloadedBytes: stat.size,
          percent: 100,
          speedBytesPerSec: 0,
          etaSec: 0,
          activeMirrorId: mirror.id,
          activeMirrorLabel: mirror.label,
          attempt: 1,
          maxAttempts: options.mirrors.length,
          resumed: false,
        });
        return {
          filePath: finalPath,
          sha256: existingSha,
          sizeBytes: stat.size,
          mirror,
          fromCache: true,
        };
      }
      safeUnlink(finalPath);
    } catch {
      safeUnlink(finalPath);
    }
  }

  // Validate existing partial file metadata for resumable download
  let existingPartSize = 0;
  if (fs.existsSync(partPath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as PartialDownloadMeta;
      if (meta.assetName === safeName && meta.expectedSha256 === expectedSha256) {
        existingPartSize = fs.statSync(partPath).size;
      } else {
        safeUnlink(partPath);
        safeUnlink(metaPath);
      }
    } catch {
      safeUnlink(partPath);
      safeUnlink(metaPath);
    }
  } else {
    safeUnlink(partPath);
    safeUnlink(metaPath);
  }

  const attemptErrors: string[] = [];
  const maxAttempts = options.mirrors.length;

  for (let i = 0; i < maxAttempts; i++) {
    if (options.signal?.aborted) {
      throw new Error('已取消下载');
    }

    const mirror = options.mirrors[i];
    const attempt = i + 1;
    const downloadUrl = buildMirroredUrl(options.asset.downloadUrl, mirror);

    try {
      const resumeOffset = existingPartSize > 0 ? existingPartSize : 0;
      const headers: Record<string, string> = {};
      if (resumeOffset > 0) {
        headers.Range = `bytes=${resumeOffset}-`;
      }

      const attemptController = new AbortController();
      const onOuterAbort = () => attemptController.abort(options.signal?.reason);
      if (options.signal) {
        options.signal.addEventListener('abort', onOuterAbort, { once: true });
      }

      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          attemptController.abort(new Error(`节点响应停滞超过 ${Math.round(stallTimeoutMs / 1000)} 秒`));
        }, stallTimeoutMs);
      };

      try {
        resetStallTimer();
        const res = await fetchFn(downloadUrl, {
          headers: {
            'User-Agent': `CooDance-Studio/${getAppVersion()}`,
            ...headers,
          },
          redirect: 'follow',
          signal: attemptController.signal,
        });

        // Handle 416 Range Not Satisfiable (e.g. partial file already full or stale)
        if (res.status === 416 && resumeOffset > 0) {
          existingPartSize = 0;
          safeUnlink(partPath);
          safeUnlink(metaPath);
          i -= 1; // retry same mirror from byte 0
          continue;
        }

        if (!res.ok && res.status !== 206) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.body) {
          throw new Error('响应流为空');
        }

        const isResumed = res.status === 206 && resumeOffset > 0;
        let downloadedBytes = isResumed ? resumeOffset : 0;
        const contentLength = Number(res.headers.get('content-length') || '0');
        let totalBytes = options.asset.size || 0;
        if (isResumed) {
          const contentRange = res.headers.get('content-range') || '';
          const totalMatch = /\/(\d+)$/.exec(contentRange);
          if (totalMatch) {
            totalBytes = Number(totalMatch[1]);
          } else if (contentLength > 0) {
            totalBytes = resumeOffset + contentLength;
          }
        } else if (contentLength > 0) {
          totalBytes = contentLength;
        }

        fs.writeFileSync(
          metaPath,
          JSON.stringify(
            {
              assetName: safeName,
              expectedSha256,
              totalBytes,
            } satisfies PartialDownloadMeta,
            null,
            2,
          ),
          'utf8',
        );

        const writeStream = fs.createWriteStream(partPath, {
          flags: isResumed ? 'a' : 'w',
        });

        const reader = res.body.getReader();
        let lastReportAt = 0;
        let windowStartAt = Date.now();
        let windowBytes = 0;
        let smoothedSpeed = 0;

        const emitProgress = (force = false) => {
          const now = Date.now();
          if (!force && now - lastReportAt < 150) return;
          const elapsedSec = Math.max(0.05, (now - windowStartAt) / 1000);
          if (elapsedSec >= 0.4 || force) {
            const instantSpeed = windowBytes / elapsedSec;
            smoothedSpeed =
              smoothedSpeed === 0 ? instantSpeed : smoothedSpeed * 0.65 + instantSpeed * 0.35;
            if (elapsedSec >= 1.0) {
              windowStartAt = now;
              windowBytes = 0;
            }
          }
          lastReportAt = now;

          const percent =
            totalBytes > 0
              ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 1000) / 10)
              : 0;
          const remainingBytes = totalBytes > 0 ? Math.max(0, totalBytes - downloadedBytes) : 0;
          const etaSec =
            totalBytes > 0 && smoothedSpeed > 100 ? Math.ceil(remainingBytes / smoothedSpeed) : null;

          options.onProgress?.({
            assetName: safeName,
            totalBytes,
            downloadedBytes,
            percent,
            speedBytesPerSec: Math.round(smoothedSpeed),
            etaSec,
            activeMirrorId: mirror.id,
            activeMirrorLabel: mirror.label,
            attempt,
            maxAttempts,
            resumed: isResumed,
          });
        };

        emitProgress(true);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            resetStallTimer();
            if (value && value.byteLength > 0) {
              downloadedBytes += value.byteLength;
              windowBytes += value.byteLength;
              const ok = writeStream.write(Buffer.from(value));
              if (!ok) {
                await new Promise<void>((resolve, reject) => {
                  writeStream.once('drain', resolve);
                  writeStream.once('error', reject);
                });
              }
              emitProgress(false);
            }
          }
        } finally {
          await new Promise<void>((resolve, reject) => {
            writeStream.end(() => resolve());
            writeStream.once('error', reject);
          });
        }

        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = null;

        // Notify verifying phase
        const finalProgress: DownloadProgressInfo = {
          assetName: safeName,
          totalBytes: totalBytes || downloadedBytes,
          downloadedBytes,
          percent: 100,
          speedBytesPerSec: Math.round(smoothedSpeed),
          etaSec: 0,
          activeMirrorId: mirror.id,
          activeMirrorLabel: mirror.label,
          attempt,
          maxAttempts,
          resumed: isResumed,
        };
        options.onVerifying?.(finalProgress);

        // Mandatory SHA256 verification before promoting .part -> final installer
        const actualSha256 = await computeFileSha256(partPath);
        if (actualSha256 !== expectedSha256) {
          // Discard corrupted/tampered payload completely and failover to next mirror!
          existingPartSize = 0;
          safeUnlink(partPath);
          safeUnlink(metaPath);
          throw new Error(
            `SHA256 校验失败（期望 ${expectedSha256.slice(0, 12)}...，实际 ${actualSha256.slice(0, 12)}...），已删除异常文件并切换下一节点`,
          );
        }

        // Atomic move to final path
        safeUnlink(finalPath);
        fs.renameSync(partPath, finalPath);
        safeUnlink(metaPath);

        const stat = fs.statSync(finalPath);
        return {
          filePath: finalPath,
          sha256: actualSha256,
          sizeBytes: stat.size,
          mirror,
          fromCache: false,
        };
      } finally {
        if (stallTimer) clearTimeout(stallTimer);
        if (options.signal) {
          options.signal.removeEventListener('abort', onOuterAbort);
        }
      }
    } catch (err) {
      if (options.signal?.aborted) {
        throw new Error('已取消下载');
      }
      // Preserve valid partial file on network drop so next mirror can resume;
      // on SHA256 mismatch it was already deleted above.
      if (fs.existsSync(partPath)) {
        existingPartSize = fs.statSync(partPath).size;
      } else {
        existingPartSize = 0;
      }
      const msg = err instanceof Error ? err.message : String(err);
      attemptErrors.push(`${mirror.label}: ${msg}`);
    }
  }

  throw new Error(`所有下载节点均失败：${attemptErrors.join('；')}`);
}
