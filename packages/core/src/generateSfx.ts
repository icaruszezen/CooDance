import fs from 'node:fs';
import path from 'node:path';
import { encodePcm16ToWavBuffer } from './audioTrim.js';
import { ProjectPaths, ensureProjectDirs, toPosixPath } from './paths.js';

export type SfxPresetId =
  | 'whoosh'
  | 'pop'
  | 'click'
  | 'chime'
  | 'swoosh'
  | 'typing'
  | 'riser'
  | 'success'
  | 'notification'
  | 'impact';

export interface SfxPresetMeta {
  id: SfxPresetId;
  name: string;
  durationSec: number;
  description: string;
}

export const SFX_PRESETS: SfxPresetMeta[] = [
  { id: 'whoosh', name: '流畅转场 Whoosh', durationSec: 0.42, description: '分镜切换与镜头推拉过渡音效' },
  { id: 'pop', name: '气泡弹出 Pop', durationSec: 0.16, description: '标注卡片、标签或元素入场弹出' },
  { id: 'click', name: '清脆点击 Click', durationSec: 0.08, description: '鼠标点击按钮或界面操作反馈' },
  { id: 'chime', name: '清亮提示 Chime', durationSec: 0.55, description: '重点数据高亮与章节切换提示' },
  { id: 'swoosh', name: '快速滑入 Swoosh', durationSec: 0.28, description: '侧边栏/分屏卡片滑入转场' },
  { id: 'typing', name: '机械键盘 Typing', durationSec: 0.48, description: '代码终端与命令行输入节奏' },
  { id: 'riser', name: '情绪推进 Riser', durationSec: 0.85, description: '高潮揭晓或版本发布前蓄力' },
  { id: 'success', name: '完成和弦 Success', durationSec: 0.62, description: '任务执行成功与双音阶上扬反馈' },
  { id: 'notification', name: '轻柔通知 Notice', durationSec: 0.34, description: '悬浮弹窗与要点提醒' },
  { id: 'impact', name: '低频重击 Impact', durationSec: 0.45, description: '大标题开场与关键数字定格' },
];

function synthesizeSfxSamples(preset: SfxPresetId, sampleRate = 44100): Int16Array {
  const meta = SFX_PRESETS.find((p) => p.id === preset) ?? SFX_PRESETS[0];
  const totalSamples = Math.round(meta.durationSec * sampleRate);
  const out = new Int16Array(totalSamples);

  let phase = 0;
  let lpState = 0;
  let noiseSeed = 1234567;
  const nextNoise = () => {
    noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
    return (noiseSeed / 0xffffffff) * 2 - 1;
  };

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const progress = i / Math.max(1, totalSamples - 1);
    let v = 0;

    switch (preset) {
      case 'whoosh': {
        const env = Math.sin(Math.PI * Math.pow(progress, 0.75));
        const cutoff = 0.03 + 0.28 * Math.sin(Math.PI * progress);
        lpState += cutoff * (nextNoise() - lpState);
        v = lpState * env * 0.9;
        break;
      }
      case 'swoosh': {
        const env = Math.sin(Math.PI * progress) * (1 - 0.3 * progress);
        const cutoff = 0.08 + 0.36 * (1 - progress);
        lpState += cutoff * (nextNoise() - lpState);
        const tone = Math.sin(2 * Math.PI * (260 + 520 * (1 - progress)) * t) * 0.18;
        v = (lpState * 0.75 + tone) * env;
        break;
      }
      case 'pop': {
        const freq = 180 + 480 * Math.pow(1 - progress, 2.2);
        phase += (2 * Math.PI * freq) / sampleRate;
        const env = Math.exp(-progress * 7.5) * Math.min(1, progress * 25);
        v = Math.sin(phase) * env * 0.85;
        break;
      }
      case 'click': {
        const env = Math.exp(-progress * 18);
        const impulse = Math.sin(2 * Math.PI * 1900 * t) * 0.55 + nextNoise() * 0.45;
        v = impulse * env * 0.8;
        break;
      }
      case 'chime': {
        const env = Math.exp(-progress * 4.5) * Math.min(1, progress * 35);
        v =
          (Math.sin(2 * Math.PI * 880 * t) * 0.55 +
            Math.sin(2 * Math.PI * 1318.5 * t) * 0.35 +
            Math.sin(2 * Math.PI * 1760 * t) * 0.18) *
          env *
          0.75;
        break;
      }
      case 'success': {
        const half = progress < 0.42;
        const localT = half ? progress / 0.42 : (progress - 0.42) / 0.58;
        const env = Math.exp(-localT * 3.8) * Math.min(1, localT * 30);
        const f1 = half ? 523.25 : 659.25;
        const f2 = half ? 659.25 : 1046.5;
        v = (Math.sin(2 * Math.PI * f1 * t) * 0.5 + Math.sin(2 * Math.PI * f2 * t) * 0.45) * env * 0.7;
        break;
      }
      case 'notification': {
        const env = Math.exp(-progress * 5.2) * Math.min(1, progress * 40);
        const f = progress < 0.35 ? 698.46 : 932.33;
        v = Math.sin(2 * Math.PI * f * t) * env * 0.72;
        break;
      }
      case 'typing': {
        const hits = [0.02, 0.11, 0.19, 0.28, 0.36, 0.43];
        let sum = 0;
        for (const h of hits) {
          const dt = t - h;
          if (dt >= 0 && dt < 0.035) {
            const e = Math.exp(-dt * 120);
            sum += (Math.sin(2 * Math.PI * 2400 * dt) * 0.45 + nextNoise() * 0.55) * e;
          }
        }
        v = sum * 0.7;
        break;
      }
      case 'riser': {
        const freq = 140 + 920 * Math.pow(progress, 2.1);
        phase += (2 * Math.PI * freq) / sampleRate;
        const env = Math.pow(progress, 1.4) * (progress > 0.92 ? (1 - progress) / 0.08 : 1);
        lpState += (0.04 + 0.3 * progress) * (nextNoise() - lpState);
        v = (Math.sin(phase) * 0.45 + lpState * 0.55) * env * 0.8;
        break;
      }
      case 'impact': {
        const freq = 130 * Math.exp(-progress * 4.5) + 38;
        phase += (2 * Math.PI * freq) / sampleRate;
        const env = Math.exp(-progress * 5.5) * Math.min(1, progress * 80);
        const sub = Math.sin(phase) * 0.85;
        const crack = nextNoise() * Math.exp(-progress * 28) * 0.35;
        v = (sub + crack) * env * 0.95;
        break;
      }
    }

    const clamped = Math.max(-0.98, Math.min(0.98, v));
    out[i] = Math.round(clamped * 32767);
  }

  return out;
}

export interface GeneratedSfxResult {
  preset: SfxPresetId;
  name: string;
  relativePath: string;
  absolutePath: string;
  durationSec: number;
}

/**
 * Generates one or all programmatic interaction/transition SFX WAV files into `assets/sfx/`.
 */
export function generateProjectSfx(
  paths: ProjectPaths,
  presets?: SfxPresetId[],
): GeneratedSfxResult[] {
  ensureProjectDirs(paths);
  const targets: SfxPresetId[] =
    presets && presets.length > 0 ? presets : SFX_PRESETS.map((p) => p.id);

  const results: GeneratedSfxResult[] = [];
  for (const preset of targets) {
    const meta = SFX_PRESETS.find((p) => p.id === preset);
    if (!meta) continue;
    const pcm = synthesizeSfxSamples(preset, 44100);
    const wavBuf = encodePcm16ToWavBuffer(pcm, 44100);
    const dest = path.join(paths.sfxDir, `${preset}.wav`);
    fs.writeFileSync(dest, wavBuf);
    results.push({
      preset,
      name: meta.name,
      absolutePath: dest,
      relativePath: toPosixPath(path.relative(paths.root, dest)),
      durationSec: meta.durationSec,
    });
  }
  return results;
}
