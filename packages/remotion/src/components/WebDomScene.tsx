import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoThemeTokens } from '../themes';

interface WebDomSceneProps {
  props: Record<string, unknown>;
  theme: VideoThemeTokens;
}

export const WebDomScene: React.FC<WebDomSceneProps> = ({ props, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const url = String(props.url || 'https://coodance.local/studio');
  const pageTitle = String(props.pageTitle || 'CooDance Studio');
  const heading = String(props.heading || '网页界面 DOM 还原演示');
  const description = props.description ? String(props.description) : '';
  const ctaLabel = props.ctaLabel ? String(props.ctaLabel) : '立即开始';
  const cursorTargetIndex = typeof props.cursorTargetIndex === 'number' ? props.cursorTargetIndex : 0;
  const highlights = Array.isArray(props.highlights)
    ? (props.highlights as Array<{ title: string; badge?: string; description: string; active?: boolean }>)
    : [];

  const windowIn = spring({ frame, fps, config: { damping: 18, stiffness: 115 } });
  const cursorMove = spring({ frame: Math.max(0, frame - 24), fps, config: { damping: 16, stiffness: 90 } });
  const clickPulse = spring({ frame: Math.max(0, frame - 52), fps, config: { damping: 14, stiffness: 180 } });

  const targetX = 320 + Math.min(2, Math.max(0, cursorTargetIndex)) * 480;
  const cursorX = interpolate(cursorMove, [0, 1], [1280, targetX]);
  const cursorY = interpolate(cursorMove, [0, 1], [680, 520]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '54px 96px 162px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.fontSans,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          background: theme.surface,
          border: `1px solid ${theme.borderStrong}`,
          boxShadow: theme.isLight
            ? '0 22px 54px rgba(20, 20, 22, 0.08)'
            : '0 26px 68px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          opacity: windowIn,
          transform: `scale(${interpolate(windowIn, [0, 1], [0.975, 1])})`,
        }}
      >
        {/* Minimal Browser Chrome with Muted Gray Dots */}
        <div
          style={{
            height: 54,
            background: theme.surfaceElevated,
            borderBottom: `1px solid ${theme.border}`,
            padding: '0 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: theme.borderStrong }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: theme.borderStrong }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: theme.borderStrong }} />
          </div>

          <div
            style={{
              flex: 1,
              height: 32,
              borderRadius: 7,
              background: theme.surfaceInset,
              border: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              fontFamily: theme.fontMono,
              fontSize: 17,
              color: theme.textMuted,
            }}
          >
            {url}
          </div>

          <div style={{ fontSize: 17, fontWeight: 500, color: theme.textSecondary }}>
            {pageTitle}
          </div>
        </div>

        {/* Mocked Interactive DOM Content */}
        <div
          style={{
            flex: 1,
            padding: '50px 60px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 36 }}>
            <div style={{ maxWidth: 1100 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 48,
                  fontWeight: 800,
                  lineHeight: 1.18,
                  letterSpacing: '-0.03em',
                  color: theme.textPrimary,
                }}
              >
                {heading}
              </h2>
              {description ? (
                <p
                  style={{
                    margin: '16px 0 0',
                    fontSize: 24,
                    lineHeight: 1.5,
                    color: theme.textSecondary,
                  }}
                >
                  {description}
                </p>
              ) : null}
            </div>

            {/* High-Contrast Monochrome CTA */}
            <div
              style={{
                padding: '15px 28px',
                borderRadius: 9,
                background: theme.primary,
                color: theme.primaryText,
                fontSize: 21,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {ctaLabel}
            </div>
          </div>

          {/* 1px Divider Feature Grid with Top Focus Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, highlights.length))}, minmax(0, 1fr))`,
              gap: 1,
              background: theme.border,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {highlights.map((card, idx) => {
              const isFocused = idx === cursorTargetIndex && frame >= 48;
              const cardIn = spring({
                frame: Math.max(0, frame - 8 - idx * 5),
                fps,
                config: { damping: 18, stiffness: 120 },
              });
              return (
                <div
                  key={idx}
                  style={{
                    padding: '28px 30px',
                    background: isFocused ? theme.surfaceElevated : theme.surface,
                    borderTop: `3px solid ${isFocused ? theme.accent : 'transparent'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    opacity: cardIn,
                    transform: `translateY(${interpolate(cardIn, [0, 1], [14, 0])}px)`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 25, fontWeight: 700, color: theme.textPrimary, letterSpacing: '-0.02em' }}>
                      {card.title}
                    </div>
                    {card.badge ? (
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 5,
                          border: `1px solid ${isFocused ? theme.accent : theme.border}`,
                          background: isFocused ? theme.accentSoft : theme.surfaceInset,
                          color: isFocused ? theme.accent : theme.textMuted,
                          fontFamily: theme.fontMono,
                          fontSize: 15,
                          fontWeight: 600,
                        }}
                      >
                        {card.badge}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 20, lineHeight: 1.5, color: theme.textSecondary }}>
                    {card.description}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Animated SVG Cursor + Restrained Click Ripple */}
          <div
            style={{
              position: 'absolute',
              left: cursorX,
              top: cursorY,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            {frame >= 52 ? (
              <div
                style={{
                  position: 'absolute',
                  left: -24,
                  top: -24,
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  border: `2px solid ${theme.accent}`,
                  transform: `scale(${interpolate(clickPulse, [0, 1], [0.35, 1.45])})`,
                  opacity: interpolate(clickPulse, [0, 1], [0.85, 0]),
                }}
              />
            ) : null}
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <path
                d="M4 3L23 13.5L14.5 16L11.5 24.5L4 3Z"
                fill={theme.isLight ? '#141416' : '#f4f4f5'}
                stroke={theme.isLight ? '#ffffff' : '#09090b'}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
