import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, Volume2, VolumeX } from 'lucide-react';
import { cn } from './cn';

export interface AudioWaveformPlayerHandle {
  seekAndPlay: (sec: number) => void;
}

export interface AudioWaveformPlayerProps {
  src: string;
  peaks?: number[];
  durationHintSec?: number;
  theme: 'dark' | 'light';
  className?: string;
}

const RATES = [1, 1.25, 1.5, 0.75] as const;

function formatClock(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const AudioWaveformPlayer = React.forwardRef<
  AudioWaveformPlayerHandle,
  AudioWaveformPlayerProps
>(({ src, peaks, durationHintSec = 0, theme, className }, ref) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationHintSec);
  const [rateIdx, setRateIdx] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(400);

  const effectiveDuration = Math.max(0.01, duration || durationHintSec || 1);
  const progressRatio = Math.min(1, Math.max(0, currentTime / effectiveDuration));

  const bars = useMemo(() => {
    if (peaks && peaks.length > 0) {
      const target = 116;
      if (peaks.length <= target) return peaks;
      const step = peaks.length / target;
      const out: number[] = [];
      for (let i = 0; i < target; i++) {
        const idx = Math.min(peaks.length - 1, Math.floor(i * step));
        out.push(peaks[idx]);
      }
      return out;
    }
    return Array.from({ length: 96 }, (_, i) => {
      const wave = 0.25 + 0.55 * Math.abs(Math.sin(i * 0.34) * Math.cos(i * 0.13));
      return Number(wave.toFixed(2));
    });
  }, [peaks]);

  useEffect(() => {
    setDuration(durationHintSec);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [src, durationHintSec]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCanvasWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      seekAndPlay(sec: number) {
        const audio = audioRef.current;
        if (!audio) return;
        const clamped = Math.max(0, Math.min(effectiveDuration, sec));
        audio.currentTime = clamped;
        setCurrentTime(clamped);
        void audio.play().catch(() => {});
      },
    }),
    [effectiveDuration],
  );

  // Paint Retina HiDPI waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const height = 42;
    const width = Math.max(120, canvasWidth);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isLight = theme === 'light';
    const playedColor = isLight ? '#b57913' : '#d99b26';
    const unplayedColor = isLight ? 'rgba(20, 20, 22, 0.18)' : 'rgba(255, 255, 255, 0.18)';
    const hoverColor = isLight ? 'rgba(181, 121, 19, 0.45)' : 'rgba(217, 155, 38, 0.48)';
    const playheadColor = isLight ? '#18181b' : '#f4f4f5';

    const count = bars.length;
    const gap = 2;
    const barW = Math.max(1.5, (width - gap * (count - 1)) / count);
    const centerY = height / 2;

    for (let i = 0; i < count; i++) {
      const ratio = (i + 0.5) / count;
      const amp = Math.max(0.1, Math.min(1, bars[i]));
      const barH = Math.max(3, amp * (height - 8));
      const x = i * (barW + gap);
      const y = centerY - barH / 2;

      if (ratio <= progressRatio) {
        ctx.fillStyle = playedColor;
      } else if (hoverRatio !== null && ratio <= hoverRatio) {
        ctx.fillStyle = hoverColor;
      } else {
        ctx.fillStyle = unplayedColor;
      }

      const r = Math.min(1.5, barW / 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, r);
      ctx.fill();
    }

    // Crisp vertical playhead cursor
    const px = Math.min(width - 1, Math.max(1, progressRatio * width));
    ctx.fillStyle = playheadColor;
    ctx.fillRect(px - 0.75, 2, 1.5, height - 4);
  }, [bars, canvasWidth, progressRatio, hoverRatio, theme]);

  const ratioFromPointer = useCallback((clientX: number): number => {
    const wrap = wrapRef.current;
    if (!wrap) return 0;
    const rect = wrap.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
  }, []);

  const seekByRatio = useCallback(
    (ratio: number) => {
      const targetSec = ratio * effectiveDuration;
      setCurrentTime(targetSec);
      if (audioRef.current) {
        audioRef.current.currentTime = targetSec;
      }
    },
    [effectiveDuration],
  );

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const cycleRate = () => {
    const nextIdx = (rateIdx + 1) % RATES.length;
    setRateIdx(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = RATES[nextIdx];
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-[8px] bg-code border border-border-subtle p-2.5 select-none',
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Interactive Retina Waveform Canvas */}
      <div
        ref={wrapRef}
        className="relative w-full h-[42px] cursor-pointer"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          const r = ratioFromPointer(e.clientX);
          setHoverRatio(r);
          seekByRatio(r);
        }}
        onPointerMove={(e) => {
          const r = ratioFromPointer(e.clientX);
          setHoverRatio(r);
          if (dragging) {
            seekByRatio(r);
          }
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          setDragging(false);
        }}
        onPointerLeave={() => {
          if (!dragging) setHoverRatio(null);
        }}
      >
        <canvas ref={canvasRef} className="block w-full h-[42px]" />

        {hoverRatio !== null ? (
          <div
            className="pointer-events-none absolute -top-6 -translate-x-1/2 px-1.5 py-0.5 rounded-[4px] bg-elevated border border-border-strong text-[10px] font-mono tabular-nums text-text-primary shadow-studio-sm"
            style={{ left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%` }}
          >
            {formatClock(hoverRatio * effectiveDuration)}
          </div>
        ) : null}
      </div>

      {/* Transport Controls */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] bg-primary text-primary-ink hover:bg-primary-hover cursor-pointer transition-colors"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} className="translate-x-[0.5px]" />}
          </button>

          <button
            type="button"
            onClick={restart}
            aria-label="Restart"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-text-secondary hover:bg-hover hover:text-text-primary cursor-pointer transition-colors"
          >
            <SkipBack size={13} />
          </button>

          <span className="ml-1 font-mono text-[11.5px] tabular-nums text-text-primary font-medium">
            {formatClock(currentTime)}
            <span className="text-text-muted"> / {formatClock(effectiveDuration)}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cycleRate}
            className="inline-flex h-6 px-1.5 items-center justify-center rounded-[5px] font-mono text-[11px] text-text-secondary hover:bg-hover hover:text-text-primary cursor-pointer transition-colors"
            title="Playback Rate"
          >
            {RATES[rateIdx]}×
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-text-secondary hover:bg-hover hover:text-text-primary cursor-pointer transition-colors"
          >
            {muted ? <VolumeX size={13} className="text-danger" /> : <Volume2 size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
});

AudioWaveformPlayer.displayName = 'AudioWaveformPlayer';
