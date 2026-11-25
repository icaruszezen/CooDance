import React from 'react';
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { VideoThemeTokens } from '../themes';
import { resolveMediaUrl } from '../timelineSync';

interface TitleCardSceneProps {
  props: Record<string, unknown>;
  theme: VideoThemeTokens;
  mediaBaseUrl: string;
}

export const TitleCardScene: React.FC<TitleCardSceneProps> = ({
  props,
  theme,
  mediaBaseUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = String(props.eyebrow || 'CODE-AS-VIDEO');
  const heading = String(props.heading || 'CooDance Studio');
  const subheading = props.subheading ? String(props.subheading) : '';
  const badge = props.badge ? String(props.badge) : '';
  const logoAsset = props.logoAsset ? String(props.logoAsset) : '';

  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 120 } });
  const subIntro = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 18, stiffness: 110 } });
  const ruleIntro = spring({ frame: Math.max(0, frame - 3), fps, config: { damping: 20, stiffness: 100 } });

  const lineWidth = interpolate(ruleIntro, [0, 1], [48, 160]);
  const titleOpacity = interpolate(intro, [0, 1], [0.85, 1]);
  const subOpacity = interpolate(subIntro, [0, 1], [0.7, 1]);
  const logoUrl = logoAsset ? resolveMediaUrl(mediaBaseUrl, logoAsset) : '';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px 120px 156px',
        boxSizing: 'border-box',
        fontFamily: theme.fontSans,
        position: 'relative',
      }}
    >
      {/* Top 1px Full-Width Editorial Header Rail */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 24,
          borderBottom: `1px solid ${theme.border}`,
          opacity: titleOpacity,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: theme.accent,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: theme.fontMono,
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: '0.14em',
              color: theme.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {badge ? (
            <span
              style={{
                fontFamily: theme.fontMono,
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: theme.textMuted,
                padding: '6px 14px',
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
              }}
            >
              {badge}
            </span>
          ) : null}
          {logoUrl ? (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: theme.surface,
                border: `1px solid ${theme.borderStrong}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8,
                boxSizing: 'border-box',
              }}
            >
              <Img
                src={logoUrl}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Typographic Hero Block */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingTop: 24,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: heading.length > 18 ? 82 : 96,
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-0.035em',
            color: theme.textPrimary,
            maxWidth: 1560,
            opacity: titleOpacity,
            transform: `translateY(${interpolate(intro, [0, 1], [18, 0])}px)`,
          }}
        >
          {heading}
        </h1>

        {/* 2px Animated Accent Hairline Rule */}
        <div
          style={{
            marginTop: 42,
            marginBottom: 34,
            width: '100%',
            maxWidth: 640,
            height: 2,
            background: theme.border,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: lineWidth,
              height: '100%',
              background: theme.accent,
            }}
          />
        </div>

        {/* Subheading */}
        {subheading ? (
          <p
            style={{
              margin: 0,
              fontSize: 32,
              lineHeight: 1.5,
              fontWeight: 400,
              letterSpacing: '-0.01em',
              color: theme.textSecondary,
              maxWidth: 1320,
              opacity: subOpacity,
              transform: `translateY(${interpolate(subIntro, [0, 1], [14, 0])}px)`,
            }}
          >
            {subheading}
          </p>
        ) : null}
      </div>
    </div>
  );
};
