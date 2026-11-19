import { encodePcm16ToWavBuffer } from '../audioTrim.js';
import type { TtsSynthesisOutput } from './doubao.js';

/**
 * Deterministic zero-config offline speech-cadence PCM synthesizer.
 * Generates natural-duration vocal-cadence audio with realistic leading/trailing silence
 * and punctuation breath gaps so the 10ms RMS trimmer, timeline sync, Remotion preview,
 * and H.264 MP4 rendering work 100% offline without external API keys.
 */
export function synthesizeWithLocalFallback(
  text: string,
  voice = 'studio-warm-zh',
  sampleRate = 24000,
): TtsSynthesisOutput {
  // Estimate realistic Chinese/English speaking cadence (~4.3 Chinese chars/sec or ~2.6 English words/sec)
  const chars = Array.from(text.trim());
  const basePitch =
    voice.includes('female') || voice.includes('Xiaoxiao')
      ? 235
      : voice.includes('male')
        ? 148
        : 192;

  interface SegmentSpec {
    kind: 'syllable' | 'pause';
    durationSec: number;
    freq: number;
    formant: number;
  }

  const segments: SegmentSpec[] = [];
  // Intentional leading silence so RMS trimmer exercises dead-silence removal
  segments.push({ kind: 'pause', durationSec: 0.14, freq: 0, formant: 0 });

  let seed = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const code = ch.charCodeAt(0);
    seed = (seed * 31 + code) % 9973;

    if (/[，,、；;]/.test(ch)) {
      segments.push({ kind: 'pause', durationSec: 0.34, freq: 0, formant: 0 });
    } else if (/[。！？.!?]/.test(ch)) {
      segments.push({ kind: 'pause', durationSec: 0.38, freq: 0, formant: 0 });
    } else if (/\s/.test(ch)) {
      segments.push({ kind: 'pause', durationSec: 0.05, freq: 0, formant: 0 });
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      // CJK syllable (~205ms)
      const pitchShift = ((seed % 11) - 5) * 6;
      segments.push({
        kind: 'syllable',
        durationSec: 0.195 + (seed % 4) * 0.015,
        freq: basePitch + pitchShift,
        formant: 580 + (seed % 5) * 140,
      });
    } else {
      // Latin/digit character (~82ms)
      const pitchShift = ((seed % 7) - 3) * 5;
      segments.push({
        kind: 'syllable',
        durationSec: 0.082,
        freq: basePitch + pitchShift,
        formant: 650 + (seed % 4) * 120,
      });
    }
  }

  // Intentional trailing silence so RMS trimmer cleanly trims tail
  segments.push({ kind: 'pause', durationSec: 0.18, freq: 0, formant: 0 });

  const totalSamples = Math.max(
    Math.round(sampleRate * 0.6),
    segments.reduce((acc, seg) => acc + Math.round(seg.durationSec * sampleRate), 0),
  );
  const pcm = new Int16Array(totalSamples);

  let cursor = 0;
  let phase1 = 0;
  let phase2 = 0;
  let phase3 = 0;

  for (const seg of segments) {
    const len = Math.round(seg.durationSec * sampleRate);
    if (seg.kind === 'pause') {
      cursor += len;
      continue;
    }

    for (let i = 0; i < len && cursor + i < pcm.length; i++) {
      const t = i / Math.max(1, len);
      // Smooth vocal syllable envelope (attack + sustain + release)
      const env = Math.sin(Math.PI * Math.pow(t, 0.85)) * (0.85 + 0.15 * Math.sin(t * Math.PI * 3));
      const f0 = seg.freq * (1 + 0.03 * Math.sin(t * Math.PI * 2));
      phase1 += (2 * Math.PI * f0) / sampleRate;
      phase2 += (2 * Math.PI * (f0 * 2)) / sampleRate;
      phase3 += (2 * Math.PI * seg.formant) / sampleRate;

      const wave =
        0.52 * Math.sin(phase1) +
        0.28 * Math.sin(phase2) +
        0.16 * Math.sin(phase3) * Math.sin(phase1);
      const sample = Math.max(-1, Math.min(1, wave * env * 0.34));
      pcm[cursor + i] = Math.round(sample * 32767);
    }
    cursor += len;
  }

  return {
    audioBuffer: encodePcm16ToWavBuffer(pcm, sampleRate),
    extension: 'wav',
  };
}
