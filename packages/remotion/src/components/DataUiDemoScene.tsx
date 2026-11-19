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

  const headerIn = spring({ frame, fps, config: { damping: 17, stiffness: 120 } });

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
        padding: '74px 120px 176px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 36,
        fontFamily: theme.fontSans,
      }}
    >
      {/* Header */}
      <div
        style={{
          opacity: headerIn,
          transform: `translateY(${interpolate(headerIn, [0, 1], [20, 0])}px)`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 54,
            fontWeight: 800,
            color: theme.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          {heading}
        </h2>
        {subheading ? (
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 27,
              color: theme.textSecondary,
              fontWeight: 500,
            }}
          >
            {subheading}
          </p>
        ) : null}
      </div>

      {/* Metrics Grid */}
      {variant === 'metrics' ? (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 28,
            alignContent: 'center',
          }}
        >
          {metrics.map((m, idx) => {
            const cardAnim = spring({
              frame: Math.max(0, frame - 8 - idx * 6),
              fps,
              config: { damping: 16, stiffness: 120 },
            });
            const accentColor =
              m.accent === 'success'
                ? theme.success
                : m.accent === 'warning'
                  ? theme.accent
                  : m.accent === 'primary'
                    ? theme.secondary
                    : theme.textSecondary;

            return (
              <div
                key={idx}
                style={{
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 22,
                  padding: '38px 42px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16,
                  opacity: cardAnim,
                  transform: `translateY(${interpolate(cardAnim, [0, 1], [26, 0])}px)`,
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 600, color: theme.textMuted }}>{m.label}</div>
                <div
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 66,
                    fontWeight: 800,
                    color: theme.textPrimary,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {m.value}
                </div>
                {m.delta ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignSelf: 'flex-start',
                      padding: '6px 16px',
                      borderRadius: 999,
                      background: theme.surfaceElevated,
                      color: accentColor,
                      fontSize: 20,
                      fontWeight: 600,
                    }}
                  >
                    {m.delta}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Pipeline Steps */}
      {variant === 'pipeline' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22, justifyContent: 'center' }}>
          {pipelineSteps.map((step, idx) => {
            const stepAnim = spring({
              frame: Math.max(0, frame - 10 - idx * 9),
              fps,
              config: { damping: 16, stiffness: 120 },
            });
            const statusColor =
              step.status === 'done'
                ? theme.success
                : step.status === 'active'
                  ? theme.accent
                  : theme.textMuted;

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 28,
                  padding: '32px 38px',
                  borderRadius: 20,
                  background: step.status === 'active' ? theme.surfaceElevated : theme.surface,
                  border: `1px solid ${theme.border}`,
                  opacity: stepAnim,
                  transform: `translateX(${interpolate(stepAnim, [0, 1], [-30, 0])}px)`,
                }}
              >
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    background: theme.bg,
                    border: `2px solid ${statusColor}`,
                    color: statusColor,
                    fontFamily: theme.fontMono,
                    fontSize: 24,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {step.status === 'done' ? '✓' : `0${idx + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: theme.textPrimary }}>{step.title}</div>
                  <div style={{ marginTop: 8, fontSize: 23, color: theme.textSecondary }}>{step.subtitle}</div>
                </div>
                <div
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    background: theme.bg,
                    color: statusColor,
                    fontFamily: theme.fontMono,
                    fontSize: 19,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {step.status}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Terminal CLI Progressive Typing */}
      {variant === 'terminal' ? (
        <div
          style={{
            flex: 1,
            borderRadius: 22,
            overflow: 'hidden',
            background: '#0a0d12',
            border: `1px solid ${theme.border}`,
            boxShadow: '0 28px 72px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: 48,
              background: '#141923',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              padding: '0 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: '#10b981' }} />
            </div>
            <div style={{ fontFamily: theme.fontMono, fontSize: 18, color: '#94a3b8' }}>
              coodance-cli — zsh
            </div>
            <div style={{ width: 48 }} />
          </div>

          <div
            style={{
              flex: 1,
              padding: '34px 40px',
              fontFamily: theme.fontMono,
              fontSize: 25,
              lineHeight: 1.75,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {terminalLines.map((line, idx) => {
              const revealFrame = Math.round((idx / Math.max(1, terminalLines.length)) * (durationInFrames * 0.65));
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
                    color: isCmd ? '#f59e0b' : isOk ? '#34d399' : '#cbd5e1',
                    fontWeight: isCmd ? 700 : 500,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {line.slice(0, charsShown)}
                  {isCmd && charsShown < line.length ? '▋' : ''}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Bar Chart */}
      {variant === 'bar-chart' ? (
        <div
          style={{
            flex: 1,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 24,
            padding: '44px 52px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 26,
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
                  <div style={{ width: 260, fontSize: 24, fontWeight: 600, color: theme.textSecondary }}>
                    {bar.label}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 12,
                      background: theme.bg,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${widthPct.toFixed(1)}%`,
                        height: '100%',
                        borderRadius: 12,
                        background: bar.highlight ? theme.accent : theme.secondary,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: 120,
                      textAlign: 'right',
                      fontFamily: theme.fontMono,
                      fontSize: 26,
                      fontWeight: 700,
                      color: theme.textPrimary,
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
