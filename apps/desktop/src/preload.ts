import { contextBridge, ipcRenderer } from 'electron';

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
});
