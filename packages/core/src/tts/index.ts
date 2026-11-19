import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AudioTimeline,
  AudioTimelineSentence,
  SubtitleCue,
  TtsProviderId,
  TtsRunOptions,
} from '../types.js';
import { ProjectPaths, ensureProjectDirs } from '../paths.js';
import {
  applySpeedWithFfmpeg,
  computeWaveformPeaks,
  decodeAudioToPcm16,
  encodePcm16ToWavBuffer,
  trimSilenceAndBreaths,
} from '../audioTrim.js';
import { runFfmpeg } from '../ffmpeg.js';
import {
  formatSrtTime,
  parseScriptText,
  splitSentenceForSubtitles,
} from '../scriptParser.js';
import { synthesizeWithDoubao, TtsSynthesisOutput } from './doubao.js';
import { synthesizeWithEdgeTts } from './edge.js';
import { synthesizeWithLocalFallback } from './localSynth.js';

export interface TtsProgressCallback {
  (stage: string, progress: number, message: string, level?: 'info' | 'warn' | 'error' | 'success'): void;
}

const SAMPLE_RATE = 24000;

export function computeSentenceHash(params: {
  provider: TtsProviderId;
  voice: string;
  text: string;
  resourceId?: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .slice(0, 16);
}

async function synthesizeSentenceRaw(
  text: string,
  provider: TtsProviderId,
  voice: string,
  options: TtsRunOptions,
  onLog?: TtsProgressCallback,
): Promise<{ output: TtsSynthesisOutput; effectiveProvider: TtsProviderId }> {
  if (provider === 'doubao') {
    const appId = options.doubaoAppId || process.env.VOLC_TTS_APP_ID || '';
    const accessToken = options.doubaoAccessToken || process.env.VOLC_TTS_ACCESS_TOKEN || '';
    if (appId && accessToken) {
      const output = await synthesizeWithDoubao({
        text,
        appId,
        accessToken,
        resourceId: options.doubaoResourceId || process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0',
        voiceType: voice || 'zh_female_vv_uranus_bigtts',
        endpoint: options.doubaoEndpoint,
        speedRatio: 1.0,
      });
      return { output, effectiveProvider: 'doubao' };
    }
    onLog?.(
      'tts',
      0.1,
      '未检测到火山引擎豆包 2.0 密钥，自动降级为本地演示语音引擎（可在设置页填入 AppID / AccessToken 切换正式配音）。',
      'warn',
    );
    return {
      output: synthesizeWithLocalFallback(text, voice, SAMPLE_RATE),
      effectiveProvider: 'local',
    };
  }

  if (provider === 'edge') {
    try {
      const output = await synthesizeWithEdgeTts(text, voice || 'zh-CN-XiaoxiaoNeural', 1.0);
      return { output, effectiveProvider: 'edge' };
    } catch (err) {
      onLog?.(
        'tts',
        0.1,
        `Edge-TTS 网络不可用 (${err instanceof Error ? err.message : String(err)})，已自动降级为本地演示语音引擎。`,
        'warn',
      );
      return {
        output: synthesizeWithLocalFallback(text, voice, SAMPLE_RATE),
        effectiveProvider: 'local',
      };
    }
  }

  return {
    output: synthesizeWithLocalFallback(text, voice, SAMPLE_RATE),
    effectiveProvider: 'local',
  };
}

/**
 * Full Stage 2 Pipeline (`scripts/tts.mjs` + Studio UI):
 * 1. Parse `script.txt` (notes, paragraph pauses, lines)
 * 2. Per-sentence SHA-256 hash lookup in `cache/tts/`
 * 3. Synthesize missing sentences via Doubao 2.0 / Edge-TTS / Local fallback
 * 4. 10ms RMS silence & internal breath trimming + micro fade-in/out + speed adjustment
 * 5. Merge into `build/voiceover.mp3`
 * 6. Emit `build/audio_timeline.json` and `build/subtitles.srt`
 */
export async function runTtsPipeline(
  paths: ProjectPaths,
  options: TtsRunOptions = {},
  ffmpegCustom?: { ffmpegPath?: string; ffprobePath?: string },
  onProgress?: TtsProgressCallback,
): Promise<AudioTimeline> {
  ensureProjectDirs(paths);

  if (!fs.existsSync(paths.scriptFile)) {
    throw new Error(`script.txt not found at ${paths.scriptFile}`);
  }

  const rawScript = fs.readFileSync(paths.scriptFile, 'utf8');
  const scriptLines = parseScriptText(rawScript, {
    sentencePauseMs: options.sentencePauseMs ?? 220,
    paragraphPauseMs: options.paragraphPauseMs ?? 560,
  });

  if (scriptLines.length === 0) {
    throw new Error('script.txt contains no spoken lines.');
  }

  const requestedProvider: TtsProviderId = options.provider ?? 'doubao';
  const voice =
    options.voice ||
    (requestedProvider === 'doubao'
      ? 'zh_female_vv_uranus_bigtts'
      : requestedProvider === 'edge'
        ? 'zh-CN-XiaoxiaoNeural'
        : 'studio-warm-zh');
  const speed = Math.min(2.0, Math.max(0.5, options.speed ?? 1.05));
  const silenceThresholdDb = options.silenceThresholdDb ?? -38;
  const maxInternalPauseMs = options.maxInternalPauseMs ?? 240;
  const fadeMs = options.fadeMs ?? 10;

  onProgress?.('parse', 0.05, `已解析文案，共 ${scriptLines.length} 句口播`, 'info');

  let effectiveProvider: TtsProviderId = requestedProvider;
  const trimmedClips: Int16Array[] = [];
  const sentences: AudioTimelineSentence[] = [];
  const allSubtitles: SubtitleCue[] = [];
  let timelineCursorSec = 0;
  let subtitleCounter = 1;
  let cacheHits = 0;

  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i];
    const ratio = 0.08 + (i / scriptLines.length) * 0.72;
    const hash = computeSentenceHash({
      provider: requestedProvider,
      voice,
      text: line.text,
      resourceId: requestedProvider === 'doubao' ? options.doubaoResourceId || 'seed-tts-2.0' : undefined,
    });

    const cacheMp3 = path.join(paths.ttsCacheDir, `${hash}.mp3`);
    const cacheWav = path.join(paths.ttsCacheDir, `${hash}.wav`);
    const cacheMeta = path.join(paths.ttsCacheDir, `${hash}.meta.json`);

    let rawAudioFile: string | null = null;
    let cached = false;

    if (!options.forceRegenerate) {
      if (fs.existsSync(cacheMp3)) {
        rawAudioFile = cacheMp3;
        cached = true;
      } else if (fs.existsSync(cacheWav)) {
        rawAudioFile = cacheWav;
        cached = true;
      }
    }

    if (cached) {
      cacheHits++;
      onProgress?.(
        'tts',
        ratio,
        `[${i + 1}/${scriptLines.length}] 命中缓存 (${hash}): ${line.text.slice(0, 22)}...`,
        'info',
      );
    } else {
      onProgress?.(
        'tts',
        ratio,
        `[${i + 1}/${scriptLines.length}] 合成配音: ${line.text.slice(0, 22)}...`,
        'info',
      );
      const result = await synthesizeSentenceRaw(
        line.text,
        requestedProvider,
        voice,
        options,
        onProgress,
      );
      effectiveProvider = result.effectiveProvider;
      rawAudioFile = path.join(paths.ttsCacheDir, `${hash}.${result.output.extension}`);
      fs.writeFileSync(rawAudioFile, result.output.audioBuffer);
      fs.writeFileSync(
        cacheMeta,
        JSON.stringify(
          {
            hash,
            text: line.text,
            provider: effectiveProvider,
            voice,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
    }

    // Decode to PCM16 -> 10ms RMS trim silence & breaths -> apply tempo speed
    const rawPcm = await decodeAudioToPcm16(rawAudioFile!, SAMPLE_RATE, ffmpegCustom);
    const trimmed = trimSilenceAndBreaths(rawPcm, {
      sampleRate: SAMPLE_RATE,
      windowMs: 10,
      silenceThresholdDb,
      maxInternalPauseMs,
      fadeMs,
    });

    let finalPcm = trimmed.samples;
    if (Math.abs(speed - 1.0) >= 0.005) {
      const tmpIn = path.join(paths.cacheDir, `trim-${hash}-in.wav`);
      const tmpOut = path.join(paths.cacheDir, `trim-${hash}-out.wav`);
      try {
        fs.writeFileSync(tmpIn, encodePcm16ToWavBuffer(trimmed.samples, SAMPLE_RATE));
        await applySpeedWithFfmpeg(tmpIn, tmpOut, speed, SAMPLE_RATE, ffmpegCustom);
        finalPcm = await decodeAudioToPcm16(tmpOut, SAMPLE_RATE, ffmpegCustom);
      } finally {
        if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      }
    }

    const durationSec = finalPcm.length / SAMPLE_RATE;
    const startSec = Number(timelineCursorSec.toFixed(3));
    const endSec = Number((timelineCursorSec + durationSec).toFixed(3));

    // Proportional subtitle cue splitting
    const cueTexts = splitSentenceForSubtitles(line.text, 22);
    const totalChars = cueTexts.reduce((acc, c) => acc + Math.max(1, c.length), 0);
    const sentenceCues: SubtitleCue[] = [];
    let cueCursor = startSec;
    for (let cIdx = 0; cIdx < cueTexts.length; cIdx++) {
      const cueText = cueTexts[cIdx];
      const frac = Math.max(1, cueText.length) / totalChars;
      const cueStart = Number(cueCursor.toFixed(3));
      const cueEnd =
        cIdx === cueTexts.length - 1
          ? endSec
          : Number((cueCursor + durationSec * frac).toFixed(3));
      const cue: SubtitleCue = {
        id: subtitleCounter++,
        sentenceId: line.index,
        text: cueText,
        startSec: cueStart,
        endSec: Math.max(cueStart + 0.08, cueEnd),
      };
      sentenceCues.push(cue);
      allSubtitles.push(cue);
      cueCursor = cue.endSec;
    }

    sentences.push({
      id: line.index,
      text: line.text,
      note: line.note,
      hash,
      cached,
      startSec,
      endSec,
      durationSec: Number(durationSec.toFixed(3)),
      rawDurationSec: Number(trimmed.rawDurationSec.toFixed(3)),
      trimmedMs: trimmed.trimmedMs,
      pauseAfterMs: line.pauseAfterMs,
      subtitles: sentenceCues,
    });

    trimmedClips.push(finalPcm);

    const pauseSamples = Math.round((SAMPLE_RATE * line.pauseAfterMs) / 1000);
    if (pauseSamples > 0) {
      trimmedClips.push(new Int16Array(pauseSamples));
    }

    timelineCursorSec += durationSec + line.pauseAfterMs / 1000;
  }

  onProgress?.('merge', 0.86, '正在合并整轨配音并编码 voiceover.mp3...', 'info');

  const totalSamples = trimmedClips.reduce((acc, arr) => acc + arr.length, 0);
  const masterPcm = new Int16Array(totalSamples);
  let writeOffset = 0;
  for (const clip of trimmedClips) {
    masterPcm.set(clip, writeOffset);
    writeOffset += clip.length;
  }

  const masterWavPath = path.join(paths.buildDir, 'voiceover.tmp.wav');
  try {
    fs.writeFileSync(masterWavPath, encodePcm16ToWavBuffer(masterPcm, SAMPLE_RATE));
    await runFfmpeg(
      [
        '-y',
        '-i',
        masterWavPath,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '192k',
        '-ar',
        '44100',
        paths.voiceoverFile,
      ],
      ffmpegCustom,
    );
  } finally {
    if (fs.existsSync(masterWavPath)) {
      fs.unlinkSync(masterWavPath);
    }
  }

  const waveformPeaks = computeWaveformPeaks(masterPcm, 260);
  const totalDurationSec = Number((masterPcm.length / SAMPLE_RATE).toFixed(3));

  const timeline: AudioTimeline = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    provider: effectiveProvider,
    voice,
    speed,
    sampleRate: SAMPLE_RATE,
    totalDurationSec,
    voiceoverFile: 'build/voiceover.mp3',
    subtitlesFile: 'build/subtitles.srt',
    waveformPeaks,
    sentences,
    subtitles: allSubtitles,
  };

  fs.writeFileSync(paths.audioTimelineFile, JSON.stringify(timeline, null, 2), 'utf8');

  const srtContent = allSubtitles
    .map(
      (cue) =>
        `${cue.id}\n${formatSrtTime(cue.startSec)} --> ${formatSrtTime(cue.endSec)}\n${cue.text}\n`,
    )
    .join('\n');
  fs.writeFileSync(paths.subtitlesFile, srtContent, 'utf8');

  onProgress?.(
    'done',
    1,
    `配音完成！共 ${sentences.length} 句（缓存命中 ${cacheHits} 句），总时长 ${totalDurationSec.toFixed(2)}s`,
    'success',
  );

  return timeline;
}
