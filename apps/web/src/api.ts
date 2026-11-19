import type { AudioTimeline, EditPlan } from '@coodance/remotion';

export interface ProjectSummaryDto {
  slug: string;
  title: string;
  path: string;
  updatedAt: string;
  hasScript: boolean;
  hasVoiceover: boolean;
  hasTimeline: boolean;
  hasAssetsManifest: boolean;
  hasEditPlan: boolean;
  hasRenderedVideo: boolean;
  durationSec: number;
  sceneCount: number;
  assetCount: number;
  snapshotCount: number;
  latestRenderFile?: string;
}

export interface AssetThumbDto {
  timeSec: number;
  relativePath: string;
}

export interface AssetManifestItemDto {
  id: string;
  name: string;
  relativePath: string;
  kind: 'video' | 'image' | 'audio' | 'lottie' | 'logo' | 'other';
  sizeBytes: number;
  modifiedAt: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  codec?: string;
  audioCodec?: string;
  thumbs?: AssetThumbDto[];
}

export interface AssetsManifestDto {
  version: string;
  scannedAt: string;
  projectSlug: string;
  assets: AssetManifestItemDto[];
}

export interface SnapshotEntryDto {
  tag: string;
  commit: string;
  date: string;
  message: string;
  filesChanged?: number;
}

export interface RenderFileDto {
  name: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface AudioTimelineFullDto extends AudioTimeline {
  sentences: Array<{
    id: number;
    text: string;
    note?: string;
    hash: string;
    cached: boolean;
    startSec: number;
    endSec: number;
    durationSec: number;
    rawDurationSec: number;
    trimmedMs: number;
    pauseAfterMs: number;
  }>;
}

export interface ProjectWorkspaceDto {
  summary: ProjectSummaryDto;
  script: string;
  editPlan: EditPlan | null;
  editPlanRaw: string;
  timeline: AudioTimelineFullDto | null;
  manifest: AssetsManifestDto | null;
  subtitlesSrt: string;
  snapshots: SnapshotEntryDto[];
  renders: RenderFileDto[];
}

export interface SettingsDto {
  workspaceDir: string;
  language: 'zh-CN' | 'en-US';
  uiTheme: 'dark' | 'light';
  tts: {
    defaultProvider: 'doubao' | 'edge' | 'local';
    defaultSpeed: number;
    silenceThresholdDb: number;
    maxInternalPauseMs: number;
    paragraphPauseMs: number;
    sentencePauseMs: number;
    doubao: {
      appId: string;
      accessToken: string;
      resourceId: string;
      voiceType: string;
      endpoint: string;
    };
    edge: {
      voice: string;
    };
  };
  ai: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  ffmpeg: {
    ffmpegPath: string;
    ffprobePath: string;
  };
  security: {
    webAccessToken: string;
  };
  secretsStatus?: {
    hasDoubaoToken: boolean;
    hasAiKey: boolean;
    hasWebAccessToken: boolean;
  };
}

export interface FfmpegHealthDto {
  ok: boolean;
  source: string;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion?: string;
  error?: string;
}

export interface ProgressEventDto {
  jobId: string;
  projectSlug: string;
  kind: 'tts' | 'inspect' | 'render' | 'ai' | 'tool';
  stage: string;
  progress: number;
  message: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  timestamp: string;
}

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  selectDirectory: () => Promise<string | null>;
  revealPath: (targetPath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    coodanceDesktop?: DesktopBridge;
  }
}

function getStoredToken(): string {
  return localStorage.getItem('coodance_access_token') || '';
}

export function setStoredToken(token: string): void {
  if (token) {
    localStorage.setItem('coodance_access_token', token);
  } else {
    localStorage.removeItem('coodance_access_token');
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) errMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export function projectFileUrl(slug: string, relativePath: string, download = false): string {
  const clean = relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const params = new URLSearchParams();
  const token = getStoredToken();
  if (token) params.set('token', token);
  if (download) params.set('download', '1');
  const q = params.toString();
  return `/api/projects/${encodeURIComponent(slug)}/files/${clean}${q ? `?${q}` : ''}`;
}

export function connectStudioWs(
  onProgress: (ev: ProgressEventDto) => void,
  onFileChanged: (ev: { projectSlug: string; relativePath: string; event: string }) => void,
): () => void {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getStoredToken();
  const wsUrl = `${proto}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  let ws: WebSocket | null = null;
  let closed = false;
  let retryTimer: number | null = null;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.type === 'progress' && msg.payload) {
          onProgress(msg.payload);
        } else if (msg.type === 'file-changed' && msg.payload) {
          onFileChanged(msg.payload);
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (!closed) {
        retryTimer = window.setTimeout(connect, 2500);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    ws?.close();
  };
}
