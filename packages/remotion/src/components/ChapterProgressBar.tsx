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
        alignItems: 'center',
        gap: 18,
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
                gap: 6,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? theme.textPrimary : theme.textMuted,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {ch.title}
              </div>
              <div
                style={{
                  height: isActive ? 6 : 4,
                  borderRadius: 99,
                  background: theme.border,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${fillPct.toFixed(1)}%`,
                    height: '100%',
                    background: ch.color || (isActive ? theme.accent : theme.textMuted),
                    borderRadius: 99,
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
          fontSize: 18,
          fontWeight: 600,
          color: theme.textSecondary,
          flexShrink: 0,
          paddingLeft: 8,
        }}
      >
        {formatTimecode(currentSec)} / {formatTimecode(totalSec)}
      </div>
    </div>
  );
};
