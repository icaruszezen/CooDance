import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';

interface RunningServerHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

let mainWindow: BrowserWindow | null = null;
let serverHandle: RunningServerHandle | null = null;

function resolveBundledPath(...segments: string[]): string {
  const candidates = [
    path.resolve(__dirname, '../../..', ...segments),
    path.resolve(process.resourcesPath || '', ...segments),
    path.resolve(app.getAppPath(), ...segments),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return candidates[0];
}

async function bootEmbeddedServer(): Promise<RunningServerHandle> {
  const staticWebDir = resolveBundledPath('apps', 'web', 'dist');
  const remotionDir = resolveBundledPath('packages', 'remotion');
  if (fs.existsSync(remotionDir)) {
    process.env.COODANCE_REMOTION_DIR = remotionDir;
  }

  const skillDir = resolveBundledPath('skills', 'coodance-video-producer');
  if (fs.existsSync(skillDir)) {
    process.env.COODANCE_SKILL_DIR = skillDir;
  }

  const stdioCandidates = [
    path.join(
      process.resourcesPath || '',
      'app.asar.unpacked',
      'node_modules',
      '@coodance',
      'mcp',
      'dist',
      'stdio.js',
    ),
    path.resolve(__dirname, '../../../packages/mcp/dist/stdio.js'),
    path.resolve(app.getAppPath(), 'node_modules/@coodance/mcp/dist/stdio.js'),
  ];
  const mcpStdioScriptPath = stdioCandidates.find((p) => p && fs.existsSync(p));
  if (mcpStdioScriptPath) {
    process.env.COODANCE_MCP_STDIO_PATH = mcpStdioScriptPath;
  }
  process.env.COODANCE_ELECTRON_EXECUTABLE = process.execPath;

  // Use native dynamic import so CJS Electron main cleanly loads ESM @coodance/core and @coodance/server
  const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(
    specifier: string,
  ) => Promise<T>;

  type ServerMod = {
    startStudioServer: (opts: {
      host?: string;
      port?: number;
      staticWebDir?: string;
      isDesktop?: boolean;
      fixedPortRequested?: number | null;
      portFallbackReason?: string;
      electronExecutablePath?: string;
      mcpStdioScriptPath?: string;
      skillSourceDir?: string;
    }) => Promise<RunningServerHandle>;
  };

  type CoreMod = {
    loadSettings: () => {
      mcp: { enabled: boolean; fixedPortEnabled: boolean; fixedPort: number };
    };
  };

  let fixedPortEnabled = true;
  let fixedPort = 4170;
  try {
    const coreMod = await dynamicImport<CoreMod>('@coodance/core');
    const currentSettings = coreMod.loadSettings();
    fixedPortEnabled = currentSettings.mcp.fixedPortEnabled;
    fixedPort = currentSettings.mcp.fixedPort;
  } catch {
    try {
      const coreEntry = resolveBundledPath('packages', 'core', 'dist', 'index.js');
      const coreMod = await dynamicImport<CoreMod>(pathToFileURL(coreEntry).href);
      const currentSettings = coreMod.loadSettings();
      fixedPortEnabled = currentSettings.mcp.fixedPortEnabled;
      fixedPort = currentSettings.mcp.fixedPort;
    } catch {
      // Fallback to default port 4170
    }
  }

  let mod: ServerMod;
  try {
    // In packaged Electron apps, @coodance/server is bundled inside app.asar/node_modules
    // alongside express, @coodance/core, @coodance/mcp, and all runtime dependencies.
    mod = await dynamicImport<ServerMod>('@coodance/server/app');
  } catch {
    const serverEntry = resolveBundledPath('apps', 'server', 'dist', 'app.js');
    mod = await dynamicImport<ServerMod>(pathToFileURL(serverEntry).href);
  }

  const baseOpts = {
    host: '127.0.0.1',
    staticWebDir,
    isDesktop: true,
    electronExecutablePath: process.execPath,
    mcpStdioScriptPath,
    skillSourceDir: fs.existsSync(skillDir) ? skillDir : undefined,
  };

  if (fixedPortEnabled && fixedPort >= 1024 && fixedPort <= 65535) {
    try {
      return await mod.startStudioServer({
        ...baseOpts,
        port: fixedPort,
        fixedPortRequested: fixedPort,
      });
    } catch (err) {
      const errCode = (err as NodeJS.ErrnoException)?.code;
      const reason =
        errCode === 'EADDRINUSE'
          ? `固定 MCP 端口 ${fixedPort} 已被其他进程占用，已自动回退到随机可用端口。`
          : `固定 MCP 端口 ${fixedPort} 启动失败（${err instanceof Error ? err.message : String(err)}），已回退到随机端口。`;
      return mod.startStudioServer({
        ...baseOpts,
        port: 0,
        fixedPortRequested: fixedPort,
        portFallbackReason: reason,
      });
    }
  }

  return mod.startStudioServer({
    ...baseOpts,
    port: 0,
    fixedPortRequested: null,
  });
}

async function createMainWindow(): Promise<void> {
  const devUrl = process.env.COODANCE_DEV_URL;
  let targetUrl = devUrl || '';

  if (!devUrl) {
    serverHandle = await bootEmbeddedServer();
    targetUrl = serverHandle.url;
  }

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: 'CooDance Studio — Code-as-Video 16:9',
    backgroundColor: '#0b0d11',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('coodance:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择 CooDance 视频工作区目录',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('coodance:reveal-path', async (_event, targetPath: string) => {
  if (!targetPath) return;
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    await shell.openPath(targetPath);
  } else {
    shell.showItemInFolder(targetPath);
  }
});

ipcMain.handle('coodance:open-external', async (_event, url: string) => {
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

app.whenReady().then(async () => {
  buildAppMenu();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (serverHandle) {
    await serverHandle.close();
    serverHandle = null;
  }
});
