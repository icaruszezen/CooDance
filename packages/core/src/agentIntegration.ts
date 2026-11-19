import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  AgentClientId,
  AgentClientStatus,
  AgentIntegrationInfo,
  AgentTransportMode,
  AppSettings,
  InstallAgentOptions,
  InstallAgentResult,
} from './types.js';
import { getConfigDir } from './paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const COODANCE_SKILL_NAME = 'coodance-video-producer';
export const COODANCE_MCP_SERVER_KEY = 'coodance';

export interface AgentRuntimeContext {
  settings: AppSettings;
  httpBaseUrl: string;
  actualPort: number;
  fixedPortRequested: number | null;
  portFallbackReason?: string;
  isDesktop?: boolean;
  electronExecutablePath?: string;
  mcpStdioScriptPath?: string;
  skillSourceDir?: string;
}

export function resolveSkillSourceDir(override?: string): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '';
  const candidates = [
    override || '',
    process.env.COODANCE_SKILL_DIR || '',
    resourcesPath ? path.join(resourcesPath, 'skills', COODANCE_SKILL_NAME) : '',
    path.resolve(__dirname, '../../../skills', COODANCE_SKILL_NAME),
    path.resolve(process.cwd(), 'skills', COODANCE_SKILL_NAME),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
      return dir;
    }
  }
  return null;
}

export function resolveMcpStdioScriptPath(override?: string): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '';
  const candidates = [
    override || '',
    process.env.COODANCE_MCP_STDIO_PATH || '',
    resourcesPath ? path.join(resourcesPath, 'mcp', 'stdio.mjs') : '',
    resourcesPath
      ? path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@coodance', 'mcp', 'dist', 'stdio.js')
      : '',
    path.resolve(__dirname, '../../mcp/dist/stdio.js'),
    path.resolve(process.cwd(), 'packages/mcp/dist/stdio.js'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export interface SkillFileEntry {
  relativePath: string;
  content: string;
  sizeBytes: number;
}

export function readSkillBundleFiles(overrideDir?: string): {
  skillDir: string | null;
  files: SkillFileEntry[];
} {
  const skillDir = resolveSkillSourceDir(overrideDir);
  if (!skillDir) {
    return { skillDir: null, files: [] };
  }

  const files: SkillFileEntry[] = [];
  const walk = (currentDir: string) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(skillDir, full).split(path.sep).join('/');
        const content = fs.readFileSync(full, 'utf8');
        files.push({
          relativePath: rel,
          content,
          sizeBytes: Buffer.byteLength(content, 'utf8'),
        });
      }
    }
  };

  walk(skillDir);
  files.sort((a, b) => {
    if (a.relativePath === 'SKILL.md') return -1;
    if (b.relativePath === 'SKILL.md') return 1;
    return a.relativePath.localeCompare(b.relativePath);
  });

  return { skillDir, files };
}

// Pure-Node PKZIP builder (no external zip library required)
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function buildSkillZipBuffer(overrideDir?: string): Buffer {
  const { files } = readSkillBundleFiles(overrideDir);
  if (files.length === 0) {
    throw new Error('CooDance Skill directory (skills/coodance-video-producer) not found.');
  }

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const zipEntryName = `${COODANCE_SKILL_NAME}/${file.relativePath}`;
    const nameBuf = Buffer.from(zipEntryName, 'utf8');
    const rawBuf = Buffer.from(file.content, 'utf8');
    const compressedBuf = zlib.deflateRawSync(rawBuf);
    const checksum = crc32(rawBuf);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // deflate compression
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, compressedBuf);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressedBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk num
  eocd.writeUInt16LE(0, 6); // central dir disk
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

interface ClientDescriptor {
  id: AgentClientId;
  name: string;
  description: string;
  recommendedTransport: AgentTransportMode;
  supportsHttp: boolean;
  supportsStdio: boolean;
  supportsSkillDir: boolean;
  getConfigPath: () => string | null;
  getDetectDirs: () => string[];
  getSkillInstallDir: () => string | null;
  canAutoInstall: boolean;
}

function getClientDescriptors(): ClientDescriptor[] {
  const home = os.homedir();
  const platform = process.platform;

  const claudeDesktopConfigPath = (): string => {
    if (platform === 'darwin') {
      return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, 'Claude', 'claude_desktop_config.json');
    }
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  };

  return [
    {
      id: 'cursor',
      name: 'Cursor',
      description: '支持本地固定 HTTP MCP + 全局 Skill 目录，修改分镜后工作台实时热更新',
      recommendedTransport: 'http',
      supportsHttp: true,
      supportsStdio: true,
      supportsSkillDir: true,
      getConfigPath: () => path.join(home, '.cursor', 'mcp.json'),
      getDetectDirs: () => [path.join(home, '.cursor')],
      getSkillInstallDir: () => path.join(home, '.cursor', 'skills', COODANCE_SKILL_NAME),
      canAutoInstall: true,
    },
    {
      id: 'claude-code',
      name: 'Claude Code',
      description: '原生支持 Streamable HTTP 与 stdio MCP，并自动发现 ~/.claude/skills/ 中的创作 SOP',
      recommendedTransport: 'http',
      supportsHttp: true,
      supportsStdio: true,
      supportsSkillDir: true,
      getConfigPath: () => path.join(home, '.claude.json'),
      getDetectDirs: () => [path.join(home, '.claude'), path.join(home, '.claude.json')],
      getSkillInstallDir: () => path.join(home, '.claude', 'skills', COODANCE_SKILL_NAME),
      canAutoInstall: true,
    },
    {
      id: 'claude-desktop',
      name: 'Claude Desktop',
      description: '推荐零依赖内置 stdio（不开 CooDance 桌面端也可调用），同时支持复制 HTTP 连接配置',
      recommendedTransport: 'stdio',
      supportsHttp: true,
      supportsStdio: true,
      supportsSkillDir: false,
      getConfigPath: claudeDesktopConfigPath,
      getDetectDirs: () => [path.dirname(claudeDesktopConfigPath())],
      getSkillInstallDir: () => null,
      canAutoInstall: true,
    },
    {
      id: 'antigravity',
      name: 'Antigravity / 通用 Skill Agent',
      description: '将 Skill 安装到标准 ~/.agents/skills/ 目录，并生成通用 HTTP / stdio MCP 配置片段',
      recommendedTransport: 'http',
      supportsHttp: true,
      supportsStdio: true,
      supportsSkillDir: true,
      getConfigPath: () => null,
      getDetectDirs: () => [path.join(home, '.agents'), path.join(home, '.gemini')],
      getSkillInstallDir: () => path.join(home, '.agents', 'skills', COODANCE_SKILL_NAME),
      canAutoInstall: true,
    },
    {
      id: 'cherry-studio',
      name: 'Cherry Studio / OpenClaw / 远程客户端',
      description: '直接复制 Streamable HTTP 端点 URL（含可选 Bearer Token），适合桌面对话客户端与 Docker 远程接入',
      recommendedTransport: 'http',
      supportsHttp: true,
      supportsStdio: true,
      supportsSkillDir: false,
      getConfigPath: () => null,
      getDetectDirs: () => [],
      getSkillInstallDir: () => null,
      canAutoInstall: false,
    },
  ];
}

function buildStdioInvocation(ctx: AgentRuntimeContext): {
  command: string;
  args: string[];
  env: Record<string, string>;
  runtimeLabel: string;
  available: boolean;
} {
  const scriptPath = resolveMcpStdioScriptPath(ctx.mcpStdioScriptPath);
  const env: Record<string, string> = {
    COODANCE_WORKSPACE: ctx.settings.workspaceDir,
    COODANCE_CONFIG_DIR: getConfigDir(),
  };
  if (process.env.COODANCE_REMOTION_DIR) {
    env.COODANCE_REMOTION_DIR = process.env.COODANCE_REMOTION_DIR;
  }
  const resolvedSkillDir = resolveSkillSourceDir(ctx.skillSourceDir);
  if (resolvedSkillDir) {
    env.COODANCE_SKILL_DIR = resolvedSkillDir;
  }

  const electronExec = ctx.electronExecutablePath || process.env.COODANCE_ELECTRON_EXECUTABLE;
  const isElectronBundled = Boolean(ctx.isDesktop && electronExec);

  if (isElectronBundled && electronExec) {
    env.ELECTRON_RUN_AS_NODE = '1';
    return {
      command: electronExec,
      args: [scriptPath || path.resolve(process.cwd(), 'packages/mcp/dist/stdio.js')],
      env,
      runtimeLabel: 'Electron 内置 Node (ELECTRON_RUN_AS_NODE=1，零外部 Node 依赖)',
      available: Boolean(scriptPath),
    };
  }

  return {
    command: 'node',
    args: [scriptPath || path.resolve(process.cwd(), 'packages/mcp/dist/stdio.js')],
    env,
    runtimeLabel: `Node.js (${process.version})`,
    available: Boolean(scriptPath),
  };
}

function buildServerEntryForClient(
  clientId: AgentClientId,
  transport: AgentTransportMode,
  httpEndpointUrl: string,
  accessToken: string,
  stdio: { command: string; args: string[]; env: Record<string, string> },
): Record<string, unknown> {
  if (transport === 'stdio') {
    return {
      command: stdio.command,
      args: stdio.args,
      env: stdio.env,
    };
  }

  const headers: Record<string, string> | undefined = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined;

  if (clientId === 'claude-code') {
    return {
      type: 'http',
      url: httpEndpointUrl,
      ...(headers ? { headers } : {}),
    };
  }

  return {
    url: httpEndpointUrl,
    ...(headers ? { headers } : {}),
  };
}

function inspectInstalledClientMcp(configPath: string | null): {
  installed: boolean;
  mode?: AgentTransportMode | 'unknown';
} {
  if (!configPath || !fs.existsSync(configPath)) {
    return { installed: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      mcpServers?: Record<string, Record<string, unknown>>;
    };
    const entry = parsed?.mcpServers?.[COODANCE_MCP_SERVER_KEY];
    if (!entry || typeof entry !== 'object') {
      return { installed: false };
    }
    if (typeof entry.url === 'string') {
      return { installed: true, mode: 'http' };
    }
    if (typeof entry.command === 'string') {
      return { installed: true, mode: 'stdio' };
    }
    return { installed: true, mode: 'unknown' };
  } catch {
    return { installed: false };
  }
}

export function getAgentIntegrationInfo(ctx: AgentRuntimeContext): AgentIntegrationInfo {
  const baseUrl = ctx.httpBaseUrl.replace(/\/+$/, '');
  const httpEndpointUrl = `${baseUrl}/mcp`;
  const tokenPlaceholder = ctx.settings.security.webAccessToken ? '<YOUR_COODANCE_ACCESS_TOKEN>' : '';
  const stdio = buildStdioInvocation(ctx);
  const { skillDir, files } = readSkillBundleFiles(ctx.skillSourceDir);

  const clients: AgentClientStatus[] = getClientDescriptors().map((desc) => {
    const configPath = desc.getConfigPath();
    const skillInstallDir = desc.getSkillInstallDir();
    const detected = desc.getDetectDirs().some((d) => fs.existsSync(d));
    const mcpCheck = inspectInstalledClientMcp(configPath);
    const skillInstalled = Boolean(
      skillInstallDir && fs.existsSync(path.join(skillInstallDir, 'SKILL.md')),
    );

    return {
      id: desc.id,
      name: desc.name,
      description: desc.description,
      recommendedTransport: desc.recommendedTransport,
      supportsHttp: desc.supportsHttp,
      supportsStdio: desc.supportsStdio,
      supportsSkillDir: desc.supportsSkillDir,
      configPath,
      skillInstallDir,
      clientDetected: detected || mcpCheck.installed || skillInstalled,
      mcpInstalled: mcpCheck.installed,
      mcpInstalledMode: mcpCheck.mode,
      skillInstalled,
      canAutoInstall: desc.canAutoInstall,
    };
  });

  const wrapMcpServers = (entry: Record<string, unknown>) =>
    JSON.stringify({ mcpServers: { [COODANCE_MCP_SERVER_KEY]: entry } }, null, 2);

  return {
    mcpEnabled: ctx.settings.mcp.enabled,
    httpEndpointUrl,
    authRequired: Boolean(ctx.settings.security.webAccessToken),
    isDesktop: Boolean(ctx.isDesktop),
    platform: process.platform,
    fixedPortRequested: ctx.fixedPortRequested,
    actualPort: ctx.actualPort,
    portFallbackReason: ctx.portFallbackReason,
    workspaceDir: ctx.settings.workspaceDir,
    configDir: getConfigDir(),
    stdioCommand: stdio.command,
    stdioArgs: stdio.args,
    stdioEnv: stdio.env,
    stdioRuntimeLabel: stdio.runtimeLabel,
    stdioAvailable: stdio.available,
    skillDir,
    skillFiles: files.map((f) => ({ relativePath: f.relativePath, sizeBytes: f.sizeBytes })),
    clients,
    snippets: {
      cursorHttp: wrapMcpServers(
        buildServerEntryForClient('cursor', 'http', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      cursorStdio: wrapMcpServers(
        buildServerEntryForClient('cursor', 'stdio', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      claudeCodeHttp: wrapMcpServers(
        buildServerEntryForClient('claude-code', 'http', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      claudeCodeStdio: wrapMcpServers(
        buildServerEntryForClient('claude-code', 'stdio', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      claudeDesktopStdio: wrapMcpServers(
        buildServerEntryForClient('claude-desktop', 'stdio', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      claudeDesktopHttp: wrapMcpServers(
        buildServerEntryForClient('claude-desktop', 'http', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      genericHttp: wrapMcpServers(
        buildServerEntryForClient('cherry-studio', 'http', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
      genericStdio: wrapMcpServers(
        buildServerEntryForClient('cherry-studio', 'stdio', httpEndpointUrl, tokenPlaceholder, stdio),
      ),
    },
    guardrails: {
      fixedPortEnabled: ctx.settings.mcp.fixedPortEnabled,
      fixedPort: ctx.settings.mcp.fixedPort,
      autoSnapshotOnAgentWrite: ctx.settings.mcp.autoSnapshotOnAgentWrite,
      allowPaidTtsFromAgent: ctx.settings.mcp.allowPaidTtsFromAgent,
    },
  };
}

function copyDirRecursive(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const src = path.join(srcDir, entry.name);
    const dst = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
}

export function installAgentIntegration(
  ctx: AgentRuntimeContext,
  options: InstallAgentOptions,
): InstallAgentResult {
  const desc = getClientDescriptors().find((c) => c.id === options.clientId);
  if (!desc) {
    throw new Error(`Unknown agent clientId: ${options.clientId}`);
  }

  const dryRun = Boolean(options.dryRun);
  const wantMcp = options.installMcp !== false && Boolean(desc.getConfigPath());
  const wantSkill = options.installSkill !== false && Boolean(desc.getSkillInstallDir());
  const warnings: string[] = [];

  const httpEndpointUrl = (options.httpEndpointUrl || `${ctx.httpBaseUrl.replace(/\/+$/, '')}/mcp`).trim();
  const accessToken =
    options.accessToken !== undefined
      ? options.accessToken
      : ctx.settings.security.webAccessToken || '';
  const stdio = buildStdioInvocation(ctx);

  if (options.transport === 'stdio' && !stdio.available) {
    warnings.push(
      '未在当前环境中找到编译后的 packages/mcp/dist/stdio.js，请先运行 npm run build 后再启动外部客户端。',
    );
  }
  if (options.transport === 'http' && ctx.portFallbackReason) {
    warnings.push(
      `固定端口被占用，当前临时运行在端口 ${ctx.actualPort}。建议在设置中更换未占用端口后重新写入配置。`,
    );
  }

  const configPath = desc.getConfigPath();
  let backupPath: string | undefined;
  let previewConfigJson: string | undefined;
  let mcpUpdated = false;

  if (wantMcp && configPath) {
    let existingObj: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8').trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Root JSON is not an object');
          }
          existingObj = parsed as Record<string, unknown>;
        } catch (err) {
          throw new Error(
            `安全中止：目标配置文件 ${configPath} 不是合法 JSON，已拒绝覆写以保护原有配置（${err instanceof Error ? err.message : String(err)}）。`,
          );
        }
      }
    }

    const existingServers =
      existingObj.mcpServers &&
      typeof existingObj.mcpServers === 'object' &&
      !Array.isArray(existingObj.mcpServers)
        ? { ...(existingObj.mcpServers as Record<string, unknown>) }
        : {};

    existingServers[COODANCE_MCP_SERVER_KEY] = buildServerEntryForClient(
      options.clientId,
      options.transport,
      httpEndpointUrl,
      accessToken,
      stdio,
    );

    const nextObj = {
      ...existingObj,
      mcpServers: existingServers,
    };
    previewConfigJson = JSON.stringify(nextObj, null, 2);

    if (!dryRun) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      if (fs.existsSync(configPath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = `${configPath}.coodance.bak.${stamp}`;
        fs.copyFileSync(configPath, backupPath);
      }
      const tmpPath = `${configPath}.coodance.tmp.${process.pid}`;
      fs.writeFileSync(tmpPath, previewConfigJson + '\n', 'utf8');
      fs.renameSync(tmpPath, configPath);
      mcpUpdated = true;
    }
  }

  const skillInstallDir = desc.getSkillInstallDir();
  let skillUpdated = false;
  if (wantSkill && skillInstallDir) {
    const srcSkillDir = resolveSkillSourceDir(ctx.skillSourceDir);
    if (!srcSkillDir) {
      warnings.push('未找到内置 skills/coodance-video-producer 目录，已跳过 Skill 文件复制。');
    } else if (!dryRun) {
      copyDirRecursive(srcSkillDir, skillInstallDir);
      skillUpdated = true;
    }
  }

  const summaryParts: string[] = [];
  if (dryRun) {
    summaryParts.push(`预览模式（未修改磁盘）`);
  } else {
    if (mcpUpdated && configPath) summaryParts.push(`已写入 MCP 配置到 ${configPath}`);
    if (skillUpdated && skillInstallDir) summaryParts.push(`已安装 Skill 到 ${skillInstallDir}`);
    if (!mcpUpdated && !skillUpdated) summaryParts.push('未执行任何文件写入');
  }

  return {
    ok: true,
    dryRun,
    clientId: options.clientId,
    transport: options.transport,
    mcpUpdated,
    skillUpdated,
    configPath,
    backupPath,
    skillPath: skillInstallDir || undefined,
    previewConfigJson,
    message: summaryParts.join('；'),
    warnings,
  };
}

export function uninstallAgentIntegration(
  clientId: AgentClientId,
  options: { removeMcp?: boolean; removeSkill?: boolean } = {},
): {
  ok: boolean;
  mcpRemoved: boolean;
  skillRemoved: boolean;
  backupPath?: string;
  message: string;
} {
  const desc = getClientDescriptors().find((c) => c.id === clientId);
  if (!desc) {
    throw new Error(`Unknown agent clientId: ${clientId}`);
  }

  const removeMcp = options.removeMcp !== false;
  const removeSkill = options.removeSkill !== false;
  let mcpRemoved = false;
  let skillRemoved = false;
  let backupPath: string | undefined;

  const configPath = desc.getConfigPath();
  if (removeMcp && configPath && fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8').trim();
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        parsed.mcpServers &&
        typeof parsed.mcpServers === 'object' &&
        !Array.isArray(parsed.mcpServers) &&
        COODANCE_MCP_SERVER_KEY in (parsed.mcpServers as Record<string, unknown>)
      ) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = `${configPath}.coodance.bak.${stamp}`;
        fs.copyFileSync(configPath, backupPath);

        const nextServers = { ...(parsed.mcpServers as Record<string, unknown>) };
        delete nextServers[COODANCE_MCP_SERVER_KEY];
        const nextObj = { ...parsed, mcpServers: nextServers };
        const tmpPath = `${configPath}.coodance.tmp.${process.pid}`;
        fs.writeFileSync(tmpPath, JSON.stringify(nextObj, null, 2) + '\n', 'utf8');
        fs.renameSync(tmpPath, configPath);
        mcpRemoved = true;
      }
    }
  }

  const skillDir = desc.getSkillInstallDir();
  if (removeSkill && skillDir && fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true, force: true });
    skillRemoved = true;
  }

  const parts: string[] = [];
  if (mcpRemoved) parts.push('已移除 MCP 配置条目');
  if (skillRemoved) parts.push('已删除本地 Skill 目录');
  if (parts.length === 0) parts.push('未检测到已安装的 CooDance 集成项');

  return {
    ok: true,
    mcpRemoved,
    skillRemoved,
    backupPath,
    message: parts.join('；'),
  };
}
