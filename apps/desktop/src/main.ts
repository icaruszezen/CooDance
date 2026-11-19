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

  // Use native dynamic import so CJS Electron main cleanly loads ESM @coodance/server
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{
    startStudioServer: (opts: {
      host?: string;
      port?: number;
      staticWebDir?: string;
    }) => Promise<RunningServerHandle>;
  }>;

  let mod: {
    startStudioServer: (opts: {
      host?: string;
      port?: number;
      staticWebDir?: string;
    }) => Promise<RunningServerHandle>;
  };

  try {
    // In packaged Electron apps, @coodance/server is bundled inside app.asar/node_modules
    // alongside express, @coodance/core, and all runtime dependencies.
    mod = await dynamicImport('@coodance/server/app');
  } catch {
    const serverEntry = resolveBundledPath('apps', 'server', 'dist', 'app.js');
    mod = await dynamicImport(pathToFileURL(serverEntry).href);
  }

  return mod.startStudioServer({
    host: '127.0.0.1',
    port: 0,
    staticWebDir,
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
