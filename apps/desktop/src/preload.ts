import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopInstallActionResult,
  DesktopUpdateStatus,
  UpdateMirrorMode,
  UpdateMirrorTestResult,
} from '@coodance/core';

export interface WindowStateSnapshot {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
  appVersion: string;
}

export type DesktopEditAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';
export type DesktopViewAction =
  | 'reload'
  | 'forceReload'
  | 'toggleDevTools'
  | 'resetZoom'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleFullScreen';

contextBridge.exposeInMainWorld('coodanceDesktop', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  customTitleBar: process.platform !== 'darwin',
  selectDirectory: () => ipcRenderer.invoke('coodance:select-directory') as Promise<string | null>,
  revealPath: (targetPath: string) =>
    ipcRenderer.invoke('coodance:reveal-path', targetPath) as Promise<void>,
  openExternal: (url: string) =>
    ipcRenderer.invoke('coodance:open-external', url) as Promise<void>,
  windowMinimize: () => ipcRenderer.invoke('coodance:window-minimize') as Promise<void>,
  windowToggleMaximize: () =>
    ipcRenderer.invoke('coodance:window-toggle-maximize') as Promise<WindowStateSnapshot>,
  windowToggleFullscreen: () =>
    ipcRenderer.invoke('coodance:window-toggle-fullscreen') as Promise<WindowStateSnapshot>,
  windowClose: () => ipcRenderer.invoke('coodance:window-close') as Promise<void>,
  getWindowState: () =>
    ipcRenderer.invoke('coodance:window-get-state') as Promise<WindowStateSnapshot>,
  onWindowStateChange: (listener: (state: WindowStateSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowStateSnapshot) => {
      listener(state);
    };
    ipcRenderer.on('coodance:window-state', handler);
    return () => {
      ipcRenderer.removeListener('coodance:window-state', handler);
    };
  },
  setThemeBackground: (theme: 'dark' | 'light') =>
    ipcRenderer.invoke('coodance:window-set-theme', theme) as Promise<void>,
  executeEditAction: (action: DesktopEditAction) =>
    ipcRenderer.invoke('coodance:edit-action', action) as Promise<void>,
  executeViewAction: (action: DesktopViewAction) =>
    ipcRenderer.invoke('coodance:view-action', action) as Promise<{
      zoomPercent: number;
      state: WindowStateSnapshot;
    }>,
  getZoomPercent: () => ipcRenderer.invoke('coodance:view-get-zoom') as Promise<number>,
  onZoomChange: (listener: (zoomPercent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, zoomPercent: number) => {
      listener(zoomPercent);
    };
    ipcRenderer.on('coodance:zoom-changed', handler);
    return () => {
      ipcRenderer.removeListener('coodance:zoom-changed', handler);
    };
  },
  // Auto-Updater IPC Bridge
  getUpdateState: () =>
    ipcRenderer.invoke('coodance:update-get-state') as Promise<DesktopUpdateStatus>,
  checkForUpdates: (opts?: {
    manual?: boolean;
    mirrorMode?: UpdateMirrorMode;
    customMirrorPrefix?: string;
    includePrerelease?: boolean;
  }) => ipcRenderer.invoke('coodance:update-check', opts) as Promise<DesktopUpdateStatus>,
  startUpdateDownload: () =>
    ipcRenderer.invoke('coodance:update-download') as Promise<DesktopUpdateStatus>,
  cancelUpdateDownload: () =>
    ipcRenderer.invoke('coodance:update-cancel') as Promise<DesktopUpdateStatus>,
  installUpdate: () =>
    ipcRenderer.invoke('coodance:update-install') as Promise<DesktopInstallActionResult>,
  quitForUpdateInstall: () =>
    ipcRenderer.invoke('coodance:update-quit-for-install') as Promise<void>,
  skipUpdateVersion: (version: string) =>
    ipcRenderer.invoke('coodance:update-skip-version', version) as Promise<DesktopUpdateStatus>,
  testUpdateMirrors: (draft?: {
    mirrorMode?: UpdateMirrorMode;
    customMirrorPrefix?: string;
  }) => ipcRenderer.invoke('coodance:update-test-mirrors', draft) as Promise<UpdateMirrorTestResult[]>,
  revealDownloadedUpdate: () =>
    ipcRenderer.invoke('coodance:update-reveal-download') as Promise<void>,
  onUpdateStatusChange: (listener: (status: DesktopUpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopUpdateStatus) => {
      listener(status);
    };
    ipcRenderer.on('coodance:update-status', handler);
    return () => {
      ipcRenderer.removeListener('coodance:update-status', handler);
    };
  },
  onOpenUpdateModal: (listener: () => void) => {
    const handler = () => {
      listener();
    };
    ipcRenderer.on('coodance:open-update-modal', handler);
    return () => {
      ipcRenderer.removeListener('coodance:open-update-modal', handler);
    };
  },
});
