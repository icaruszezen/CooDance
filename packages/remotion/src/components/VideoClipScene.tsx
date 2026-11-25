import React from 'react';
import {
  OffthreadVideo,
  Video,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { VideoThemeTokens } from '../themes';
import { resolveMediaUrl } from '../timelineSync';
import { ZoomRegion } from '../types';

interface VideoClipSceneProps {
  props: Record<string, unknown>;
  durationInFrames: number;
  theme: VideoThemeTokens;
  mediaBaseUrl: string;
  isPlayerPreview?: boolean;
}

export const VideoClipScene: React.FC<VideoClipSceneProps> = ({
  props,
  durationInFrames,
  theme,
  mediaBaseUrl,
  isPlayerPreview,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const assetPath = String(props.assetPath || '');
  const trimStartSec = Number(props.trimStartSec) || 0;
  const playbackRate = Number(props.playbackRate) || 1;
  const muted = props.muted !== false;
  const volume = typeof props.volume === 'number' ? props.volume : muted ? 0 : 1;
  const fit = props.fit === 'cover' ? 'cover' : 'contain';
  const showDeviceFrame = props.showDeviceFrame !== false;
  const caption = props.caption ? String(props.caption) : '';
  const zoomRegion = props.zoomRegion as ZoomRegion | undefined;

  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const src = resolveMediaUrl(mediaBaseUrl, assetPath);

  // Compute animated camera zoom & focal center pan if zoomRegion is enabled
  let scale = 1;
  let originX = 50;
  let originY = 50;

  if (zoomRegion && zoomRegion.enabled && zoomRegion.width > 0.08 && zoomRegion.height > 0.08) {
    const progress = frame / Math.max(1, durationInFrames - 1);
    const startP = zoomRegion.startProgress ?? 0.18;
    const endP = zoomRegion.endProgress ?? 0.85;

    const targetScale = Math.min(2.6, Math.max(1.15, 0.86 / Math.max(zoomRegion.width, zoomRegion.height)));
    const zoomIn = interpolate(progress, [startP - 0.12, startP], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const zoomOut = interpolate(progress, [endP, Math.min(1, endP + 0.12)], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const zoomFactor = Math.min(zoomIn, zoomOut);
    scale = 1 + (targetScale - 1) * zoomFactor;
    originX = Math.max(5, Math.min(95, (zoomRegion.x + zoomRegion.width / 2) * 100));
    originY = Math.max(5, Math.min(95, (zoomRegion.y + zoomRegion.height / 2) * 100));
  }

  const startFromFrames = Math.max(0, Math.round(trimStartSec * fps));
  const VideoComponent = isPlayerPreview ? Video : OffthreadVideo;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: showDeviceFrame ? '52px 92px 158px' : '0',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.fontSans,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: showDeviceFrame ? 14 : 0,
          overflow: 'hidden',
          background: '#09090b',
          border: showDeviceFrame ? `1px solid ${theme.borderStrong}` : 'none',
          boxShadow: showDeviceFrame
            ? theme.isLight
              ? '0 22px 54px rgba(20,20,22,0.12)'
              : '0 28px 72px rgba(0,0,0,0.46)'
            : 'none',
          display: 'flex',
          flexDirection: 'column',
          transform: `scale(${interpolate(entrance, [0, 1], [0.975, 1])})`,
          opacity: entrance,
        }}
      >
        {showDeviceFrame ? (
          <div
            style={{
              height: 44,
              background: theme.surfaceElevated,
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.borderStrong }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.borderStrong }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.borderStrong }} />
            </div>
            <div
              style={{
                fontFamily: theme.fontMono,
                fontSize: 17,
                color: theme.textSecondary,
                letterSpacing: '0.02em',
              }}
            >
              {caption || assetPath || 'Screen Capture'}
            </div>
            <div
              style={{
                fontFamily: theme.fontMono,
                fontSize: 16,
                color: theme.textMuted,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {playbackRate.toFixed(2)}×
            </div>
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: '#000',
          }}
        >
          {src ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                transform: `scale(${scale.toFixed(4)})`,
                transformOrigin: `${originX.toFixed(2)}% ${originY.toFixed(2)}%`,
              }}
            >
              <VideoComponent
                src={src}
                startFrom={startFromFrames}
                playbackRate={playbackRate}
                muted={muted}
                volume={volume}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: fit,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.textMuted,
                fontSize: 28,
              }}
            >
              请在右侧属性栏选择视频素材 (assetPath)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
