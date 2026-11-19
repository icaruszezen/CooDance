import fs from 'node:fs';
import { runFfmpeg } from './ffmpeg.js';

export interface RmsTrimOptions {
  sampleRate?: number;
  windowMs?: number;
  silenceThresholdDb?: number;
  maxInternalPauseMs?: number;
  keepPauseMs?: number;
  edgePadMs?: number;
  fadeMs?: number;
}

export interface RmsTrimResult {
  samples: Int16Array;
  sampleRate: number;
  rawDurationSec: number;
  trimmedDurationSec: number;
  trimmedMs: number;
}

/**
 * Decodes any audio file (mp3/wav/ogg/m4a) into mono 16-bit signed PCM via FFmpeg.
 */
export async function decodeAudioToPcm16(
  inputPath: string,
  sampleRate = 24000,
  ffmpegCustom?: { ffmpegPath?: string; ffprobePath?: string },
): Promise<Int16Array> {
  const tmpPcm = `${inputPath}.${Date.now()}.pcm`;
  try {
    await runFfmpeg(
      [
        '-y',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-ar',
        String(sampleRate),
        '-f',
        's16le',
        tmpPcm,
      ],
      ffmpegCustom,
    );
    const buf = fs.readFileSync(tmpPcm);
    const count = Math.floor(buf.byteLength / 2);
    const samples = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      samples[i] = buf.readInt16LE(i * 2);
    }
    return samples;
  } finally {
    if (fs.existsSync(tmpPcm)) {
      fs.unlinkSync(tmpPcm);
    }
  }
}

/**
 * Encodes mono 16-bit PCM into a standard RIFF WAV Buffer.
 */
export function encodePcm16ToWavBuffer(samples: Int16Array, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}

/**
 * Sample-accurate 10ms RMS energy silence & breath-gap trimmer with micro fade-in/out.
 * Matches spec: "利用音频分析（10ms RMS 能量检测）自动切除句首、句尾死静音以及句中过长停顿气口，并做微淡入淡出防止爆音"
 */
export function trimSilenceAndBreaths(
  input: Int16Array,
  options: RmsTrimOptions = {},
): RmsTrimResult {
  const sampleRate = options.sampleRate ?? 24000;
  const windowMs = options.windowMs ?? 10;
  const silenceThresholdDb = options.silenceThresholdDb ?? -38;
  const maxInternalPauseMs = options.maxInternalPauseMs ?? 240;
  const keepPauseMs = options.keepPauseMs ?? 110;
  const edgePadMs = options.edgePadMs ?? 25;
  const fadeMs = options.fadeMs ?? 10;

  const rawDurationSec = input.length / sampleRate;
  if (input.length === 0) {
    return {
      samples: new Int16Array(0),
      sampleRate,
      rawDurationSec: 0,
      trimmedDurationSec: 0,
      trimmedMs: 0,
    };
  }

  const windowSamples = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const numWindows = Math.ceil(input.length / windowSamples);
  const thresholdLinear = Math.pow(10, silenceThresholdDb / 20);

  const isSpeech = new Uint8Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSamples;
    const end = Math.min(input.length, start + windowSamples);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      const norm = input[i] / 32768;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    isSpeech[w] = rms >= thresholdLinear ? 1 : 0;
  }

  let firstSpeech = -1;
  let lastSpeech = -1;
  for (let w = 0; w < numWindows; w++) {
    if (isSpeech[w]) {
      if (firstSpeech === -1) firstSpeech = w;
      lastSpeech = w;
    }
  }

  if (firstSpeech === -1 || lastSpeech === -1) {
    // All quiet: keep a minimal 120ms slice so timeline never collapses to 0
    const keep = Math.min(input.length, Math.round(sampleRate * 0.12));
    const slice = input.slice(0, keep);
    applyMicroFade(slice, sampleRate, fadeMs);
    return {
      samples: slice,
      sampleRate,
      rawDurationSec,
      trimmedDurationSec: slice.length / sampleRate,
      trimmedMs: Math.max(0, Math.round((rawDurationSec - slice.length / sampleRate) * 1000)),
    };
  }

  const padWindows = Math.ceil(edgePadMs / windowMs);
  const startWin = Math.max(0, firstSpeech - padWindows);
  const endWin = Math.min(numWindows - 1, lastSpeech + padWindows);

  const maxPauseWindows = Math.max(2, Math.round(maxInternalPauseMs / windowMs));
  const keepPauseWindows = Math.max(1, Math.round(keepPauseMs / windowMs));

  const chunks: Int16Array[] = [];
  let cursor = startWin;

  while (cursor <= endWin) {
    if (isSpeech[cursor] || cursor < firstSpeech || cursor > lastSpeech) {
      const segStart = cursor;
      while (
        cursor <= endWin &&
        (isSpeech[cursor] || cursor < firstSpeech || cursor > lastSpeech)
      ) {
        cursor++;
      }
      const s0 = segStart * windowSamples;
      const s1 = Math.min(input.length, cursor * windowSamples);
      chunks.push(input.slice(s0, s1));
    } else {
      const gapStart = cursor;
      while (cursor <= endWin && !isSpeech[cursor] && cursor <= lastSpeech) {
        cursor++;
      }
      const gapLen = cursor - gapStart;
      if (gapLen > maxPauseWindows) {
        // Compress excessive internal breath/pause while keeping natural cadence
        const halfKeep = Math.max(1, Math.floor(keepPauseWindows / 2));
        const headEnd = Math.min(input.length, (gapStart + halfKeep) * windowSamples);
        const tailStart = Math.max(0, (cursor - halfKeep) * windowSamples);
        const headSlice = input.slice(gapStart * windowSamples, headEnd);
        const tailSlice = input.slice(tailStart, Math.min(input.length, cursor * windowSamples));
        applyMicroFadeOut(headSlice, sampleRate, Math.min(fadeMs, 8));
        applyMicroFadeIn(tailSlice, sampleRate, Math.min(fadeMs, 8));
        chunks.push(headSlice, tailSlice);
      } else {
        const s0 = gapStart * windowSamples;
        const s1 = Math.min(input.length, cursor * windowSamples);
        chunks.push(input.slice(s0, s1));
      }
    }
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const merged = new Int16Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  applyMicroFade(merged, sampleRate, fadeMs);

  const trimmedDurationSec = merged.length / sampleRate;
  return {
    samples: merged,
    sampleRate,
    rawDurationSec,
    trimmedDurationSec,
    trimmedMs: Math.max(0, Math.round((rawDurationSec - trimmedDurationSec) * 1000)),
  };
}

export function applyMicroFadeIn(samples: Int16Array, sampleRate: number, fadeMs = 10): void {
  const fadeSamples = Math.min(samples.length, Math.round((sampleRate * fadeMs) / 1000));
  for (let i = 0; i < fadeSamples; i++) {
    const gain = i / Math.max(1, fadeSamples);
    samples[i] = Math.round(samples[i] * gain);
  }
}

export function applyMicroFadeOut(samples: Int16Array, sampleRate: number, fadeMs = 10): void {
  const fadeSamples = Math.min(samples.length, Math.round((sampleRate * fadeMs) / 1000));
  const start = samples.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i++) {
    const gain = 1 - i / Math.max(1, fadeSamples);
    samples[start + i] = Math.round(samples[start + i] * gain);
  }
}

export function applyMicroFade(samples: Int16Array, sampleRate: number, fadeMs = 10): void {
  applyMicroFadeIn(samples, sampleRate, fadeMs);
  applyMicroFadeOut(samples, sampleRate, fadeMs);
}

/**
 * Generates normalized peak amplitude bars (0..1) for visual waveform rendering in the timeline.
 */
export function computeWaveformPeaks(samples: Int16Array, barCount = 240): number[] {
  if (samples.length === 0) return Array(barCount).fill(0);
  const blockSize = Math.max(1, Math.floor(samples.length / barCount));
  const peaks: number[] = [];
  let maxPeak = 0.001;
  for (let b = 0; b < barCount; b++) {
    const start = b * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]) / 32768;
      if (v > peak) peak = v;
    }
    peaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }
  return peaks.map((p) => Number((p / maxPeak).toFixed(3)));
}

/**
 * Applies smooth tempo scaling (0.5x .. 2.0x) via FFmpeg `atempo` when speed !== 1.0.
 */
export async function applySpeedWithFfmpeg(
  inputWavPath: string,
  outputWavPath: string,
  speed: number,
  sampleRate = 24000,
  ffmpegCustom?: { ffmpegPath?: string; ffprobePath?: string },
): Promise<void> {
  const clamped = Math.min(2.0, Math.max(0.5, speed));
  if (Math.abs(clamped - 1.0) < 0.005) {
    fs.copyFileSync(inputWavPath, outputWavPath);
    return;
  }
  await runFfmpeg(
    [
      '-y',
      '-i',
      inputWavPath,
      '-filter:a',
      `atempo=${clamped.toFixed(3)}`,
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      outputWavPath,
    ],
    ffmpegCustom,
  );
}
