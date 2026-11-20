export type VideoThemeId = 'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald';

export type TtsProviderId = 'doubao' | 'edge' | 'local';

export type SceneType =
  | 'title-card'
  | 'video'
  | 'image'
  | 'split-compare'
  | 'data-ui'
  | 'web-dom';

export type TransitionType = 'none' | 'fade' | 'slide-left' | 'zoom-in' | 'wipe';

export type OverlayType =
  | 'callout'
  | 'arrow'
  | 'highlight-box'
  | 'badge'
  | 'lottie'
  | 'logo'
  | 'text-card';

export interface ZoomRegion {
  enabled: boolean;
  /** Normalized 0..1 coordinates on source frame */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Progress (0..1) inside scene where zoom reaches full magnification */
  startProgress?: number;
  endProgress?: number;
}

export interface TitleCardProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  badge?: string;
  logoAsset?: string;
}

export interface VideoSceneProps {
  assetPath: string;
  trimStartSec: number;
  playbackRate: number;
  muted?: boolean;
  volume?: number;
  fit?: 'contain' | 'cover';
  showDeviceFrame?: boolean;
  caption?: string;
  zoomRegion?: ZoomRegion;
}

export interface ImageSceneProps {
  assetPath: string;
  fit?: 'contain' | 'cover';
  kenBurns?: 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  caption?: string;
  showFrame?: boolean;
}

export interface SplitCompareProps {
  leftTitle: string;
  rightTitle: string;
  leftAsset?: string;
  rightAsset?: string;
  leftPoints?: string[];
  rightPoints?: string[];
  badgeLeft?: string;
  badgeRight?: string;
  splitRatio?: number;
}

export interface DataUiMetric {
  label: string;
  value: string;
  delta?: string;
  accent?: 'primary' | 'success' | 'warning' | 'neutral';
}

export interface DataUiPipelineStep {
  title: string;
  subtitle: string;
  status: 'done' | 'active' | 'queued';
}

export interface DataUiChartBar {
  label: string;
  value: number;
  unit?: string;
  highlight?: boolean;
}

export interface DataUiProps {
  variant: 'metrics' | 'terminal' | 'pipeline' | 'bar-chart';
  heading: string;
  subheading?: string;
  metrics?: DataUiMetric[];
  terminalLines?: string[];
  pipelineSteps?: DataUiPipelineStep[];
  chartData?: DataUiChartBar[];
}

export interface WebDomHighlightCard {
  title: string;
  badge?: string;
  description: string;
  active?: boolean;
}

export interface WebDomProps {
  url: string;
  pageTitle: string;
  heading: string;
  description?: string;
  highlights?: WebDomHighlightCard[];
  ctaLabel?: string;
  cursorTargetIndex?: number;
}

export type SceneProps =
  | TitleCardProps
  | VideoSceneProps
  | ImageSceneProps
  | SplitCompareProps
  | DataUiProps
  | WebDomProps;

export interface SceneItem {
  id: string;
  type: SceneType;
  label: string;
  startSec: number;
  endSec: number;
  sentenceIds?: number[];
  transition?: TransitionType;
  props: Record<string, unknown>;
}

export interface ChapterItem {
  id: string;
  title: string;
  startSec: number;
  endSec?: number;
  color?: string;
}

export interface OverlayItem {
  id: string;
  type: OverlayType;
  label: string;
  startSec: number;
  endSec: number;
  /** Normalized 0..1 coordinates on 1920x1080 canvas */
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  subtext?: string;
  color?: string;
  assetPath?: string;
  lottiePreset?: string;
  arrowDirection?: 'up' | 'down' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  animation?: 'pop' | 'slide-up' | 'fade' | 'pulse';
}

export interface SfxEvent {
  id: string;
  name: string;
  assetPath: string;
  timeSec: number;
  volume?: number;
}

export interface SubtitleStyleConfig {
  enabled: boolean;
  position: 'bottom' | 'lower-third';
  fontSize: number;
  maxCharsPerLine: number;
  highlightActive: boolean;
}

export interface VideoMetaConfig {
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  fps: number;
  bgMusicAsset?: string;
  bgMusicVolume?: number;
}

export interface EditPlan {
  version: string;
  theme: VideoThemeId;
  videoMeta: VideoMetaConfig;
  subtitleStyle: SubtitleStyleConfig;
  chapters: ChapterItem[];
  scenes: SceneItem[];
  overlays: OverlayItem[];
  sfxEvents: SfxEvent[];
}

export interface ScriptLineItem {
  index: number;
  lineNumber: number;
  text: string;
  note?: string;
  pauseAfterMs: number;
}

export interface SubtitleCue {
  id: number;
  sentenceId: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface AudioTimelineSentence {
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
  subtitles: SubtitleCue[];
}

export interface AudioTimeline {
  version: string;
  generatedAt: string;
  provider: TtsProviderId;
  voice: string;
  speed: number;
  sampleRate: number;
  totalDurationSec: number;
  voiceoverFile: string;
  subtitlesFile: string;
  /** Downsampled normalized peak amplitude bars (0..1) for timeline waveform UI */
  waveformPeaks: number[];
  sentences: AudioTimelineSentence[];
  subtitles: SubtitleCue[];
}

export type AssetKind = 'video' | 'image' | 'audio' | 'lottie' | 'logo' | 'other';

export interface AssetThumbInfo {
  timeSec: number;
  relativePath: string;
}

export interface AssetManifestItem {
  id: string;
  name: string;
  relativePath: string;
  kind: AssetKind;
  sizeBytes: number;
  modifiedAt: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  codec?: string;
  audioCodec?: string;
  thumbs?: AssetThumbInfo[];
}

export interface AssetsManifest {
  version: string;
  scannedAt: string;
  projectSlug: string;
  assets: AssetManifestItem[];
}

export interface SnapshotEntry {
  tag: string;
  commit: string;
  date: string;
  message: string;
  filesChanged?: number;
}

export interface ProjectSummary {
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

export interface TtsRunOptions {
  provider?: TtsProviderId;
  voice?: string;
  speed?: number;
  silenceThresholdDb?: number;
  maxInternalPauseMs?: number;
  paragraphPauseMs?: number;
  sentencePauseMs?: number;
  fadeMs?: number;
  forceRegenerate?: boolean;
  doubaoAppId?: string;
  doubaoAccessToken?: string;
  doubaoResourceId?: string;
  doubaoEndpoint?: string;
}

export interface RenderOptions {
  preset?: 'production' | 'draft';
  outputName?: string;
  crf?: number;
  concurrency?: number;
  autoSnapshot?: boolean;
}

export interface RenderResult {
  outputPath: string;
  relativePath: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  snapshotTag?: string;
}

export type UpdateMirrorMode = 'auto' | 'cn-only' | 'custom' | 'direct';

export type UpdateInstallKind = 'nsis' | 'portable-zip' | 'dmg' | 'appimage' | 'web';

export interface AppUpdateSettings {
  autoCheck: boolean;
  autoDownload: boolean;
  includePrerelease: boolean;
  mirrorMode: UpdateMirrorMode;
  customMirrorPrefix: string;
  skippedVersion: string;
  lastCheckedAt?: string;
}

export interface UpdateMirrorNode {
  id: string;
  label: string;
  region: 'cn' | 'hk' | 'custom' | 'direct';
  prefix: string;
}

export interface UpdateAssetInfo {
  name: string;
  size: number;
  sha256?: string;
  downloadUrl: string;
  platform?: 'win32' | 'darwin' | 'linux';
  arch?: 'x64' | 'arm64';
  installKind?: Exclude<UpdateInstallKind, 'web'>;
}

export interface UpdateManifest {
  schemaVersion: 1;
  repo: string;
  version: string;
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  releaseUrl: string;
  releaseNotes: string;
  assets: UpdateAssetInfo[];
}

export interface UpdateRuntimeTarget {
  isDesktop: boolean;
  platform: NodeJS.Platform;
  arch: string;
  installKind: UpdateInstallKind;
  currentVersion: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  latestTag: string;
  releaseName: string;
  updateAvailable: boolean;
  isPrerelease: boolean;
  isSkipped: boolean;
  publishedAt: string;
  releaseUrl: string;
  releaseNotes: string;
  sourceNode: {
    id: string;
    label: string;
    region: UpdateMirrorNode['region'];
  };
  manifestSource: 'update-manifest' | 'releases-atom' | 'github-api' | 'custom-manifest';
  matchedAsset: UpdateAssetInfo | null;
  allAssets: UpdateAssetInfo[];
  checkedAt: string;
  target: UpdateRuntimeTarget;
}

export interface UpdateMirrorTestResult {
  id: string;
  label: string;
  region: UpdateMirrorNode['region'];
  prefix: string;
  ok: boolean;
  latencyMs: number | null;
  statusCode?: number;
  error?: string;
}

export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'installing'
  | 'error';

export interface DesktopUpdateDownloadState {
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
  filePath?: string;
  verifiedSha256?: string;
}

export interface DesktopUpdateStatus {
  phase: DesktopUpdatePhase;
  currentVersion: string;
  target: UpdateRuntimeTarget;
  checkResult: UpdateCheckResult | null;
  download: DesktopUpdateDownloadState | null;
  error: string | null;
  lastCheckedAt: string | null;
}

export interface DesktopInstallActionResult {
  ok: boolean;
  action: 'launched-nsis' | 'revealed-portable-zip' | 'opened-dmg' | 'revealed-appimage';
  filePath: string;
  message: string;
  canQuitNow?: boolean;
}

export interface AppSettings {
  workspaceDir: string;
  language: 'zh-CN' | 'en-US';
  uiTheme: 'dark' | 'light';
  tts: {
    defaultProvider: TtsProviderId;
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
  mcp: {
    enabled: boolean;
    fixedPortEnabled: boolean;
    fixedPort: number;
    autoSnapshotOnAgentWrite: boolean;
    allowPaidTtsFromAgent: boolean;
  };
  update: AppUpdateSettings;
}

export interface ProgressEvent {
  jobId: string;
  projectSlug: string;
  kind: 'tts' | 'inspect' | 'render' | 'ai' | 'tool';
  stage: string;
  progress: number;
  message: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  timestamp: string;
}

export interface EditPlanValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  suggestion?: string;
}

export interface EditPlanValidationResult {
  valid: boolean;
  errors: EditPlanValidationIssue[];
  warnings: EditPlanValidationIssue[];
  summary: {
    sceneCount: number;
    overlayCount: number;
    sfxCount: number;
    chapterCount: number;
    planDurationSec: number;
    audioDurationSec: number | null;
    referencedAssets: string[];
    missingAssets: string[];
  };
  normalizedPlan?: EditPlan;
}

export type ImportAssetSourceType = 'localPath' | 'url' | 'base64' | 'text';
export type ImportAssetCategory = 'auto' | 'media' | 'logos' | 'lottie' | 'sfx';

export interface ImportAssetOptions {
  sourceType: ImportAssetSourceType;
  filename: string;
  category?: ImportAssetCategory;
  localPath?: string;
  url?: string;
  base64?: string;
  content?: string;
  overwrite?: boolean;
  autoInspect?: boolean;
  thumbsPerVideo?: number;
}

export interface ImportAssetResult {
  relativePath: string;
  fullPath: string;
  sizeBytes: number;
  kind: AssetKind;
  category: Exclude<ImportAssetCategory, 'auto'>;
  assetItem?: AssetManifestItem;
  manifest?: AssetsManifest;
}

export type RenderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface RenderJobRecord {
  jobId: string;
  projectSlug: string;
  preset: 'production' | 'draft';
  status: RenderJobStatus;
  stage: string;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: RenderResult;
  error?: string;
  logs: Array<{ timestamp: string; stage: string; progress: number; message: string }>;
}

export type AgentClientId =
  | 'cursor'
  | 'claude-code'
  | 'claude-desktop'
  | 'antigravity'
  | 'cherry-studio';

export type AgentTransportMode = 'http' | 'stdio';

export interface AgentClientStatus {
  id: AgentClientId;
  name: string;
  description: string;
  recommendedTransport: AgentTransportMode;
  supportsHttp: boolean;
  supportsStdio: boolean;
  supportsSkillDir: boolean;
  configPath: string | null;
  skillInstallDir: string | null;
  clientDetected: boolean;
  mcpInstalled: boolean;
  mcpInstalledMode?: AgentTransportMode | 'unknown';
  skillInstalled: boolean;
  canAutoInstall: boolean;
}

export interface AgentIntegrationInfo {
  mcpEnabled: boolean;
  httpEndpointUrl: string;
  authRequired: boolean;
  isDesktop: boolean;
  platform: NodeJS.Platform;
  fixedPortRequested: number | null;
  actualPort: number;
  portFallbackReason?: string;
  workspaceDir: string;
  configDir: string;
  stdioCommand: string;
  stdioArgs: string[];
  stdioEnv: Record<string, string>;
  stdioRuntimeLabel: string;
  stdioAvailable: boolean;
  skillDir: string | null;
  skillFiles: Array<{ relativePath: string; sizeBytes: number }>;
  clients: AgentClientStatus[];
  snippets: {
    cursorHttp: string;
    cursorStdio: string;
    claudeCodeHttp: string;
    claudeCodeStdio: string;
    claudeDesktopStdio: string;
    claudeDesktopHttp: string;
    genericHttp: string;
    genericStdio: string;
  };
  guardrails: {
    fixedPortEnabled: boolean;
    fixedPort: number;
    autoSnapshotOnAgentWrite: boolean;
    allowPaidTtsFromAgent: boolean;
  };
}

export interface InstallAgentOptions {
  clientId: AgentClientId;
  transport: AgentTransportMode;
  installMcp?: boolean;
  installSkill?: boolean;
  dryRun?: boolean;
  httpEndpointUrl?: string;
  accessToken?: string;
}

export interface InstallAgentResult {
  ok: boolean;
  dryRun: boolean;
  clientId: AgentClientId;
  transport: AgentTransportMode;
  mcpUpdated: boolean;
  skillUpdated: boolean;
  configPath: string | null;
  backupPath?: string;
  skillPath?: string;
  previewConfigJson?: string;
  message: string;
  warnings: string[];
}

