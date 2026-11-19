import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { ResolvedSubtitle } from '../timelineSync';
import { SubtitleStyleConfig } from '../types';
import { VideoThemeTokens } from '../themes';

interface SubtitleLayerProps {
  subtitles: ResolvedSubtitle[];
  styleConfig: SubtitleStyleConfig;
  theme: VideoThemeTokens;
}

export const SubtitleLayer: React.FC<SubtitleLayerProps> = ({
  subtitles,
  styleConfig,
  theme,
}) => {
  const frame = useCurrentFrame();
  if (!styleConfig.enabled || subtitles.length === 0) return null;

  const active = subtitles.find((cue) => frame >= cue.startFrame && frame <= cue.endFrame);
  if (!active) return null;

  const localFrame = frame - active.startFrame;
  const opacity = interpolate(localFrame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(localFrame, [0, 6], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bottomOffset = styleConfig.position === 'lower-third' ? 140 : 88;

  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: bottomOffset,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          padding: '14px 32px',
          borderRadius: 14,
          background: theme.subtitleBg,
          border: `1px solid ${theme.border}`,
          color: theme.subtitleText,
          fontFamily: theme.fontSans,
          fontSize: styleConfig.fontSize || 42,
          fontWeight: 700,
          lineHeight: 1.35,
          letterSpacing: '0.015em',
          textAlign: 'center',
          maxWidth: 1520,
          boxShadow: '0 14px 36px rgba(0,0,0,0.38)',
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
