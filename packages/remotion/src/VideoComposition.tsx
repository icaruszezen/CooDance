import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { VideoCompositionProps } from './types';
import { getVideoTheme } from './themes';
import { ResolvedScene, resolveMediaUrl, resolveTimeline } from './timelineSync';
import { TitleCardScene } from './components/TitleCardScene';
import { VideoClipScene } from './components/VideoClipScene';
import { ImageShowcaseScene } from './components/ImageShowcaseScene';
import { SplitCompareScene } from './components/SplitCompareScene';
import { DataUiDemoScene } from './components/DataUiDemoScene';
import { WebDomScene } from './components/WebDomScene';
import { OverlayLayer } from './components/OverlayLayer';
import { ChapterProgressBar } from './components/ChapterProgressBar';
import { SubtitleLayer } from './components/SubtitleLayer';

const SceneWrapper: React.FC<{
  scene: ResolvedScene;
  mediaBaseUrl: string;
  themeId: VideoCompositionProps['editPlan']['theme'];
  isPlayerPreview?: boolean;
}> = ({ scene, mediaBaseUrl, themeId, isPlayerPreview }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = getVideoTheme(themeId);

  const transFrames = Math.min(Math.round(fps * 0.35), Math.floor(scene.durationInFrames / 3));
  let transitionStyle: React.CSSProperties = {};

  if (scene.transition && scene.transition !== 'none' && transFrames > 1 && scene.startFrame > 0) {
    const p = interpolate(frame, [0, transFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const smoothOpacity = interpolate(p, [0, 1], [0.25, 1]);

    if (scene.transition === 'fade') {
      transitionStyle = { opacity: smoothOpacity };
    } else if (scene.transition === 'slide-left') {
      transitionStyle = {
        opacity: smoothOpacity,
        transform: `translateX(${interpolate(p, [0, 1], [64, 0])}px)`,
      };
    } else if (scene.transition === 'zoom-in') {
      transitionStyle = {
        opacity: smoothOpacity,
        transform: `scale(${interpolate(p, [0, 1], [0.95, 1])})`,
      };
    } else if (scene.transition === 'wipe') {
      transitionStyle = {
        clipPath: `inset(0 ${interpolate(p, [0, 1], [85, 0]).toFixed(1)}% 0 0)`,
      };
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', ...transitionStyle }}>
      {scene.type === 'title-card' ? (
        <TitleCardScene props={scene.props} theme={theme} mediaBaseUrl={mediaBaseUrl} />
      ) : null}
      {scene.type === 'video' ? (
        <VideoClipScene
          props={scene.props}
          durationInFrames={scene.durationInFrames}
          theme={theme}
          mediaBaseUrl={mediaBaseUrl}
          isPlayerPreview={isPlayerPreview}
        />
      ) : null}
      {scene.type === 'image' ? (
        <ImageShowcaseScene
          props={scene.props}
          durationInFrames={scene.durationInFrames}
          theme={theme}
          mediaBaseUrl={mediaBaseUrl}
        />
      ) : null}
      {scene.type === 'split-compare' ? (
        <SplitCompareScene props={scene.props} theme={theme} mediaBaseUrl={mediaBaseUrl} />
      ) : null}
      {scene.type === 'data-ui' ? (
        <DataUiDemoScene
          props={scene.props}
          durationInFrames={scene.durationInFrames}
          theme={theme}
        />
      ) : null}
      {scene.type === 'web-dom' ? (
        <WebDomScene props={scene.props} theme={theme} />
      ) : null}
    </div>
  );
};

/**
 * Main 16:9 CooDance Composition (`1920x1080` virtual stage scaled dynamically to match
 * both `1280x720@30fps` drafts and `1920x1080@60fps` production renders identically).
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
  mediaBaseUrl,
  editPlan,
  timeline,
  isPlayerPreview,
}) => {
  const { width, height, fps } = useVideoConfig();
  const theme = getVideoTheme(editPlan.theme);

  const resolved = useMemo(
    () => resolveTimeline(editPlan, timeline, fps),
    [editPlan, timeline, fps],
  );

  const scaleX = width / 1920;
  const scaleY = height / 1080;
  const stageScale = Math.min(scaleX, scaleY);

  const voiceoverUrl = timeline?.voiceoverFile
    ? resolveMediaUrl(mediaBaseUrl, timeline.voiceoverFile)
    : '';
  const bgMusicUrl = editPlan.videoMeta?.bgMusicAsset
    ? resolveMediaUrl(mediaBaseUrl, editPlan.videoMeta.bgMusicAsset)
    : '';

  return (
    <AbsoluteFill
      style={{
        background: theme.bg,
        overflow: 'hidden',
      }}
    >
      {/* Audio Tracks (Master Voiceover + Optional BGM + Precision SFX Triggers) */}
      {voiceoverUrl ? <Audio src={voiceoverUrl} volume={1} /> : null}
      {bgMusicUrl ? (
        <Audio
          src={bgMusicUrl}
          volume={typeof editPlan.videoMeta?.bgMusicVolume === 'number' ? editPlan.videoMeta.bgMusicVolume : 0.14}
          loop
        />
      ) : null}
      {resolved.sfxEvents.map((sfx) => {
        const sfxUrl = resolveMediaUrl(mediaBaseUrl, sfx.assetPath);
        if (!sfxUrl) return null;
        const maxRemaining = Math.max(1, resolved.durationInFrames - sfx.startFrame);
        const durationInFrames = Math.min(maxRemaining, Math.max(1, Math.round(fps * 3)));
        return (
          <Sequence
            key={sfx.id}
            from={sfx.startFrame}
            durationInFrames={durationInFrames}
            layout="none"
          >
            <Audio src={sfxUrl} volume={typeof sfx.volume === 'number' ? sfx.volume : 0.45} />
          </Sequence>
        );
      })}

      {/* Resolution-Independent 1920x1080 Stage */}
      <div
        style={{
          width: 1920,
          height: 1080,
          transformOrigin: 'top left',
          transform: `scale(${stageScale})`,
          background: theme.bgRadial,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Active Visual Scenes */}
        {resolved.scenes.map((scene) => (
          <Sequence
            key={scene.id}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
            layout="none"
          >
            <SceneWrapper
              scene={scene}
              mediaBaseUrl={mediaBaseUrl}
              themeId={editPlan.theme}
              isPlayerPreview={isPlayerPreview}
            />
          </Sequence>
        ))}

        {/* Declarative Overlays (Callouts, Arrows, Highlight Boxes, Badges, Logos, Lottie) */}
        <OverlayLayer
          overlays={resolved.overlays}
          theme={theme}
          mediaBaseUrl={mediaBaseUrl}
        />

        {/* Synced Broadcast Subtitles */}
        <SubtitleLayer
          subtitles={resolved.subtitles}
          styleConfig={
            editPlan.subtitleStyle || {
              enabled: true,
              position: 'bottom',
              fontSize: 42,
              maxCharsPerLine: 22,
              highlightActive: true,
            }
          }
          theme={theme}
        />

        {/* Bottom Editorial Chapter Progress Bar */}
        <ChapterProgressBar
          chapters={resolved.chapters}
          durationInFrames={resolved.durationInFrames}
          fps={resolved.fps}
          theme={theme}
        />
      </div>
    </AbsoluteFill>
  );
};
