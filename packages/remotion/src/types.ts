export type VideoThemeId = 'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald';

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
  x: number;
  y: number;
  width: number;
  height: number;
  startProgress?: number;
  endProgress?: number;
}

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
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  subtext?: string;
  color?: string;
  assetPath?: string;
  lottiePreset?: string;
  arrowDirection?:
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
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

export interface SubtitleCue {
  id: number;
  sentenceId: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface AudioTimeline {
  version: string;
  generatedAt: string;
  provider: string;
  voice: string;
  speed: number;
  sampleRate: number;
  totalDurationSec: number;
  voiceoverFile: string;
  subtitlesFile: string;
  waveformPeaks?: number[];
  sentences: Array<{
    id: number;
    text: string;
    note?: string;
    startSec: number;
    endSec: number;
    durationSec: number;
  }>;
  subtitles: SubtitleCue[];
}

export interface VideoCompositionProps {
  projectSlug: string;
  mediaBaseUrl: string;
  editPlan: EditPlan;
  timeline: AudioTimeline | null;
  /** True when rendered inside interactive Web Player (uses HTML5 Video instead of OffthreadVideo) */
  isPlayerPreview?: boolean;
}
