import {
  AudioTimeline,
  ChapterItem,
  EditPlan,
  OverlayItem,
  SceneItem,
  SfxEvent,
  SubtitleCue,
} from './types';

export interface ResolvedScene extends SceneItem {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export interface ResolvedChapter extends ChapterItem {
  startFrame: number;
  endFrame: number;
}

export interface ResolvedOverlay extends OverlayItem {
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export interface ResolvedSfx extends SfxEvent {
  startFrame: number;
}

export interface ResolvedSubtitle extends SubtitleCue {
  startFrame: number;
  endFrame: number;
}

export interface ResolvedTimeline {
  fps: number;
  totalDurationSec: number;
  durationInFrames: number;
  scenes: ResolvedScene[];
  chapters: ResolvedChapter[];
  overlays: ResolvedOverlay[];
  sfxEvents: ResolvedSfx[];
  subtitles: ResolvedSubtitle[];
}

export function secToFrame(sec: number, fps: number): number {
  return Math.max(0, Math.round(sec * fps));
}

export function formatTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Resolves a project-relative media path (e.g. `assets/demo.mp4` or `build/voiceover.mp3`)
 * against the active `mediaBaseUrl`.
 */
export function resolveMediaUrl(mediaBaseUrl: string, relativePath?: string): string {
  if (!relativePath) return '';
  if (/^(https?:|data:|blob:)/i.test(relativePath)) {
    return relativePath;
  }
  const cleanBase = mediaBaseUrl.replace(/\/+$/, '');
  const cleanRel = relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${cleanBase}/${cleanRel}`;
}

/**
 * Binds `edit_plan.json` and `audio_timeline.json` into exact frame ranges
 * for deterministic frame-accurate rendering across 30fps drafts and 60fps production.
 */
export function resolveTimeline(
  editPlan: EditPlan,
  timeline: AudioTimeline | null,
  fpsOverride?: number,
): ResolvedTimeline {
  const fps = fpsOverride || editPlan.videoMeta?.fps || 60;
  const maxSceneEnd = (editPlan.scenes || []).reduce(
    (max, sc) => Math.max(max, Number(sc.endSec) || 0),
    0,
  );
  const totalDurationSec = Math.max(
    timeline?.totalDurationSec || 0,
    maxSceneEnd,
    3,
  );
  const durationInFrames = Math.max(1, Math.ceil(totalDurationSec * fps));

  const scenes: ResolvedScene[] = (editPlan.scenes || [])
    .slice()
    .sort((a, b) => a.startSec - b.startSec)
    .map((sc) => {
      const startFrame = secToFrame(sc.startSec, fps);
      const endFrame = Math.max(startFrame + 1, Math.min(durationInFrames, secToFrame(sc.endSec, fps)));
      return {
        ...sc,
        startFrame,
        endFrame,
        durationInFrames: Math.max(1, endFrame - startFrame),
      };
    });

  const sortedChapters = (editPlan.chapters || [])
    .slice()
    .sort((a, b) => a.startSec - b.startSec);

  const chapters: ResolvedChapter[] = sortedChapters.map((ch, idx) => {
    const nextStart = sortedChapters[idx + 1]?.startSec ?? totalDurationSec;
    const endSec = ch.endSec && ch.endSec > ch.startSec ? ch.endSec : nextStart;
    return {
      ...ch,
      endSec,
      startFrame: secToFrame(ch.startSec, fps),
      endFrame: Math.max(secToFrame(ch.startSec, fps) + 1, secToFrame(endSec, fps)),
    };
  });

  const overlays: ResolvedOverlay[] = (editPlan.overlays || []).map((ov) => {
    const startFrame = secToFrame(ov.startSec, fps);
    const endFrame = Math.max(startFrame + 1, Math.min(durationInFrames, secToFrame(ov.endSec, fps)));
    return {
      ...ov,
      startFrame,
      endFrame,
      durationInFrames: Math.max(1, endFrame - startFrame),
    };
  });

  const sfxEvents: ResolvedSfx[] = (editPlan.sfxEvents || []).map((sfx) => ({
    ...sfx,
    startFrame: Math.min(durationInFrames - 1, secToFrame(sfx.timeSec, fps)),
  }));

  const subtitles: ResolvedSubtitle[] = (timeline?.subtitles || []).map((cue) => ({
    ...cue,
    startFrame: secToFrame(cue.startSec, fps),
    endFrame: Math.max(secToFrame(cue.startSec, fps) + 1, secToFrame(cue.endSec, fps)),
  }));

  return {
    fps,
    totalDurationSec,
    durationInFrames,
    scenes,
    chapters,
    overlays,
    sfxEvents,
    subtitles,
  };
}
