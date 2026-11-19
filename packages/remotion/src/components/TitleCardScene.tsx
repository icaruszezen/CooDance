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

  const intro = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const subIntro = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 18, stiffness: 110 } });
  const badgeIntro = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 130 } });

  const lineWidth = interpolate(intro, [0, 1], [64, 128]);
  const titleOpacity = interpolate(intro, [0, 1], [0.88, 1]);
  const subOpacity = interpolate(subIntro, [0, 1], [0.72, 1]);
  const badgeOpacity = interpolate(badgeIntro, [0, 1], [0.76, 0.94]);
  const logoUrl = logoAsset ? resolveMediaUrl(mediaBaseUrl, logoAsset) : '';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '110px 140px 170px',
        boxSizing: 'border-box',
        fontFamily: theme.fontSans,
        position: 'relative',
      }}
    >
      {/* Subtle editorial top-right technical marker */}
      <div
        style={{
          position: 'absolute',
          top: 72,
          right: 120,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          opacity: badgeOpacity,
          transform: `translateY(${interpolate(badgeIntro, [0, 1], [10, 0])}px)`,
        }}
      >
        {badge ? (
          <div
            style={{
              padding: '10px 22px',
              borderRadius: 999,
              background: theme.surfaceElevated,
              border: `1px solid ${theme.border}`,
              color: theme.textSecondary,
              fontFamily: theme.fontMono,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.06em',
            }}
          >
            {badge}
          </div>
        ) : null}
      </div>

      {/* Logo + Eyebrow row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: 34,
          opacity: titleOpacity,
          transform: `translateY(${interpolate(intro, [0, 1], [14, 0])}px)`,
        }}
      >
        {logoUrl ? (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: theme.surfaceElevated,
              border: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              boxSizing: 'border-box',
            }}
          >
            <Img
              src={logoUrl}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        ) : null}
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '0.16em',
            color: theme.accent,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
      </div>

      {/* Main Heading */}
      <h1
        style={{
          margin: 0,
          fontSize: heading.length > 18 ? 78 : 92,
          fontWeight: 800,
          lineHeight: 1.14,
          letterSpacing: '-0.025em',
          color: theme.textPrimary,
          maxWidth: 1520,
          opacity: titleOpacity,
          transform: `translateY(${interpolate(intro, [0, 1], [22, 0])}px)`,
        }}
      >
        {heading}
      </h1>

      {/* Accent divider rule */}
      <div
        style={{
          marginTop: 38,
          marginBottom: 34,
          width: lineWidth,
          height: 6,
          borderRadius: 3,
          background: theme.accent,
        }}
      />

      {/* Subheading */}
      {subheading ? (
        <p
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: 1.5,
            fontWeight: 500,
            color: theme.textSecondary,
            maxWidth: 1320,
            opacity: subOpacity,
            transform: `translateY(${interpolate(subIntro, [0, 1], [16, 0])}px)`,
          }}
        >
          {subheading}
        </p>
      ) : null}
    </div>
  );
};
