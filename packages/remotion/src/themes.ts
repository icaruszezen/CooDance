import { VideoThemeId } from './types';

export interface VideoThemeTokens {
  id: VideoThemeId;
  nameZh: string;
  nameEn: string;
  isLight: boolean;
  bg: string;
  bgRadial: string;
  surface: string;
  surfaceElevated: string;
  surfaceInset: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryText: string;
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
  '"PingFang SC", "Noto Sans SC", "Noto Sans CJK SC", "Hiragino Sans GB", "Microsoft YaHei", "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
const FONT_MONO =
  '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

export const VIDEO_THEMES: Record<VideoThemeId, VideoThemeTokens> = {
  'obsidian-studio': {
    id: 'obsidian-studio',
    nameZh: '暗影工坊',
    nameEn: 'Obsidian Studio',
    isLight: false,
    bg: '#09090b',
    bgRadial: 'linear-gradient(180deg, #0c0c0e 0%, #09090b 100%)',
    surface: '#111114',
    surfaceElevated: '#18181c',
    surfaceInset: '#0c0c0e',
    border: 'rgba(255, 255, 255, 0.085)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    primary: '#f4f4f5',
    primaryText: '#09090b',
    accent: '#d99b26',
    accentSoft: 'rgba(217, 155, 38, 0.12)',
    accentText: '#09090b',
    secondary: '#65a8d4',
    secondarySoft: 'rgba(101, 168, 212, 0.13)',
    success: '#4cb487',
    danger: '#dc6868',
    subtitleBg: 'rgba(9, 9, 11, 0.9)',
    subtitleText: '#f4f4f5',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
  },
  'ivory-editorial': {
    id: 'ivory-editorial',
    nameZh: '极简白昼',
    nameEn: 'Ivory Editorial',
    isLight: true,
    bg: '#f5f4f0',
    bgRadial: 'linear-gradient(180deg, #f8f7f3 0%, #f5f4f0 100%)',
    surface: '#ffffff',
    surfaceElevated: '#faf9f7',
    surfaceInset: '#eeede8',
    border: 'rgba(20, 20, 22, 0.09)',
    borderStrong: 'rgba(20, 20, 22, 0.18)',
    textPrimary: '#141416',
    textSecondary: '#52525b',
    textMuted: '#7a7a85',
    primary: '#18181b',
    primaryText: '#ffffff',
    accent: '#b57913',
    accentSoft: 'rgba(181, 121, 19, 0.11)',
    accentText: '#ffffff',
    secondary: '#3a7ca5',
    secondarySoft: 'rgba(58, 124, 165, 0.11)',
    success: '#2e8b64',
    danger: '#c54b4b',
    subtitleBg: 'rgba(20, 20, 22, 0.9)',
    subtitleText: '#ffffff',
    fontSans: FONT_SANS,
    fontMono: FONT_MONO,
  },
  'cyber-emerald': {
    id: 'cyber-emerald',
    nameZh: '深林翠灰',
    nameEn: 'Deep Pine',
    isLight: false,
    bg: '#070e0e',
    bgRadial: 'linear-gradient(180deg, #0a1313 0%, #070e0e 100%)',
    surface: '#0e1717',
    surfaceElevated: '#142020',
    surfaceInset: '#091010',
    border: 'rgba(216, 240, 232, 0.09)',
    borderStrong: 'rgba(216, 240, 232, 0.17)',
    textPrimary: '#eef6f3',
    textSecondary: '#9eb6ae',
    textMuted: '#6a837b',
    primary: '#eef6f3',
    primaryText: '#070e0e',
    accent: '#4cb487',
    accentSoft: 'rgba(76, 180, 135, 0.13)',
    accentText: '#06120e',
    secondary: '#65a8d4',
    secondarySoft: 'rgba(101, 168, 212, 0.12)',
    success: '#5ec99b',
    danger: '#dc6868',
    subtitleBg: 'rgba(7, 14, 14, 0.9)',
    subtitleText: '#eef6f3',
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
