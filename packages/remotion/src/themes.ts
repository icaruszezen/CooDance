import { VideoThemeId } from './types';

export interface VideoThemeTokens {
  id: VideoThemeId;
  nameZh: string;
  nameEn: string;
  bg: string;
  bgRadial: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentText: string;
  secondary: string;
  secondarySoft: string;
  success: string;
  danger: string;
  subtitleBg: string;
  subtitleText: string;
  fontSans: string;
  fontMono: string;
}

const FONT_SANS =
  '"PingFang SC", "Noto Sans SC", "Hiragino Sans GB", "Microsoft YaHei", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
const FONT_MONO =
  '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

export const VIDEO_THEMES: Record<VideoThemeId, VideoThemeTokens> = {
  'obsidian-studio': {
    id: 'obsidian-studio',
    nameZh: '暗影工坊',
    nameEn: 'Obsidian Studio',
    bg: '#0b0e13',
    bgRadial:
      'radial-gradient(1200px 680px at 82% 14%, rgba(245, 158, 11, 0.10), transparent 62%), radial-gradient(900px 580px at 14% 88%, rgba(14, 165, 233, 0.09), transparent 62%), #0b0e13',
    surface: '#131821',
    surfaceElevated: '#1a212e',
    border: 'rgba(255, 255, 255, 0.10)',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#7f8ea3',
    accent: '#f59e0b',
    accentSoft: 'rgba(245, 158, 11, 0.14)',
    accentText: '#111318',
    secondary: '#0ea5e9',
    secondarySoft: 'rgba(14, 165, 233, 0.15)',
    success: '#10b981',
    danger: '#ef4444',
    subtitleBg: 'rgba(11, 14, 19, 0.84)',
    subtitleText: '#f8fafc',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
  },
  'ivory-editorial': {
    id: 'ivory-editorial',
    nameZh: '极简白昼',
    nameEn: 'Ivory Editorial',
    bg: '#f5f4ef',
    bgRadial:
      'radial-gradient(1000px 620px at 84% 12%, rgba(217, 119, 6, 0.08), transparent 60%), radial-gradient(880px 520px at 12% 88%, rgba(2, 132, 199, 0.07), transparent 60%), #f5f4ef',
    surface: '#ffffff',
    surfaceElevated: '#faf9f6',
    border: 'rgba(15, 23, 42, 0.10)',
    textPrimary: '#0f172a',
    textSecondary: '#334155',
    textMuted: '#64748b',
    accent: '#d97706',
    accentSoft: 'rgba(217, 119, 6, 0.12)',
    accentText: '#ffffff',
    secondary: '#0284c7',
    secondarySoft: 'rgba(2, 132, 199, 0.12)',
    success: '#059669',
    danger: '#dc2626',
    subtitleBg: 'rgba(15, 23, 42, 0.88)',
    subtitleText: '#ffffff',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
  },
  'cyber-emerald': {
    id: 'cyber-emerald',
    nameZh: '赛博翠光',
    nameEn: 'Cyber Emerald',
    bg: '#061114',
    bgRadial:
      'radial-gradient(1100px 640px at 80% 15%, rgba(16, 185, 129, 0.12), transparent 60%), radial-gradient(880px 560px at 18% 85%, rgba(34, 211, 238, 0.09), transparent 60%), #061114',
    surface: '#0b1b20',
    surfaceElevated: '#11272e',
    border: 'rgba(148, 224, 200, 0.14)',
    textPrimary: '#ecfdf5',
    textSecondary: '#b7dad0',
    textMuted: '#6e9692',
    accent: '#10b981',
    accentSoft: 'rgba(16, 185, 129, 0.16)',
    accentText: '#04120e',
    secondary: '#22d3ee',
    secondarySoft: 'rgba(34, 211, 238, 0.14)',
    success: '#34d399',
    danger: '#f87171',
    subtitleBg: 'rgba(6, 17, 20, 0.86)',
    subtitleText: '#ecfdf5',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
  },
};

export function getVideoTheme(themeId?: VideoThemeId): VideoThemeTokens {
  if (themeId && VIDEO_THEMES[themeId]) {
    return VIDEO_THEMES[themeId];
  }
  return VIDEO_THEMES['obsidian-studio'];
}
