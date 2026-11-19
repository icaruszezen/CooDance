import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoThemeTokens } from '../themes';
import { resolveMediaUrl } from '../timelineSync';

interface ImageShowcaseSceneProps {
  props: Record<string, unknown>;
  durationInFrames: number;
  theme: VideoThemeTokens;
  mediaBaseUrl: string;
}

export const ImageShowcaseScene: React.FC<ImageShowcaseSceneProps> = ({
  props,
  durationInFrames,
  theme,
  mediaBaseUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const assetPath = String(props.assetPath || '');
  const fit = props.fit === 'cover' ? 'cover' : 'contain';
  const kenBurns = String(props.kenBurns || 'zoom-in');
  const caption = props.caption ? String(props.caption) : '';
  const showFrame = props.showFrame !== false;

  const entrance = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const progress = frame / Math.max(1, durationInFrames - 1);

  let transform = 'scale(1)';
  if (kenBurns === 'zoom-in') {
    transform = `scale(${interpolate(progress, [0, 1], [1.0, 1.12]).toFixed(4)})`;
  } else if (kenBurns === 'zoom-out') {
    transform = `scale(${interpolate(progress, [0, 1], [1.14, 1.0]).toFixed(4)})`;
  } else if (kenBurns === 'pan-left') {
    transform = `scale(1.1) translateX(${interpolate(progress, [0, 1], [30, -30]).toFixed(1)}px)`;
  } else if (kenBurns === 'pan-right') {
    transform = `scale(1.1) translateX(${interpolate(progress, [0, 1], [-30, 30]).toFixed(1)}px)`;
  }

  const src = resolveMediaUrl(mediaBaseUrl, assetPath);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: showFrame ? '58px 110px 168px' : '0',
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
          borderRadius: showFrame ? 24 : 0,
          overflow: 'hidden',
          border: showFrame ? `1px solid ${theme.border}` : 'none',
          background: theme.surface,
          boxShadow: showFrame ? '0 28px 72px rgba(0,0,0,0.38)' : 'none',
          position: 'relative',
          opacity: entrance,
        }}
      >
        {src ? (
          <Img
            src={src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: fit,
              transform,
            }}
          />
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
            请在右侧属性栏选择图片素材 (assetPath)
          </div>
        )}

        {caption ? (
          <div
            style={{
              position: 'absolute',
              left: 28,
              bottom: 24,
              padding: '10px 20px',
              borderRadius: 12,
              background: theme.subtitleBg,
              border: `1px solid ${theme.border}`,
              color: theme.subtitleText,
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
};
