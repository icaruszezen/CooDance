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

  const leftIn = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const rightIn = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 16, stiffness: 120 } });

  const renderPane = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    const anim = isRight ? rightIn : leftIn;
    const title = isRight ? rightTitle : leftTitle;
    const badge = isRight ? badgeRight : badgeLeft;
    const asset = isRight ? rightAsset : leftAsset;
    const points = isRight ? rightPoints : leftPoints;
    const accentColor = isRight ? theme.success : theme.textMuted;

    return (
      <div
        style={{
          flex: 1,
          height: '100%',
          background: isRight ? theme.surfaceElevated : theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 24,
          padding: '44px 48px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
          opacity: anim,
          transform: `translateX(${interpolate(anim, [0, 1], [isRight ? 40 : -40, 0])}px)`,
          boxShadow: isRight ? '0 24px 64px rgba(0,0,0,0.28)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 42,
              fontWeight: 800,
              color: theme.textPrimary,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h2>
          {badge ? (
            <span
              style={{
                padding: '8px 18px',
                borderRadius: 999,
                background: isRight ? theme.accentSoft : 'rgba(148,163,184,0.14)',
                color: isRight ? theme.accent : theme.textSecondary,
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>

        <div
          style={{
            height: 3,
            width: '100%',
            background: isRight ? theme.accent : theme.border,
            borderRadius: 2,
          }}
        />

        {asset ? (
          <div
            style={{
              flex: 1,
              borderRadius: 16,
              overflow: 'hidden',
              background: '#000',
              border: `1px solid ${theme.border}`,
            }}
          >
            <Img src={asset} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, flex: 1, justifyContent: 'center' }}>
            {points.map((pt, idx) => {
              const ptAnim = spring({
                frame: Math.max(0, frame - 12 - idx * 7),
                fps,
                config: { damping: 18, stiffness: 120 },
              });
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 18,
                    padding: '22px 24px',
                    borderRadius: 16,
                    background: theme.bg,
                    border: `1px solid ${theme.border}`,
                    opacity: ptAnim,
                    transform: `translateY(${interpolate(ptAnim, [0, 1], [18, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: isRight ? theme.accentSoft : 'rgba(148,163,184,0.14)',
                      color: accentColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 20,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {isRight ? '✓' : '—'}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      lineHeight: 1.45,
                      color: isRight ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isRight ? 600 : 500,
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
        padding: '74px 104px 176px',
        boxSizing: 'border-box',
        display: 'flex',
        gap: 36,
        alignItems: 'stretch',
        fontFamily: theme.fontSans,
      }}
    >
      {renderPane('left')}
      {renderPane('right')}
    </div>
  );
};
