import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppSettings } from './types.js';
import { getConfigDir, getDefaultWorkspaceDir } from './paths.js';

const ENC_PREFIX = 'enc:v1:';

function deriveLocalKey(): Buffer {
  const seed = `${os.hostname()}|${os.userInfo().username}|coodance-studio-key-v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptSecret(plain: string): string {
  if (!plain || plain.startsWith(ENC_PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveLocalKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(stored: string): string {
  if (!stored || !stored.startsWith(ENC_PREFIX)) return stored || '';
  try {
    const rest = stored.slice(ENC_PREFIX.length);
    const [ivB64, tagB64, dataB64] = rest.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveLocalKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return '';
  }
}

export function getDefaultSettings(): AppSettings {
  return {
    workspaceDir: getDefaultWorkspaceDir(),
    language: 'zh-CN',
    uiTheme: 'dark',
    tts: {
      defaultProvider: 'doubao',
      defaultSpeed: 1.05,
      silenceThresholdDb: -38,
      maxInternalPauseMs: 240,
      paragraphPauseMs: 560,
      sentencePauseMs: 220,
      doubao: {
        appId: process.env.VOLC_TTS_APP_ID || '',
        accessToken: process.env.VOLC_TTS_ACCESS_TOKEN || '',
        resourceId: process.env.VOLC_TTS_RESOURCE_ID || 'seed-tts-2.0',
        voiceType: process.env.VOLC_TTS_VOICE || 'zh_female_vv_uranus_bigtts',
        endpoint:
          process.env.VOLC_TTS_ENDPOINT ||
          'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
      },
      edge: {
        voice: 'zh-CN-XiaoxiaoNeural',
      },
    },
    ai: {
      enabled: Boolean(process.env.OPENAI_API_KEY),
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    ffmpeg: {
      ffmpegPath: process.env.FFMPEG_PATH || '',
      ffprobePath: process.env.FFPROBE_PATH || '',
    },
    security: {
      webAccessToken: process.env.COODANCE_ACCESS_TOKEN || '',
    },
    mcp: {
      enabled: process.env.COODANCE_MCP_ENABLED !== '0',
      fixedPortEnabled: process.env.COODANCE_MCP_FIXED_PORT_DISABLED !== '1',
      fixedPort: process.env.COODANCE_PORT ? Number(process.env.COODANCE_PORT) || 4170 : 4170,
      autoSnapshotOnAgentWrite: true,
      allowPaidTtsFromAgent: false,
    },
    update: {
      autoCheck: process.env.COODANCE_AUTO_UPDATE_DISABLED !== '1',
      autoDownload: false,
      includePrerelease: false,
      mirrorMode: 'auto',
      customMirrorPrefix: process.env.COODANCE_UPDATE_MIRROR || '',
      skippedVersion: '',
      lastCheckedAt: undefined,
    },
  };
}

function getSettingsPath(): string {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'settings.json');
}

function normalizeMirrorMode(
  mode: unknown,
  fallback: AppSettings['update']['mirrorMode'],
): AppSettings['update']['mirrorMode'] {
  if (mode === 'auto' || mode === 'cn-only' || mode === 'custom' || mode === 'direct') {
    return mode;
  }
  return fallback;
}

export function loadSettings(): AppSettings {
  const defaults = getDefaultSettings();
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<AppSettings>;
    const merged: AppSettings = {
      workspaceDir: process.env.COODANCE_WORKSPACE || raw.workspaceDir || defaults.workspaceDir,
      language: raw.language === 'en-US' ? 'en-US' : 'zh-CN',
      uiTheme: raw.uiTheme === 'light' ? 'light' : 'dark',
      tts: {
        ...defaults.tts,
        ...(raw.tts || {}),
        doubao: {
          ...defaults.tts.doubao,
          ...(raw.tts?.doubao || {}),
          accessToken:
            decryptSecret(raw.tts?.doubao?.accessToken || '') || defaults.tts.doubao.accessToken,
        },
        edge: {
          ...defaults.tts.edge,
          ...(raw.tts?.edge || {}),
        },
      },
      ai: {
        ...defaults.ai,
        ...(raw.ai || {}),
        apiKey: decryptSecret(raw.ai?.apiKey || '') || defaults.ai.apiKey,
      },
      ffmpeg: {
        ...defaults.ffmpeg,
        ...(raw.ffmpeg || {}),
      },
      security: {
        webAccessToken:
          process.env.COODANCE_ACCESS_TOKEN ||
          decryptSecret(raw.security?.webAccessToken || '') ||
          defaults.security.webAccessToken,
      },
      mcp: {
        ...defaults.mcp,
        ...(raw.mcp || {}),
        fixedPort:
          typeof raw.mcp?.fixedPort === 'number' && raw.mcp.fixedPort >= 1024 && raw.mcp.fixedPort <= 65535
            ? Math.round(raw.mcp.fixedPort)
            : defaults.mcp.fixedPort,
      },
      update: {
        ...defaults.update,
        ...(raw.update || {}),
        autoCheck:
          typeof raw.update?.autoCheck === 'boolean'
            ? raw.update.autoCheck
            : defaults.update.autoCheck,
        autoDownload:
          typeof raw.update?.autoDownload === 'boolean'
            ? raw.update.autoDownload
            : defaults.update.autoDownload,
        includePrerelease:
          typeof raw.update?.includePrerelease === 'boolean'
            ? raw.update.includePrerelease
            : defaults.update.includePrerelease,
        mirrorMode: normalizeMirrorMode(raw.update?.mirrorMode, defaults.update.mirrorMode),
        customMirrorPrefix:
          typeof raw.update?.customMirrorPrefix === 'string'
            ? raw.update.customMirrorPrefix.trim()
            : defaults.update.customMirrorPrefix,
        skippedVersion:
          typeof raw.update?.skippedVersion === 'string'
            ? raw.update.skippedVersion.trim()
            : defaults.update.skippedVersion,
        lastCheckedAt:
          typeof raw.update?.lastCheckedAt === 'string' ? raw.update.lastCheckedAt : undefined,
      },
    };
    return merged;
  } catch {
    return defaults;
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const nextFixedPort =
    typeof partial.mcp?.fixedPort === 'number' &&
    partial.mcp.fixedPort >= 1024 &&
    partial.mcp.fixedPort <= 65535
      ? Math.round(partial.mcp.fixedPort)
      : current.mcp.fixedPort;

  const next: AppSettings = {
    workspaceDir: partial.workspaceDir?.trim() || current.workspaceDir,
    language: partial.language || current.language,
    uiTheme: partial.uiTheme || current.uiTheme,
    tts: {
      ...current.tts,
      ...(partial.tts || {}),
      doubao: {
        ...current.tts.doubao,
        ...(partial.tts?.doubao || {}),
      },
      edge: {
        ...current.tts.edge,
        ...(partial.tts?.edge || {}),
      },
    },
    ai: {
      ...current.ai,
      ...(partial.ai || {}),
    },
    ffmpeg: {
      ...current.ffmpeg,
      ...(partial.ffmpeg || {}),
    },
    security: {
      ...current.security,
      ...(partial.security || {}),
    },
    mcp: {
      ...current.mcp,
      ...(partial.mcp || {}),
      fixedPort: nextFixedPort,
    },
    update: {
      ...current.update,
      ...(partial.update || {}),
      mirrorMode: normalizeMirrorMode(partial.update?.mirrorMode, current.update.mirrorMode),
      customMirrorPrefix:
        partial.update?.customMirrorPrefix !== undefined
          ? partial.update.customMirrorPrefix.trim()
          : current.update.customMirrorPrefix,
      skippedVersion:
        partial.update?.skippedVersion !== undefined
          ? partial.update.skippedVersion.trim()
          : current.update.skippedVersion,
    },
  };

  const toStore: AppSettings = {
    ...next,
    tts: {
      ...next.tts,
      doubao: {
        ...next.tts.doubao,
        accessToken: encryptSecret(next.tts.doubao.accessToken),
      },
    },
    ai: {
      ...next.ai,
      apiKey: encryptSecret(next.ai.apiKey),
    },
    security: {
      webAccessToken: encryptSecret(next.security.webAccessToken),
    },
  };

  fs.writeFileSync(getSettingsPath(), JSON.stringify(toStore, null, 2), 'utf8');
  return next;
}

export function maskSettingsForClient(settings: AppSettings): AppSettings & {
  secretsStatus: {
    hasDoubaoToken: boolean;
    hasAiKey: boolean;
    hasWebAccessToken: boolean;
  };
} {
  return {
    ...settings,
    tts: {
      ...settings.tts,
      doubao: {
        ...settings.tts.doubao,
        accessToken: settings.tts.doubao.accessToken ? '••••••••' : '',
      },
    },
    ai: {
      ...settings.ai,
      apiKey: settings.ai.apiKey ? '••••••••' : '',
    },
    security: {
      webAccessToken: settings.security.webAccessToken ? '••••••••' : '',
    },
    secretsStatus: {
      hasDoubaoToken: Boolean(settings.tts.doubao.accessToken),
      hasAiKey: Boolean(settings.ai.apiKey),
      hasWebAccessToken: Boolean(settings.security.webAccessToken),
    },
  };
}
