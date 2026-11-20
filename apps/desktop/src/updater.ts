import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, net, shell } from 'electron';
import type {
  AppSettings,
  AppUpdateSettings,
  DesktopInstallActionResult,
  DesktopUpdateStatus,
  UpdateCheckResult,
  UpdateInstallKind,
  UpdateMirrorMode,
  UpdateMirrorTestResult,
  UpdateRuntimeTarget,
} from '@coodance/core';

type CoreUpdaterModule = typeof import('@coodance/core');

const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>;

const STARTUP_CHECK_DELAY_MS = 5000;
const PERIODIC_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface DesktopUpdateManagerOptions {
  getMainWindow: () => BrowserWindow | null;
  closeEmbeddedServer: () => Promise<void>;
  resolveBundledPath: (...segments: string[]) => string;
}

export class DesktopUpdateManager {
  private readonly getMainWindow: () => BrowserWindow | null;
  private readonly closeEmbeddedServer: () => Promise<void>;
  private readonly resolveBundledPath: (...segments: string[]) => string;

  private corePromise: Promise<CoreUpdaterModule> | null = null;
  private status: DesktopUpdateStatus;
  private checkInFlight: Promise<DesktopUpdateStatus> | null = null;
  private downloadAbortController: AbortController | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: DesktopUpdateManagerOptions) {
    this.getMainWindow = opts.getMainWindow;
    this.closeEmbeddedServer = opts.closeEmbeddedServer;
    this.resolveBundledPath = opts.resolveBundledPath;

    const target = this.detectRuntimeTarget();
    this.status = {
      phase: 'idle',
      currentVersion: target.currentVersion,
      target,
      checkResult: null,
      download: null,
      error: null,
      lastCheckedAt: null,
    };
  }

  private detectInstallKind(): UpdateInstallKind {
    if (process.platform === 'darwin') {
      return 'dmg';
    }
    if (process.platform === 'linux') {
      return 'appimage';
    }
    if (process.platform === 'win32') {
      if (!app.isPackaged) {
        return 'nsis';
      }
      const execDir = path.dirname(process.execPath);
      const uninstallerCandidates = [
        path.join(execDir, 'Uninstall CooDance Studio.exe'),
        path.join(execDir, 'Uninstall CooDance.exe'),
      ];
      const hasUninstaller = uninstallerCandidates.some((p) => fs.existsSync(p));
      return hasUninstaller ? 'nsis' : 'portable-zip';
    }
    return 'nsis';
  }

  private detectRuntimeTarget(): UpdateRuntimeTarget {
    return {
      isDesktop: true,
      platform: process.platform,
      arch: process.arch,
      installKind: this.detectInstallKind(),
      currentVersion: app.getVersion().replace(/^v/i, ''),
    };
  }

  private getElectronFetch(): (input: string, init?: RequestInit) => Promise<Response> {
    if (typeof net?.fetch === 'function') {
      return (input: string, init?: RequestInit) => net.fetch(input, init);
    }
    return (input: string, init?: RequestInit) => globalThis.fetch(input, init);
  }

  private async loadCore(): Promise<CoreUpdaterModule> {
    if (this.corePromise) return this.corePromise;
    this.corePromise = (async () => {
      try {
        return await dynamicImport<CoreUpdaterModule>('@coodance/core');
      } catch (primaryErr) {
        const coreEntry = this.resolveBundledPath('packages', 'core', 'dist', 'index.js');
        if (!app.isPackaged && fs.existsSync(coreEntry)) {
          return await dynamicImport<CoreUpdaterModule>(pathToFileURL(coreEntry).href);
        }
        throw primaryErr;
      }
    })();
    return this.corePromise;
  }

  private getUpdatesRootDir(): string {
    return path.join(app.getPath('userData'), 'updates');
  }

  private cleanupStaleDownloads(keepVersion: string): void {
    const root = this.getUpdatesRootDir();
    if (!fs.existsSync(root)) return;
    try {
      for (const entry of fs.readdirSync(root)) {
        if (entry === keepVersion) continue;
        const full = path.join(root, entry);
        fs.rmSync(full, { recursive: true, force: true });
      }
    } catch {
      // non-fatal cleanup
    }
  }

  private emitStatus(): void {
    const win = this.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('coodance:update-status', this.getStatus());
    }
  }

  private setStatus(patch: Partial<DesktopUpdateStatus>): DesktopUpdateStatus {
    this.status = {
      ...this.status,
      ...patch,
    };
    this.emitStatus();
    return this.getStatus();
  }

  public getStatus(): DesktopUpdateStatus {
    return structuredClone(this.status);
  }

  public startScheduler(): void {
    this.stopScheduler();

    this.startupTimer = setTimeout(() => {
      void this.runScheduledCheck();
    }, STARTUP_CHECK_DELAY_MS);

    this.periodicTimer = setInterval(() => {
      void this.runScheduledCheck();
    }, PERIODIC_CHECK_INTERVAL_MS);
  }

  public stopScheduler(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.downloadAbortController) {
      this.downloadAbortController.abort(new Error('应用退出，中止更新下载'));
      this.downloadAbortController = null;
    }
  }

  private async runScheduledCheck(): Promise<void> {
    try {
      const core = await this.loadCore();
      const settings = core.loadSettings();
      if (!settings.update.autoCheck) {
        return;
      }
      if (this.status.phase === 'downloading' || this.status.phase === 'verifying' || this.status.phase === 'installing') {
        return;
      }
      await this.checkForUpdates({ manual: false });
    } catch (err) {
      console.warn('[coodance-updater] Scheduled check failed:', err);
    }
  }

  public async checkForUpdates(opts: {
    manual?: boolean;
    mirrorMode?: UpdateMirrorMode;
    customMirrorPrefix?: string;
    includePrerelease?: boolean;
  } = {}): Promise<DesktopUpdateStatus> {
    if (this.checkInFlight) {
      return this.checkInFlight;
    }

    // Do not interrupt an active download
    if (
      this.status.phase === 'downloading' ||
      this.status.phase === 'verifying' ||
      this.status.phase === 'installing'
    ) {
      return this.getStatus();
    }

    const run = async (): Promise<DesktopUpdateStatus> => {
      const core = await this.loadCore();
      const currentSettings: AppSettings = core.loadSettings();
      const effectiveUpdateSettings: AppUpdateSettings = {
        ...currentSettings.update,
        ...(opts.mirrorMode ? { mirrorMode: opts.mirrorMode } : {}),
        ...(typeof opts.customMirrorPrefix === 'string'
          ? { customMirrorPrefix: opts.customMirrorPrefix.trim() }
          : {}),
        ...(typeof opts.includePrerelease === 'boolean'
          ? { includePrerelease: opts.includePrerelease }
          : {}),
      };

      const target = this.detectRuntimeTarget();
      this.setStatus({
        phase: 'checking',
        target,
        currentVersion: target.currentVersion,
        error: null,
      });

      try {
        const result: UpdateCheckResult = await core.checkForUpdates({
          settings: effectiveUpdateSettings,
          target,
          fetchFn: this.getElectronFetch(),
        });

        try {
          core.saveSettings({
            update: {
              ...currentSettings.update,
              lastCheckedAt: result.checkedAt,
            },
          });
        } catch {
          // non-fatal settings write error
        }

        if (!result.updateAvailable) {
          return this.setStatus({
            phase: 'up-to-date',
            checkResult: result,
            download: null,
            error: null,
            lastCheckedAt: result.checkedAt,
          });
        }

        // Check if this version's matched installer is already downloaded & verified on disk
        if (result.matchedAsset && result.matchedAsset.sha256) {
          const destDir = path.join(this.getUpdatesRootDir(), result.latestVersion);
          const cachedFile = path.join(destDir, path.basename(result.matchedAsset.name));
          if (fs.existsSync(cachedFile)) {
            try {
              const sha = await core.computeFileSha256(cachedFile);
              if (sha === result.matchedAsset.sha256.toLowerCase()) {
                const stat = fs.statSync(cachedFile);
                return this.setStatus({
                  phase: 'ready',
                  checkResult: result,
                  download: {
                    assetName: path.basename(result.matchedAsset.name),
                    totalBytes: stat.size,
                    downloadedBytes: stat.size,
                    percent: 100,
                    speedBytesPerSec: 0,
                    etaSec: 0,
                    activeMirrorId: result.sourceNode.id,
                    activeMirrorLabel: result.sourceNode.label,
                    attempt: 1,
                    maxAttempts: 1,
                    resumed: false,
                    filePath: cachedFile,
                    verifiedSha256: sha,
                  },
                  error: null,
                  lastCheckedAt: result.checkedAt,
                });
              }
            } catch {
              // ignore stale cache
            }
          }
        }

        const nextStatus = this.setStatus({
          phase: 'available',
          checkResult: result,
          download: null,
          error: null,
          lastCheckedAt: result.checkedAt,
        });

        // Optional silent background auto-download when user explicitly enabled autoDownload in Settings
        if (
          !opts.manual &&
          effectiveUpdateSettings.autoDownload &&
          !result.isSkipped &&
          result.matchedAsset
        ) {
          void this.startDownload().catch((err) => {
            console.warn('[coodance-updater] Auto-download failed:', err);
          });
        }

        return nextStatus;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return this.setStatus({
          phase: 'error',
          error: msg,
        });
      }
    };

    this.checkInFlight = run().finally(() => {
      this.checkInFlight = null;
    });
    return this.checkInFlight;
  }

  public async startDownload(): Promise<DesktopUpdateStatus> {
    if (this.status.phase === 'downloading' || this.status.phase === 'verifying') {
      return this.getStatus();
    }

    if (!this.status.checkResult || !this.status.checkResult.updateAvailable) {
      await this.checkForUpdates({ manual: true });
    }

    const checkResult = this.status.checkResult;
    if (!checkResult || !checkResult.updateAvailable) {
      return this.getStatus();
    }

    const asset = checkResult.matchedAsset;
    if (!asset) {
      return this.setStatus({
        phase: 'error',
        error: `未在 v${checkResult.latestVersion} 发布包中找到适配当前平台（${this.status.target.platform}/${this.status.target.arch}）的安装文件，请前往 GitHub Release 手动下载。`,
      });
    }

    const core = await this.loadCore();
    const settings = core.loadSettings();
    const mirrors = core.resolveMirrorCandidates(settings.update, checkResult.sourceNode.id);
    const destDir = path.join(this.getUpdatesRootDir(), checkResult.latestVersion);
    this.cleanupStaleDownloads(checkResult.latestVersion);

    const controller = new AbortController();
    this.downloadAbortController = controller;

    this.setStatus({
      phase: 'downloading',
      error: null,
      download: {
        assetName: asset.name,
        totalBytes: asset.size || 0,
        downloadedBytes: 0,
        percent: 0,
        speedBytesPerSec: 0,
        etaSec: null,
        activeMirrorId: mirrors[0]?.id || 'auto',
        activeMirrorLabel: mirrors[0]?.label || '准备加速节点...',
        attempt: 1,
        maxAttempts: mirrors.length,
        resumed: false,
      },
    });

    try {
      const result = await core.downloadAndVerifyUpdateAsset({
        asset,
        mirrors,
        destDir,
        fetchFn: this.getElectronFetch(),
        signal: controller.signal,
        onProgress: (info) => {
          this.setStatus({
            phase: 'downloading',
            download: {
              ...info,
            },
            error: null,
          });
        },
        onVerifying: (info) => {
          this.setStatus({
            phase: 'verifying',
            download: {
              ...info,
            },
            error: null,
          });
        },
      });

      this.downloadAbortController = null;
      return this.setStatus({
        phase: 'ready',
        download: {
          assetName: path.basename(result.filePath),
          totalBytes: result.sizeBytes,
          downloadedBytes: result.sizeBytes,
          percent: 100,
          speedBytesPerSec: 0,
          etaSec: 0,
          activeMirrorId: result.mirror.id,
          activeMirrorLabel: result.mirror.label,
          attempt: this.status.download?.attempt || 1,
          maxAttempts: mirrors.length,
          resumed: Boolean(this.status.download?.resumed),
          filePath: result.filePath,
          verifiedSha256: result.sha256,
        },
        error: null,
      });
    } catch (err) {
      this.downloadAbortController = null;
      if (controller.signal.aborted) {
        return this.setStatus({
          phase: 'available',
          download: null,
          error: null,
        });
      }
      const msg = err instanceof Error ? err.message : String(err);
      return this.setStatus({
        phase: 'error',
        error: msg,
      });
    }
  }

  public cancelDownload(): DesktopUpdateStatus {
    if (this.downloadAbortController) {
      this.downloadAbortController.abort(new Error('用户取消下载'));
      this.downloadAbortController = null;
    }
    if (this.status.phase === 'downloading' || this.status.phase === 'verifying') {
      return this.setStatus({
        phase: this.status.checkResult?.updateAvailable ? 'available' : 'idle',
        download: null,
        error: null,
      });
    }
    return this.getStatus();
  }

  public async installDownloadedUpdate(): Promise<DesktopInstallActionResult> {
    const filePath = this.status.download?.filePath;
    const expectedSha = this.status.checkResult?.matchedAsset?.sha256?.toLowerCase();
    if (this.status.phase !== 'ready' || !filePath || !fs.existsSync(filePath)) {
      throw new Error('更新安装包尚未准备就绪，请先完成下载与校验。');
    }

    // Re-verify SHA256 immediately before launching installer
    const core = await this.loadCore();
    if (!expectedSha || !/^[a-f0-9]{64}$/.test(expectedSha)) {
      throw new Error('缺少有效的官方 SHA256 校验和，已拒绝执行安装。');
    }
    const actualSha = await core.computeFileSha256(filePath);
    if (actualSha !== expectedSha) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore
      }
      this.setStatus({
        phase: 'error',
        download: null,
        error: '安装前二次 SHA256 校验失败，安装包可能已损坏，请重新下载。',
      });
      throw new Error('安装前二次 SHA256 校验失败，已删除异常文件。');
    }

    const installKind = this.status.checkResult?.matchedAsset?.installKind || this.status.target.installKind;

    if (process.platform === 'win32' && installKind === 'nsis') {
      this.setStatus({ phase: 'installing', error: null });
      await this.closeEmbeddedServer().catch(() => {});
      const child = spawn(filePath, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      setTimeout(() => {
        app.quit();
      }, 350);

      return {
        ok: true,
        action: 'launched-nsis',
        filePath,
        message: '已安全关闭本地服务并启动 Windows 安装向导，CooDance 即将退出以完成覆盖安装。',
        canQuitNow: false,
      };
    }

    if (process.platform === 'win32' && installKind === 'portable-zip') {
      shell.showItemInFolder(filePath);
      return {
        ok: true,
        action: 'revealed-portable-zip',
        filePath,
        message: '已在资源管理器中定位便携版压缩包（SHA256 校验通过）。请先点击下方「退出 CooDance」，再解压覆盖原目录即可完成升级。',
        canQuitNow: true,
      };
    }

    if (process.platform === 'darwin') {
      const openErr = await shell.openPath(filePath);
      if (openErr) {
        shell.showItemInFolder(filePath);
        throw new Error(`无法直接挂载 DMG（${openErr}），已在访达中定位安装包。`);
      }
      return {
        ok: true,
        action: 'opened-dmg',
        filePath,
        message: '已打开最新版 DMG 镜像（SHA256 校验通过）。请先点击下方「退出 CooDance」，再将 CooDance Studio 拖入 Applications 替换旧版即可。',
        canQuitNow: true,
      };
    }

    // Linux AppImage fallback
    try {
      fs.chmodSync(filePath, 0o755);
    } catch {
      // ignore
    }
    shell.showItemInFolder(filePath);
    return {
      ok: true,
      action: 'revealed-appimage',
      filePath,
      message: '已在文件管理器中定位最新版 AppImage 并赋予可执行权限，退出当前应用后即可替换运行。',
      canQuitNow: true,
    };
  }

  public async quitForInstall(): Promise<void> {
    await this.closeEmbeddedServer().catch(() => {});
    setTimeout(() => {
      app.quit();
    }, 150);
  }

  public async skipVersion(version: string): Promise<DesktopUpdateStatus> {
    const core = await this.loadCore();
    const current = core.loadSettings();
    const clean = version.trim().replace(/^v/i, '');
    core.saveSettings({
      update: {
        ...current.update,
        skippedVersion: clean,
      },
    });
    if (this.status.checkResult) {
      this.status.checkResult = {
        ...this.status.checkResult,
        isSkipped: Boolean(clean && clean === this.status.checkResult.latestVersion),
      };
    }
    this.emitStatus();
    return this.getStatus();
  }

  public async testMirrors(draft?: {
    mirrorMode?: UpdateMirrorMode;
    customMirrorPrefix?: string;
  }): Promise<UpdateMirrorTestResult[]> {
    const core = await this.loadCore();
    const settings = core.loadSettings();
    return core.probeUpdateMirrors(
      {
        mirrorMode: draft?.mirrorMode || settings.update.mirrorMode,
        customMirrorPrefix:
          typeof draft?.customMirrorPrefix === 'string'
            ? draft.customMirrorPrefix
            : settings.update.customMirrorPrefix,
      },
      {
        fetchFn: this.getElectronFetch(),
      },
    );
  }

  public revealDownloadedFile(): void {
    const filePath = this.status.download?.filePath;
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  }
}
