import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoThemeTokens } from '../themes';
import { resolveMediaUrl } from '../timelineSync';

interface SplitCompareSceneProps {
  props: Record<string, unknown>;
  theme: VideoThemeTokens;
  mediaBaseUrl: string;
}

export const SplitCompareScene: React.FC<SplitCompareSceneProps> = ({
  props,
  theme,
  mediaBaseUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftTitle = String(props.leftTitle || '传统方案');
  const rightTitle = String(props.rightTitle || '自动化方案');
  const badgeLeft = props.badgeLeft ? String(props.badgeLeft) : '';
  const badgeRight = props.badgeRight ? String(props.badgeRight) : '';
  const leftAsset = props.leftAsset ? resolveMediaUrl(mediaBaseUrl, String(props.leftAsset)) : '';
  const rightAsset = props.rightAsset ? resolveMediaUrl(mediaBaseUrl, String(props.rightAsset)) : '';
  const leftPoints = Array.isArray(props.leftPoints) ? props.leftPoints.map(String) : [];
  const rightPoints = Array.isArray(props.rightPoints) ? props.rightPoints.map(String) : [];

  const leftIn = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const rightIn = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 18, stiffness: 120 } });

  const renderColumn = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    const anim = isRight ? rightIn : leftIn;
    const title = isRight ? rightTitle : leftTitle;
    const badge = isRight ? badgeRight : badgeLeft;
    const asset = isRight ? rightAsset : leftAsset;
    const points = isRight ? rightPoints : leftPoints;

    return (
      <div
        style={{
          flex: 1,
          height: '100%',
          background: isRight ? theme.surfaceElevated : theme.surface,
          borderTop: `3px solid ${isRight ? theme.accent : 'transparent'}`,
          padding: '44px 52px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          opacity: anim,
          transform: `translateY(${interpolate(anim, [0, 1], [16, 0])}px)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            paddingBottom: 22,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 40,
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </h2>
          {badge ? (
            <span
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: `1px solid ${isRight ? theme.borderStrong : theme.border}`,
                background: isRight ? theme.accentSoft : theme.surfaceInset,
                color: isRight ? theme.accent : theme.textMuted,
                fontFamily: theme.fontMono,
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>

        {asset ? (
          <div
            style={{
              flex: 1,
              borderRadius: 10,
              overflow: 'hidden',
              background: '#000',
              border: `1px solid ${theme.border}`,
            }}
          >
            <Img src={asset} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
            {points.map((pt, idx) => {
              const ptAnim = spring({
                frame: Math.max(0, frame - 10 - idx * 6),
                fps,
                config: { damping: 18, stiffness: 120 },
              });
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 22,
                    padding: '28px 0',
                    borderBottom: idx < points.length - 1 ? `1px solid ${theme.border}` : 'none',
                    opacity: ptAnim,
                    transform: `translateY(${interpolate(ptAnim, [0, 1], [12, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      fontFamily: theme.fontMono,
                      fontSize: 22,
                      fontWeight: 700,
                      color: isRight ? theme.accent : theme.textMuted,
                      flexShrink: 0,
                      paddingTop: 3,
                    }}
                  >
                    {isRight ? '✓' : '—'}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      lineHeight: 1.48,
                      color: isRight ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isRight ? 600 : 400,
                    }}
                  >
                    {pt}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '68px 104px 168px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: theme.fontSans,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 1,
          background: theme.border,
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {renderColumn('left')}
        {renderColumn('right')}
      </div>
    </div>
  );
};
