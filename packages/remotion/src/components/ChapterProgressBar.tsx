import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ResolvedChapter, formatTimecode } from '../timelineSync';
import { VideoThemeTokens } from '../themes';

interface ChapterProgressBarProps {
  chapters: ResolvedChapter[];
  durationInFrames: number;
  fps: number;
  theme: VideoThemeTokens;
}

export const ChapterProgressBar: React.FC<ChapterProgressBarProps> = ({
  chapters,
  durationInFrames,
  fps,
  theme,
}) => {
  const frame = useCurrentFrame();
  const currentSec = frame / fps;
  const totalSec = durationInFrames / fps;

  if (chapters.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        bottom: 24,
        zIndex: 45,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 20,
        fontFamily: theme.fontSans,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
        }}
      >
        {chapters.map((ch) => {
          const span = Math.max(1, ch.endFrame - ch.startFrame);
          const weight = span / Math.max(1, durationInFrames);
          const isActive = frame >= ch.startFrame && frame <= ch.endFrame;
          const fillPct =
            frame < ch.startFrame
              ? 0
              : frame >= ch.endFrame
                ? 100
                : ((frame - ch.startFrame) / span) * 100;

          return (
            <div
              key={ch.id}
              style={{
                flex: Math.max(0.08, weight),
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? theme.textPrimary : theme.textMuted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.01em',
                }}
              >
                {ch.title}
              </div>
              <div
                style={{
                  height: isActive ? 3 : 2,
                  borderRadius: 2,
                  background: theme.border,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${fillPct.toFixed(1)}%`,
                    height: '100%',
                    background: ch.color || (isActive ? theme.accent : theme.textMuted),
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontFamily: theme.fontMono,
          fontSize: 17,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          color: theme.textMuted,
          flexShrink: 0,
          paddingLeft: 8,
          lineHeight: 1,
          paddingBottom: 2,
        }}
      >
        {formatTimecode(currentSec)} / {formatTimecode(totalSec)}
      </div>
    </div>
  );
};
