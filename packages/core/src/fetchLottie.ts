import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ProjectPaths, ensureProjectDirs, toPosixPath } from './paths.js';

export interface LottiePresetMeta {
  id: string;
  name: string;
  category: 'reaction' | 'indicator' | 'motion';
  description: string;
}

export const LOTTIE_PRESETS: LottiePresetMeta[] = [
  { id: 'pulse-ring', name: '雷达焦点环', category: 'indicator', description: '用于强调屏幕点击目标与关键数据' },
  { id: 'sparkle-burst', name: '星光绽放', category: 'reaction', description: '功能亮点发布或完成提示动效' },
  { id: 'check-badge', name: '成功对勾徽章', category: 'indicator', description: '自动化流水线执行通过提示' },
  { id: 'audio-bars', name: '声波律动条', category: 'motion', description: '语音合成与配音同步视觉化' },
  { id: 'rocket-launch', name: '极速上升', category: 'reaction', description: '性能提升或发布上线动效' },
  { id: 'fire-glow', name: '高能热力', category: 'reaction', description: '核心卖点高亮与情绪强调' },
];

/**
 * Generates clean, spec-compliant Bodymovin/Lottie v5 JSON animations
 * compatible with `lottie-web` and `@remotion/lottie` with zero external CDN flakiness.
 */
export function buildPresetLottieJson(presetId: string): Record<string, unknown> {
  const base = {
    v: '5.9.0',
    fr: 60,
    ip: 0,
    op: 90,
    w: 200,
    h: 200,
    nm: presetId,
    ddd: 0,
    assets: [],
  };

  const easeVec = {
    i: { x: [0.25, 0.25, 0.25], y: [1, 1, 1] },
    o: { x: [0.45, 0.45, 0.45], y: [0, 0, 0] },
  };
  const easeScalar = {
    i: { x: [0.25], y: [1] },
    o: { x: [0.45], y: [0] },
  };

  if (presetId === 'check-badge') {
    return {
      ...base,
      layers: [
        // Layer 0 renders ON TOP in Lottie: crisp white animated checkmark stroke
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: 'CheckStroke',
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [100, 100, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: { a: 0, k: [100, 100, 100] },
          },
          shapes: [
            {
              ty: 'sh',
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0]],
                  v: [[-34, 2], [-8, 28], [38, -24]],
                  c: false,
                },
              },
              nm: 'Path',
            },
            {
              ty: 'tm',
              s: { a: 0, k: 0 },
              e: {
                a: 1,
                k: [
                  { t: 10, s: [0], ...easeScalar },
                  { t: 36, s: [100] },
                ],
              },
              o: { a: 0, k: 0 },
              nm: 'Trim',
            },
            {
              ty: 'st',
              c: { a: 0, k: [1, 1, 1, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 16 },
              lc: 2,
              lj: 2,
              nm: 'Stroke',
            },
          ],
          ip: 0,
          op: 90,
          st: 0,
        },
        // Layer 1 renders BELOW: emerald circle badge with subtle pulse
        {
          ddd: 0,
          ind: 2,
          ty: 4,
          nm: 'CircleBg',
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [100, 100, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: {
              a: 1,
              k: [
                { t: 0, s: [78, 78, 100], ...easeVec },
                { t: 18, s: [104, 104, 100], ...easeVec },
                { t: 32, s: [100, 100, 100], ...easeVec },
                { t: 90, s: [100, 100, 100] },
              ],
            },
          },
          shapes: [
            {
              ty: 'el',
              d: 1,
              s: { a: 0, k: [148, 148] },
              p: { a: 0, k: [0, 0] },
              nm: 'Ellipse',
            },
            {
              ty: 'fl',
              c: { a: 0, k: [0.3, 0.71, 0.53, 1] },
              o: { a: 0, k: 100 },
              nm: 'Fill',
            },
          ],
          ip: 0,
          op: 90,
          st: 0,
        },
      ],
    };
  }

  if (presetId === 'audio-bars') {
    const xPositions = [48, 74, 100, 126, 152];
    const peaks = [92, 130, 105, 136, 86];
    const mids = [24, 38, 18, 46, 30];
    return {
      ...base,
      layers: xPositions.map((xPos, idx) => ({
        ddd: 0,
        ind: idx + 1,
        ty: 4,
        nm: `Bar${idx}`,
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [xPos, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [100, 42 + (idx % 3) * 14, 100], ...easeVec },
              { t: mids[idx], s: [100, peaks[idx], 100], ...easeVec },
              { t: mids[idx] + 28, s: [100, 36, 100], ...easeVec },
              { t: 90, s: [100, 42 + (idx % 3) * 14, 100] },
            ],
          },
        },
        shapes: [
          {
            ty: 'rc',
            d: 1,
            s: { a: 0, k: [14, 96] },
            p: { a: 0, k: [0, 0] },
            r: { a: 0, k: 7 },
            nm: 'Rect',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.85, 0.61, 0.15, 1] },
            o: { a: 0, k: 100 },
            nm: 'Fill',
          },
        ],
        ip: 0,
        op: 90,
        st: 0,
      })),
    };
  }

  if (presetId === 'sparkle-burst' || presetId === 'fire-glow' || presetId === 'rocket-launch') {
    const color =
      presetId === 'fire-glow'
        ? [0.97, 0.35, 0.2, 1]
        : presetId === 'rocket-launch'
          ? [0.4, 0.66, 0.83, 1]
          : [0.85, 0.61, 0.15, 1];
    return {
      ...base,
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: 'StarCore',
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: {
              a: 1,
              k: [
                { t: 0, s: [0], ...easeScalar },
                { t: 90, s: [180] },
              ],
            },
            p: { a: 0, k: [100, 100, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: {
              a: 1,
              k: [
                { t: 0, s: [72, 72, 100], ...easeVec },
                { t: 45, s: [112, 112, 100], ...easeVec },
                { t: 90, s: [72, 72, 100] },
              ],
            },
          },
          shapes: [
            {
              ty: 'sr',
              sy: 1,
              d: 1,
              pt: { a: 0, k: 4 },
              p: { a: 0, k: [0, 0] },
              r: { a: 0, k: 0 },
              ir: { a: 0, k: 22 },
              is: { a: 0, k: 0 },
              or: { a: 0, k: 66 },
              os: { a: 0, k: 0 },
              nm: 'PolyStar',
            },
            {
              ty: 'fl',
              c: { a: 0, k: color },
              o: { a: 0, k: 100 },
              nm: 'Fill',
            },
          ],
          ip: 0,
          op: 90,
          st: 0,
        },
      ],
    };
  }

  // Default: pulse-ring
  return {
    ...base,
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'CenterDot',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
        },
        shapes: [
          {
            ty: 'el',
            d: 1,
            s: { a: 0, k: [32, 32] },
            p: { a: 0, k: [0, 0] },
            nm: 'Dot',
          },
          {
            ty: 'fl',
            c: { a: 0, k: [0.85, 0.61, 0.15, 1] },
            o: { a: 0, k: 100 },
            nm: 'Fill',
          },
        ],
        ip: 0,
        op: 90,
        st: 0,
      },
      {
        ddd: 0,
        ind: 2,
        ty: 4,
        nm: 'OuterRing',
        sr: 1,
        ks: {
          o: {
            a: 1,
            k: [
              { t: 0, s: [92], ...easeScalar },
              { t: 89, s: [0] },
            ],
          },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [40, 40, 100], ...easeVec },
              { t: 89, s: [128, 128, 100] },
            ],
          },
        },
        shapes: [
          {
            ty: 'el',
            d: 1,
            s: { a: 0, k: [126, 126] },
            p: { a: 0, k: [0, 0] },
            nm: 'Ellipse',
          },
          {
            ty: 'st',
            c: { a: 0, k: [0.85, 0.61, 0.15, 1] },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 10 },
            nm: 'Stroke',
          },
        ],
        ip: 0,
        op: 90,
        st: 0,
      },
    ],
  };
}

export interface FetchLottieResult {
  name: string;
  relativePath: string;
  absolutePath: string;
  source: 'preset' | 'remote-url';
}

/**
 * Fetches a dynamic Lottie JSON (supports built-in presets, remote `.json` URLs,
 * and gzipped Telegram `.tgs` sticker files) into `assets/lottie/`.
 */
export async function fetchAndSaveLottie(
  paths: ProjectPaths,
  presetOrUrl: string,
  preferredName?: string,
): Promise<FetchLottieResult> {
  ensureProjectDirs(paths);
  const trimmed = presetOrUrl.trim();
  const slug =
    (preferredName || trimmed)
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 44) || 'lottie-anim';

  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      throw new Error(`Failed to fetch Lottie resource (${res.status}): ${trimmed}`);
    }
    const rawBuf = Buffer.from(await res.arrayBuffer());
    let jsonText: string;
    // Detect gzipped Telegram .tgs magic bytes 0x1f 0x8b
    if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
      jsonText = zlib.gunzipSync(rawBuf).toString('utf8');
    } else {
      jsonText = rawBuf.toString('utf8');
    }
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !('layers' in parsed)) {
      throw new Error('Fetched resource is not a valid Lottie JSON document.');
    }
    const dest = path.join(paths.lottieDir, `${slug}.json`);
    fs.writeFileSync(dest, JSON.stringify(parsed, null, 2), 'utf8');
    return {
      name: preferredName || slug,
      absolutePath: dest,
      relativePath: toPosixPath(path.relative(paths.root, dest)),
      source: 'remote-url',
    };
  }

  const presetJson = buildPresetLottieJson(trimmed);
  const dest = path.join(paths.lottieDir, `${slug}.json`);
  fs.writeFileSync(dest, JSON.stringify(presetJson, null, 2), 'utf8');
  return {
    name: preferredName || trimmed,
    absolutePath: dest,
    relativePath: toPosixPath(path.relative(paths.root, dest)),
    source: 'preset',
  };
}
