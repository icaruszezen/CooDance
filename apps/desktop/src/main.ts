import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron';
import { BRAND_ICON_DATA_URI } from './brandIconDataUri';

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
      -webkit-app-region: drag;
    }
    body {
      border: 1px solid rgba(255,255,255,0.08);
    }
    .card {
      display: flex; flex-direction: column; align-items: center; gap: 18px;
      padding: 36px 44px; border-radius: 18px;
      background: linear-gradient(180deg, rgba(24,28,38,0.88), rgba(15,18,24,0.94));
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 24px 64px rgba(0,0,0,0.52);
    }
    .badge {
      width: 72px; height: 72px;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .badge img {
      width: 72px; height: 72px;
      display: block;
      object-fit: contain;
      filter: drop-shadow(0 10px 24px rgba(245,158,11,0.22)) drop-shadow(0 6px 18px rgba(56,189,248,0.22));
    }
    .title { font-size: 18px; font-weight: 700; letter-spacing: 0.2px; }
    .sub { font-size: 13px; color: #94a3b8; }
    .bar {
      width: 220px; height: 4px; border-radius: 999px;
      background: rgba(255,255,255,0.08); overflow: hidden;
    }
    .bar-inner {
      width: 42%; height: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #f59e0b, #38bdf8, #fb7185);
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
    <div class="badge"><img src="${BRAND_ICON_DATA_URI}" alt="CooDance Studio" /></div>
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

interface WindowStateSnapshot {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
  appVersion: string;
}

type DesktopEditAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';
type DesktopViewAction =
  | 'reload'
  | 'forceReload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleFullScreen';

const isMac = process.platform === 'darwin';
const useCustomTitleBar = !isMac;

function getWindowStateSnapshot(win: BrowserWindow | null): WindowStateSnapshot {
  if (!win || win.isDestroyed()) {
    return {
      isMaximized: false,
      isFullScreen: false,
      isFocused: false,
      appVersion: app.getVersion(),
    };
  }
  return {
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
    isFocused: win.isFocused(),
    appVersion: app.getVersion(),
  };
}

function clampZoomFactor(factor: number): number {
  return Math.min(1.5, Math.max(0.7, Math.round(factor * 10) / 10));
}

function getZoomPercent(win: BrowserWindow | null): number {
  if (!win || win.isDestroyed()) return 100;
  return Math.round(win.webContents.getZoomFactor() * 100);
}

function emitWindowState(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('coodance:window-state', getWindowStateSnapshot(win));
}

function emitZoomChanged(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('coodance:zoom-changed', getZoomPercent(win));
}

function resolveSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function resolveDesktopWindowIcon(): Electron.NativeImage {
  const diskCandidates = [
    path.resolve(__dirname, '../build-resources/icon.png'),
    resolveBundledPath('apps', 'desktop', 'build-resources', 'icon.png'),
  ];
  for (const candidate of diskCandidates) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) return img;
    }
  }
  return nativeImage.createFromDataURL(BRAND_ICON_DATA_URI);
}

async function createMainWindow(): Promise<void> {
  const devUrl = process.env.COODANCE_DEV_URL;
  const windowIcon = resolveDesktopWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: !isSmokeTest,
    title: 'CooDance Studio — Code-as-Video 16:9',
    icon: windowIcon,
    backgroundColor: '#0b0d11',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 16 },
        }
      : {
          frame: false,
          titleBarStyle: 'hidden' as const,
          autoHideMenuBar: false,
          thickFrame: true,
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (useCustomTitleBar) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.removeMenu();
  }

  const syncState = () => emitWindowState(mainWindow);
  mainWindow.on('maximize', syncState);
  mainWindow.on('unmaximize', syncState);
  mainWindow.on('enter-full-screen', syncState);
  mainWindow.on('leave-full-screen', syncState);
  mainWindow.on('focus', syncState);
  mainWindow.on('blur', syncState);
  mainWindow.on('restore', syncState);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Preserve essential View/DevTools/Zoom shortcuts on Windows/Linux without native menu bar
  if (useCustomTitleBar) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !mainWindow || mainWindow.isDestroyed()) return;
      const key = input.key.toLowerCase();
      const ctrl = input.control && !input.meta;

      if (input.key === 'F11') {
        event.preventDefault();
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        syncState();
        return;
      }

      if (input.key === 'F12' || (ctrl && input.shift && !input.alt && key === 'i')) {
        event.preventDefault();
        mainWindow.webContents.toggleDevTools();
        return;
      }

      if (input.key === 'F5' || (ctrl && !input.alt && key === 'r')) {
        event.preventDefault();
        if (input.shift || (ctrl && input.key === 'F5')) {
          mainWindow.webContents.reloadIgnoringCache();
        } else {
          mainWindow.webContents.reload();
        }
        return;
      }

      if (ctrl && !input.alt) {
        if (key === '0') {
          event.preventDefault();
          mainWindow.webContents.setZoomFactor(1);
          emitZoomChanged(mainWindow);
        } else if (key === '=' || key === '+') {
          event.preventDefault();
          mainWindow.webContents.setZoomFactor(
            clampZoomFactor(mainWindow.webContents.getZoomFactor() + 0.1),
          );
          emitZoomChanged(mainWindow);
        } else if (key === '-') {
          event.preventDefault();
          mainWindow.webContents.setZoomFactor(
            clampZoomFactor(mainWindow.webContents.getZoomFactor() - 0.1),
          );
          emitZoomChanged(mainWindow);
        }
      }
    });
  }

  // Provide clean native right-click editing menu inside inputs/textareas and selected text
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const hasSelection = Boolean(params.selectionText && params.selectionText.trim().length > 0);
    if (!params.isEditable && !hasSelection) return;

    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      items.push(
        { label: '撤销', role: 'undo', enabled: params.editFlags.canUndo },
        { label: '重做', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
        { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: '全选', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      );
    } else if (hasSelection) {
      items.push(
        { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '全选', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      );
    }

    if (items.length > 0) {
      Menu.buildFromTemplate(items).popup({ window: mainWindow });
    }
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
  const startedAt = Date.now();
  const logStage = (msg: string) => {
    console.log(`[coodance-smoke] (+${Date.now() - startedAt}ms) ${msg}`);
  };
  logStage(`starting (platform=${process.platform} arch=${process.arch})`);
  await createMainWindow();
  logStage(`window loaded (server=${serverHandle?.url || 'none'})`);
  if (!serverHandle) {
    throw new Error('Embedded server did not start during smoke test.');
  }
  const healthRes = await fetch(`${serverHandle.url}/api/health`);
  if (!healthRes.ok) {
    throw new Error(`/api/health returned HTTP ${healthRes.status}`);
  }
  const healthJson = (await healthRes.json()) as { ok?: boolean; version?: string; ffmpeg?: { ok?: boolean } };
  logStage(`/api/health ok=${Boolean(healthJson.ok)} ffmpegOk=${Boolean(healthJson.ffmpeg?.ok)}`);
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
          if (Date.now() - start > 15000) return resolve(0);
          setTimeout(check, 100);
        };
        check();
      })`,
    )) as number;
    if (!rootHtmlLen || rootHtmlLen <= 0) {
      throw new Error('Renderer #root did not mount any UI content within 15s.');
    }
    logStage(`renderer #root mounted (len=${rootHtmlLen})`);
  }

  const passLine = `[coodance-smoke] PASS arch=${process.arch} url=${serverHandle.url} version=${healthJson.version || 'unknown'} ffmpegOk=${Boolean(healthJson.ffmpeg?.ok)}`;
  console.log(passLine);
  if (process.env.COODANCE_SMOKE_RESULT_FILE) {
    try {
      fs.writeFileSync(process.env.COODANCE_SMOKE_RESULT_FILE, `${passLine}\n`, 'utf8');
    } catch {
      // non-fatal
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  await Promise.race([
    serverHandle.close().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  serverHandle = null;
  app.exit(0);
}

function buildAppMenu(): void {
  if (!isMac) {
    // On Windows/Linux, remove the native Win32/GTK menu bar entirely;
    // Edit/View/Zoom/DevTools controls are exposed through the custom in-app Studio TitleBar menu.
    Menu.setApplicationMenu(null);
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
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
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }],
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

ipcMain.handle('coodance:window-minimize', (event) => {
  const win = resolveSenderWindow(event);
  if (win && !win.isDestroyed()) {
    win.minimize();
  }
});

ipcMain.handle('coodance:window-toggle-maximize', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return getWindowStateSnapshot(null);
  if (win.isFullScreen()) {
    win.setFullScreen(false);
  } else if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  const state = getWindowStateSnapshot(win);
  emitWindowState(win);
  return state;
});

ipcMain.handle('coodance:window-toggle-fullscreen', (event) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return getWindowStateSnapshot(null);
  win.setFullScreen(!win.isFullScreen());
  const state = getWindowStateSnapshot(win);
  emitWindowState(win);
  return state;
});

ipcMain.handle('coodance:window-close', (event) => {
  const win = resolveSenderWindow(event);
  if (win && !win.isDestroyed()) {
    win.close();
  }
});

ipcMain.handle('coodance:window-get-state', (event) => {
  return getWindowStateSnapshot(resolveSenderWindow(event));
});

ipcMain.handle('coodance:window-set-theme', (event, theme: 'dark' | 'light') => {
  const win = resolveSenderWindow(event);
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(theme === 'light' ? '#f3f4f6' : '#0b0d11');
  }
});

ipcMain.handle('coodance:edit-action', (event, action: DesktopEditAction) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  switch (action) {
    case 'undo':
      wc.undo();
      break;
    case 'redo':
      wc.redo();
      break;
    case 'cut':
      wc.cut();
      break;
    case 'copy':
      wc.copy();
      break;
    case 'paste':
      wc.paste();
      break;
    case 'selectAll':
      wc.selectAll();
      break;
  }
});

ipcMain.handle('coodance:view-action', (event, action: DesktopViewAction) => {
  const win = resolveSenderWindow(event);
  if (!win || win.isDestroyed()) {
    return { zoomPercent: 100, state: getWindowStateSnapshot(null) };
  }
  const wc = win.webContents;
  switch (action) {
    case 'reload':
      wc.reload();
      break;
    case 'forceReload':
      wc.reloadIgnoringCache();
      break;
    case 'toggleDevTools':
      wc.toggleDevTools();
      break;
    case 'resetZoom':
      wc.setZoomFactor(1);
      emitZoomChanged(win);
      break;
    case 'zoomIn':
      wc.setZoomFactor(clampZoomFactor(wc.getZoomFactor() + 0.1));
      emitZoomChanged(win);
      break;
    case 'zoomOut':
      wc.setZoomFactor(clampZoomFactor(wc.getZoomFactor() - 0.1));
      emitZoomChanged(win);
      break;
    case 'toggleFullScreen':
      win.setFullScreen(!win.isFullScreen());
      emitWindowState(win);
      break;
  }
  return {
    zoomPercent: getZoomPercent(win),
    state: getWindowStateSnapshot(win),
  };
});

ipcMain.handle('coodance:view-get-zoom', (event) => {
  return getZoomPercent(resolveSenderWindow(event));
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
