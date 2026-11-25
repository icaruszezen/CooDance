import React, { useEffect, useState } from 'react';
import {
  Img,
  continueRender,
  delayRender,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { ResolvedOverlay, resolveMediaUrl } from '../timelineSync';
import { VideoThemeTokens } from '../themes';

interface OverlayItemRendererProps {
  overlay: ResolvedOverlay;
  theme: VideoThemeTokens;
  mediaBaseUrl: string;
}

const LottieOverlayContent: React.FC<{ src: string }> = ({ src }) => {
  const [data, setData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender(`Load Lottie ${src}`));

  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json && typeof json === 'object' && 'layers' in json) {
          setData(json as LottieAnimationData);
        }
      })
      .catch(() => {
        // Non-fatal fallback
      })
      .finally(() => {
        continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [src, handle]);

  if (!data) return null;
  return <Lottie animationData={data} loop style={{ width: '100%', height: '100%' }} />;
};

const ARROW_ROTATIONS: Record<string, number> = {
  right: 0,
  'bottom-right': 45,
  down: 90,
  'bottom-left': 135,
  left: 180,
  'top-left': 225,
  up: 270,
  'top-right': 315,
};

const SingleOverlay: React.FC<OverlayItemRendererProps> = ({
  overlay,
  theme,
  mediaBaseUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = frame - overlay.startFrame;
  const remaining = overlay.endFrame - frame;

  const enter = spring({ frame: Math.max(0, localFrame), fps, config: { damping: 18, stiffness: 150 } });
  const exit = interpolate(remaining, [0, Math.min(12, Math.floor(fps * 0.2))], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(enter, exit);

  const leftPx = overlay.x * 1920;
  const topPx = overlay.y * 1080;
  const widthPx = overlay.width ? overlay.width * 1920 : undefined;
  const heightPx = overlay.height ? overlay.height * 1080 : undefined;
  const color = overlay.color || theme.accent;

  const slideY = overlay.animation === 'slide-up' ? interpolate(enter, [0, 1], [18, 0]) : 0;
  const scale = overlay.animation === 'pop' ? interpolate(enter, [0, 1], [0.9, 1]) : 1;

  if (overlay.type === 'highlight-box') {
    return (
      <div
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          width: widthPx || 360,
          height: heightPx || 200,
          borderRadius: 10,
          border: `2.5px solid ${color}`,
          background: `${color}12`,
          opacity,
          transform: `scale(${scale})`,
          boxSizing: 'border-box',
        }}
      >
        {overlay.text ? (
          <div
            style={{
              position: 'absolute',
              top: -38,
              left: 0,
              padding: '5px 12px',
              borderRadius: 6,
              background: color,
              color: '#09090b',
              fontFamily: theme.fontSans,
              fontSize: 19,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {overlay.text}
          </div>
        ) : null}
      </div>
    );
  }

  if (overlay.type === 'arrow') {
    const rot = ARROW_ROTATIONS[overlay.arrowDirection || 'right'] ?? 0;
    return (
      <div
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          opacity,
          transform: `translate(-50%, -50%) scale(${scale}) rotate(${rot}deg)`,
        }}
      >
        <svg width="104" height="56" viewBox="0 0 110 60" fill="none">
          <path
            d="M8 30H94M94 30L68 10M94 30L68 50"
            stroke={color}
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  if (overlay.type === 'badge') {
    return (
      <div
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          transform: `translate(-50%, -50%) translateY(${slideY}px) scale(${scale})`,
          opacity,
          padding: '10px 18px',
          borderRadius: 10,
          background: theme.surfaceElevated,
          border: `1px solid ${theme.borderStrong}`,
          color: theme.textPrimary,
          fontFamily: theme.fontSans,
          fontSize: 20,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          whiteSpace: 'nowrap',
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span>{overlay.text || overlay.label}</span>
      </div>
    );
  }

  if (overlay.type === 'logo' && overlay.assetPath) {
    const src = resolveMediaUrl(mediaBaseUrl, overlay.assetPath);
    return (
      <div
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          width: widthPx || 116,
          height: heightPx || 116,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity,
          borderRadius: 14,
          background: theme.surfaceElevated,
          border: `1px solid ${theme.borderStrong}`,
          padding: 16,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 14px 36px rgba(0,0,0,0.28)',
        }}
      >
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    );
  }

  if (overlay.type === 'lottie' && overlay.assetPath) {
    const src = resolveMediaUrl(mediaBaseUrl, overlay.assetPath);
    return (
      <div
        style={{
          position: 'absolute',
          left: leftPx,
          top: topPx,
          width: widthPx || 180,
          height: heightPx || 180,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity,
        }}
      >
        <LottieOverlayContent src={src} />
      </div>
    );
  }

  // Default: `callout` or `text-card`
  return (
    <div
      style={{
        position: 'absolute',
        left: leftPx,
        top: topPx,
        transform: `translate(-50%, -50%) translateY(${slideY}px) scale(${scale})`,
        opacity,
        maxWidth: 460,
        padding: '18px 24px',
        borderRadius: 10,
        background: theme.subtitleBg,
        border: '1px solid rgba(255,255,255,0.12)',
        borderLeft: `3px solid ${color}`,
        boxShadow: '0 16px 42px rgba(0,0,0,0.36)',
        fontFamily: theme.fontSans,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: theme.subtitleText, lineHeight: 1.3 }}>
        {overlay.text || overlay.label}
      </div>
      {overlay.subtext ? (
        <div style={{ marginTop: 6, fontSize: 18, color: 'rgba(228,228,231,0.78)', lineHeight: 1.4 }}>
          {overlay.subtext}
        </div>
      ) : null}
    </div>
  );
};

interface OverlayLayerProps {
  overlays: ResolvedOverlay[];
  theme: VideoThemeTokens;
  mediaBaseUrl: string;
}

export const OverlayLayer: React.FC<OverlayLayerProps> = ({
  overlays,
  theme,
  mediaBaseUrl,
}) => {
  const frame = useCurrentFrame();
  const active = overlays.filter((ov) => frame >= ov.startFrame && frame <= ov.endFrame);
  if (active.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      {active.map((ov) => (
        <SingleOverlay key={ov.id} overlay={ov} theme={theme} mediaBaseUrl={mediaBaseUrl} />
      ))}
    </div>
  );
};
