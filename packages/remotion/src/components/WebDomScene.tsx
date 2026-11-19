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
  const clickPulse = spring({ frame: Math.max(0, frame - 52), fps, config: { damping: 12, stiffness: 180 } });

  const targetX = 320 + Math.min(2, Math.max(0, cursorTargetIndex)) * 480;
  const cursorX = interpolate(cursorMove, [0, 1], [1280, targetX]);
  const cursorY = interpolate(cursorMove, [0, 1], [680, 520]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '56px 96px 164px',
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
          borderRadius: 24,
          overflow: 'hidden',
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 32px 84px rgba(0,0,0,0.42)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          opacity: windowIn,
          transform: `scale(${interpolate(windowIn, [0, 1], [0.96, 1])})`,
        }}
      >
        {/* Browser Chrome */}
        <div
          style={{
            height: 58,
            background: theme.surfaceElevated,
            borderBottom: `1px solid ${theme.border}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', gap: 9 }}>
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#10b981' }} />
          </div>

          <div
            style={{
              flex: 1,
              height: 36,
              borderRadius: 10,
              background: theme.bg,
              border: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 18px',
              fontFamily: theme.fontMono,
              fontSize: 18,
              color: theme.textMuted,
            }}
          >
            {url}
          </div>

          <div style={{ fontSize: 18, fontWeight: 600, color: theme.textSecondary }}>
            {pageTitle}
          </div>
        </div>

        {/* Mocked Interactive DOM Content */}
        <div
          style={{
            flex: 1,
            padding: '54px 64px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 36 }}>
            <div style={{ maxWidth: 1120 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 48,
                  fontWeight: 800,
                  lineHeight: 1.2,
                  color: theme.textPrimary,
                }}
              >
                {heading}
              </h2>
              {description ? (
                <p
                  style={{
                    margin: '18px 0 0',
                    fontSize: 25,
                    lineHeight: 1.5,
                    color: theme.textSecondary,
                  }}
                >
                  {description}
                </p>
              ) : null}
            </div>

            <div
              style={{
                padding: '16px 30px',
                borderRadius: 14,
                background: theme.accent,
                color: theme.accentText,
                fontSize: 22,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {ctaLabel}
            </div>
          </div>

          {/* Highlight Feature Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, highlights.length))}, minmax(0, 1fr))`,
              gap: 24,
            }}
          >
            {highlights.map((card, idx) => {
              const isFocused = idx === cursorTargetIndex && frame >= 48;
              const cardIn = spring({
                frame: Math.max(0, frame - 10 - idx * 6),
                fps,
                config: { damping: 17, stiffness: 120 },
              });
              return (
                <div
                  key={idx}
                  style={{
                    padding: '28px 30px',
                    borderRadius: 18,
                    background: isFocused ? theme.surfaceElevated : theme.bg,
                    border: `1px solid ${isFocused ? theme.accent : theme.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    opacity: cardIn,
                    transform: `translateY(${interpolate(cardIn, [0, 1], [22, 0])}px) scale(${isFocused ? 1.02 : 1})`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: theme.textPrimary }}>
                      {card.title}
                    </div>
                    {card.badge ? (
                      <span
                        style={{
                          padding: '5px 12px',
                          borderRadius: 8,
                          background: theme.accentSoft,
                          color: theme.accent,
                          fontFamily: theme.fontMono,
                          fontSize: 16,
                          fontWeight: 700,
                        }}
                      >
                        {card.badge}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 21, lineHeight: 1.5, color: theme.textSecondary }}>
                    {card.description}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Animated SVG Cursor + Click Ripple */}
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
                  left: -26,
                  top: -26,
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  border: `3px solid ${theme.accent}`,
                  transform: `scale(${interpolate(clickPulse, [0, 1], [0.3, 1.5])})`,
                  opacity: interpolate(clickPulse, [0, 1], [0.9, 0]),
                }}
              />
            ) : null}
            <svg width="34" height="34" viewBox="0 0 28 28" fill="none">
              <path
                d="M4 3L23 13.5L14.5 16L11.5 24.5L4 3Z"
                fill="#ffffff"
                stroke="#0f172a"
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
