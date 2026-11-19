import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';

interface RunningServerHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

const isSmokeTest = process.env.COODANCE_SMOKE_TEST === '1';

let mainWindow: BrowserWindow | null = null;
let serverHandle: RunningServerHandle | null = null;

function buildSplashDataUrl(): string {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>CooDance Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: #0b0d11;
      color: #e6eaf2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      display: flex; align-items: center; justify-content: center;
      user-select: none; overflow: hidden;
    }
    .card {
      display: flex; flex-direction: column; align-items: center; gap: 18px;
      padding: 36px 44px; border-radius: 16px;
      background: linear-gradient(180deg, rgba(24,28,38,0.88), rgba(15,18,24,0.92));
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 24px 64px rgba(0,0,0,0.48);
    }
    .badge {
      width: 56px; height: 56px; border-radius: 14px;
      background: linear-gradient(135deg, #f59e0b, #fb923c);
      color: #0b0d11; font-weight: 800; font-size: 22px; letter-spacing: -0.5px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(245,158,11,0.32);
    }
    .title { font-size: 18px; font-weight: 600; letter-spacing: 0.2px; }
    .sub { font-size: 13px; color: #94a3b8; }
    .bar {
      width: 220px; height: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.08); overflow: hidden;
    }
    .bar-inner {
      width: 42%; height: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
      animation: slide 1.15s ease-in-out infinite;
    }
    @keyframes slide {
      0% { transform: translateX(-110%); }
      100% { transform: translateX(260%); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">CD</div>
    <div class="title">CooDance Studio</div>
    <div class="sub">正在启动本地视频生产引擎...</div>
    <div class="bar"><div class="bar-inner"></div></div>
  </div>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function resolveBundledPath(...segments: string[]): string {
  const candidates = [
    path.resolve(process.resourcesPath || '', ...segments),
    path.resolve(__dirname, '../../..', ...segments),
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
    path.join(process.resourcesPath || '', 'mcp', 'stdio.mjs'),
    path.join(
      process.resourcesPath || '',
      'app.asar.unpacked',
      'node_modules',
      '@coodance',
      'mcp',
      'dist',
      'stdio.js',
    ),
    path.resolve(__dirname, '../../../packages/mcp/dist/stdio.bundle.mjs'),
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
  } catch (coreErr) {
    const coreEntry = resolveBundledPath('packages', 'core', 'dist', 'index.js');
    if (!app.isPackaged && fs.existsSync(coreEntry)) {
      try {
        const coreMod = await dynamicImport<CoreMod>(pathToFileURL(coreEntry).href);
        const currentSettings = coreMod.loadSettings();
        fixedPortEnabled = currentSettings.mcp.fixedPortEnabled;
        fixedPort = currentSettings.mcp.fixedPort;
      } catch {
        // Fallback to default port 4170
      }
    } else {
      console.warn('[coodance-desktop] Failed to preload @coodance/core settings:', coreErr);
    }
  }

  let mod: ServerMod;
  try {
    // In packaged Electron apps, @coodance/server is bundled inside app.asar/node_modules
    // alongside express, @coodance/core, @coodance/mcp, and all runtime dependencies.
    mod = await dynamicImport<ServerMod>('@coodance/server/app');
  } catch (primaryErr) {
    const serverEntry = resolveBundledPath('apps', 'server', 'dist', 'app.js');
    if (!app.isPackaged && fs.existsSync(serverEntry)) {
      mod = await dynamicImport<ServerMod>(pathToFileURL(serverEntry).href);
    } else {
      throw primaryErr;
    }
  }

  const baseOpts = {
    host: '127.0.0.1',
    staticWebDir,
    isDesktop: true,
    electronExecutablePath: process.execPath,
    mcpStdioScriptPath,
    skillSourceDir: fs.existsSync(skillDir) ? skillDir : undefined,
  };

  if (isSmokeTest) {
    return mod.startStudioServer({
      ...baseOpts,
      port: 0,
      fixedPortRequested: null,
    });
  }

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

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: !isSmokeTest,
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Render an immediate dark loading screen before the embedded Node server finishes booting
  if (!isSmokeTest) {
    await mainWindow.loadURL(buildSplashDataUrl());
  }

  let targetUrl = devUrl || '';
  if (!devUrl) {
    if (!serverHandle) {
      serverHandle = await bootEmbeddedServer();
    }
    targetUrl = serverHandle.url;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  await mainWindow.loadURL(targetUrl);
}

async function runSmokeTest(): Promise<void> {
  await createMainWindow();
  if (!serverHandle) {
    throw new Error('Embedded server did not start during smoke test.');
  }
  const healthRes = await fetch(`${serverHandle.url}/api/health`);
  if (!healthRes.ok) {
    throw new Error(`/api/health returned HTTP ${healthRes.status}`);
  }
  const healthJson = (await healthRes.json()) as { ok?: boolean; version?: string; ffmpeg?: { ok?: boolean } };
  if (!healthJson.ok) {
    throw new Error(`/api/health returned ok=false: ${JSON.stringify(healthJson)}`);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    const rootHtmlLen = (await mainWindow.webContents.executeJavaScript(
      `new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
          const el = document.getElementById('root');
          if (el && el.innerHTML.trim().length > 0) return resolve(el.innerHTML.length);
          if (Date.now() - start > 8000) return resolve(0);
          setTimeout(check, 100);
        };
        check();
      })`,
    )) as number;
    if (!rootHtmlLen || rootHtmlLen <= 0) {
      throw new Error('Renderer #root did not mount any UI content within 8s.');
    }
  }

  const passLine = `[coodance-smoke] PASS url=${serverHandle.url} version=${healthJson.version || 'unknown'} ffmpegOk=${Boolean(healthJson.ffmpeg?.ok)}`;
  console.log(passLine);
  if (process.env.COODANCE_SMOKE_RESULT_FILE) {
    try {
      fs.writeFileSync(process.env.COODANCE_SMOKE_RESULT_FILE, `${passLine}\n`, 'utf8');
    } catch {
      // non-fatal
    }
  }
  await serverHandle.close();
  serverHandle = null;
  app.exit(0);
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

if (!isSmokeTest) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

app.whenReady().then(async () => {
  try {
    buildAppMenu();
    if (isSmokeTest) {
      await runSmokeTest();
      return;
    }

    await createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow().catch((err) => {
          console.error('[coodance-desktop] Failed to recreate window:', err);
        });
      }
    });
  } catch (err) {
    const detail = err instanceof Error ? err.stack || err.message : String(err);
    console.error('[coodance-desktop] Fatal startup error:\n', detail);
    if (!isSmokeTest) {
      dialog.showErrorBox(
        'CooDance Studio 启动失败',
        `本地服务引擎启动失败，请将以下错误信息反馈给开发者：\n\n${detail}`,
      );
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
      mainWindow = null;
    }
    if (serverHandle) {
      await serverHandle.close().catch(() => {});
      serverHandle = null;
    }
    app.exit(1);
  }
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
