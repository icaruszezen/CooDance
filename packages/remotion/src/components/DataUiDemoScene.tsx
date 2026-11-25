import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoThemeTokens } from '../themes';

interface DataUiDemoSceneProps {
  props: Record<string, unknown>;
  durationInFrames: number;
  theme: VideoThemeTokens;
}

export const DataUiDemoScene: React.FC<DataUiDemoSceneProps> = ({
  props,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const variant = String(props.variant || 'metrics');
  const heading = String(props.heading || '数据与自动化指标');
  const subheading = props.subheading ? String(props.subheading) : '';

  const headerIn = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });

  const metrics = Array.isArray(props.metrics)
    ? (props.metrics as Array<{ label: string; value: string; delta?: string; accent?: string }>)
    : [];
  const pipelineSteps = Array.isArray(props.pipelineSteps)
    ? (props.pipelineSteps as Array<{ title: string; subtitle: string; status: string }>)
    : [];
  const terminalLines = Array.isArray(props.terminalLines)
    ? props.terminalLines.map(String)
    : [];
  const chartData = Array.isArray(props.chartData)
    ? (props.chartData as Array<{ label: string; value: number; unit?: string; highlight?: boolean }>)
    : [];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        padding: '68px 116px 168px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        fontFamily: theme.fontSans,
      }}
    >
      {/* Editorial Header */}
      <div
        style={{
          opacity: headerIn,
          transform: `translateY(${interpolate(headerIn, [0, 1], [16, 0])}px)`,
          paddingBottom: 20,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 52,
            fontWeight: 800,
            color: theme.textPrimary,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
          }}
        >
          {heading}
        </h2>
        {subheading ? (
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 25,
              color: theme.textSecondary,
              fontWeight: 400,
            }}
          >
            {subheading}
          </p>
        ) : null}
      </div>

      {/* Metrics: 1px Hairline Bento Grid (01..04 + subtle dot annotations) */}
      {variant === 'metrics' ? (
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
          {metrics.map((m, idx) => {
            const cardAnim = spring({
              frame: Math.max(0, frame - 6 - idx * 5),
              fps,
              config: { damping: 18, stiffness: 120 },
            });
            const dotColor =
              m.accent === 'success'
                ? theme.success
                : m.accent === 'warning'
                  ? theme.accent
                  : m.accent === 'primary'
                    ? theme.secondary
                    : theme.textMuted;

            return (
              <div
                key={idx}
                style={{
                  background: theme.surface,
                  padding: '38px 44px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 18,
                  opacity: cardAnim,
                  transform: `translateY(${interpolate(cardAnim, [0, 1], [14, 0])}px)`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <span style={{ fontSize: 23, fontWeight: 500, color: theme.textSecondary }}>
                    {m.label}
                  </span>
                  <span
                    style={{
                      fontFamily: theme.fontMono,
                      fontSize: 18,
                      fontWeight: 600,
                      color: theme.textMuted,
                      letterSpacing: '0.06em',
                    }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 68,
                    fontWeight: 700,
                    color: theme.textPrimary,
                    letterSpacing: '-0.035em',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.05,
                  }}
                >
                  {m.value}
                </div>

                {m.delta ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      color: theme.textSecondary,
                      fontSize: 20,
                      fontWeight: 500,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                      }}
                    />
                    <span>{m.delta}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Pipeline Steps: Left 4px Warm Gold Rail Track */}
      {variant === 'pipeline' ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            borderRadius: 14,
            border: `1px solid ${theme.border}`,
            background: theme.surface,
            overflow: 'hidden',
          }}
        >
          {pipelineSteps.map((step, idx) => {
            const stepAnim = spring({
              frame: Math.max(0, frame - 8 - idx * 8),
              fps,
              config: { damping: 18, stiffness: 120 },
            });
            const isActive = step.status === 'active';
            const isDone = step.status === 'done';
            const railColor = isActive
              ? theme.accent
              : isDone
                ? theme.success
                : theme.borderStrong;

            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 32,
                  padding: '28px 42px',
                  background: isActive ? theme.surfaceElevated : theme.surface,
                  borderLeft: `4px solid ${railColor}`,
                  borderBottom: idx < pipelineSteps.length - 1 ? `1px solid ${theme.border}` : 'none',
                  opacity: stepAnim,
                  transform: `translateX(${interpolate(stepAnim, [0, 1], [-20, 0])}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 24,
                    fontWeight: 700,
                    color: isActive ? theme.accent : isDone ? theme.success : theme.textMuted,
                    width: 44,
                    flexShrink: 0,
                  }}
                >
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: theme.textPrimary, letterSpacing: '-0.02em' }}>
                    {step.title}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 22, color: theme.textSecondary }}>
                    {step.subtitle}
                  </div>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    fontFamily: theme.fontMono,
                    fontSize: 18,
                    fontWeight: 600,
                    color: isActive ? theme.accent : isDone ? theme.success : theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: railColor,
                    }}
                  />
                  {step.status}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Terminal CLI Progressive Typing: Neutral Matte Charcoal #0c0c0e */}
      {variant === 'terminal' ? (
        <div
          style={{
            flex: 1,
            borderRadius: 14,
            overflow: 'hidden',
            background: '#0c0c0e',
            border: `1px solid ${theme.isLight ? 'rgba(20,20,22,0.16)' : theme.borderStrong}`,
            boxShadow: '0 20px 56px rgba(0,0,0,0.36)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: 46,
              background: '#141417',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              padding: '0 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 9 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div style={{ fontFamily: theme.fontMono, fontSize: 17, color: '#71717a' }}>
              coodance-cli — zsh
            </div>
            <div style={{ width: 48 }} />
          </div>

          <div
            style={{
              flex: 1,
              padding: '32px 40px',
              fontFamily: theme.fontMono,
              fontSize: 24,
              lineHeight: 1.78,
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
            }}
          >
            {terminalLines.map((line, idx) => {
              const revealFrame = Math.round(
                (idx / Math.max(1, terminalLines.length)) * (durationInFrames * 0.65),
              );
              if (frame < revealFrame) return null;
              const isCmd = line.trim().startsWith('$');
              const isOk = line.trim().startsWith('✔') || line.trim().startsWith('✓');
              const charsShown = isCmd
                ? Math.min(line.length, Math.max(1, Math.floor((frame - revealFrame) * 2.4)))
                : line.length;
              return (
                <div
                  key={idx}
                  style={{
                    color: isCmd ? '#ececef' : isOk ? '#4cb487' : '#a1a1aa',
                    fontWeight: isCmd ? 600 : 400,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {isCmd ? (
                    <>
                      <span style={{ color: '#d99b26' }}>$</span>
                      {line.slice(1, charsShown)}
                    </>
                  ) : (
                    line.slice(0, charsShown)
                  )}
                  {isCmd && charsShown < line.length ? '▋' : ''}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Bar Chart: Restrained Horizontal Architectural Bars */}
      {variant === 'bar-chart' ? (
        <div
          style={{
            flex: 1,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            padding: '40px 48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 28,
          }}
        >
          {(() => {
            const maxVal = Math.max(1, ...chartData.map((d) => d.value));
            return chartData.map((bar, idx) => {
              const barAnim = spring({
                frame: Math.max(0, frame - 8 - idx * 6),
                fps,
                config: { damping: 18, stiffness: 100 },
              });
              const widthPct = (bar.value / maxVal) * 100 * barAnim;
              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <div
                    style={{
                      width: 260,
                      fontSize: 23,
                      fontWeight: bar.highlight ? 600 : 500,
                      color: bar.highlight ? theme.textPrimary : theme.textSecondary,
                    }}
                  >
                    {bar.label}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 22,
                      borderRadius: 4,
                      background: theme.surfaceInset,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${widthPct.toFixed(1)}%`,
                        height: '100%',
                        borderRadius: 4,
                        background: bar.highlight ? theme.accent : theme.textMuted,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: 124,
                      textAlign: 'right',
                      fontFamily: theme.fontMono,
                      fontSize: 25,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      color: bar.highlight ? theme.textPrimary : theme.textSecondary,
                    }}
                  >
                    {bar.value}
                    {bar.unit || ''}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : null}
    </div>
  );
};
