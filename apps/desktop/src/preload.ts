import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('coodanceDesktop', {
  isDesktop: true,
  platform: process.platform,
  selectDirectory: () => ipcRenderer.invoke('coodance:select-directory') as Promise<string | null>,
  revealPath: (targetPath: string) =>
    ipcRenderer.invoke('coodance:reveal-path', targetPath) as Promise<void>,
  openExternal: (url: string) =>
    ipcRenderer.invoke('coodance:open-external', url) as Promise<void>,
});
