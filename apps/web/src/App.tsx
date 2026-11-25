import React, { useCallback, useEffect, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import { FolderOpen, Play, Radio } from 'lucide-react';
import {
  DesktopInstallActionResultDto,
  DesktopUpdateStatusDto,
  DesktopWindowStateDto,
  FfmpegHealthDto,
  ProgressEventDto,
  ProjectSummaryDto,
  ProjectWorkspaceDto,
  SettingsDto,
  UpdateCheckResultDto,
  UpdateMirrorMode,
  UpdateMirrorTestResultDto,
  apiRequest,
  connectStudioWs,
  setStoredToken,
} from './api';
import { UiLang, t } from './i18n';
import { DesktopWindowControls, StageTab, StudioTitleBar } from './components/StudioTitleBar';
import { BrandMark } from './components/BrandMark';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ScriptTtsView } from './components/ScriptTtsView';
import { AssetInspectorView } from './components/AssetInspectorView';
import { StoryboardStudioView } from './components/StoryboardStudioView';
import { RenderSnapshotsView } from './components/RenderSnapshotsView';
import { SettingsModal } from './components/SettingsModal';
import { AgentHubModal } from './components/AgentHubModal';
import { UpdateModal } from './components/UpdateModal';
import {
  Button,
  CommandPalette,
  ResizeHandle,
  StudioInput,
  StudioTooltipProvider,
  cn,
} from './components/ui';

const FALLBACK_UPDATE_SETTINGS: SettingsDto['update'] = {
  autoCheck: true,
  autoDownload: false,
  includePrerelease: false,
  mirrorMode: 'auto',
  customMirrorPrefix: '',
  skippedVersion: '',
};

export const App: React.FC = () => {
  const [lang, setLang] = useState<UiLang>('zh-CN');
  const [uiTheme, setUiTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<StageTab>('storyboard');

  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [ffmpeg, setFfmpeg] = useState<FfmpegHealthDto | null>(null);
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ProjectWorkspaceDto | null>(null);

  const [authNeeded, setAuthNeeded] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [settingsFocusSection, setSettingsFocusSection] = useState<'general' | 'update'>('general');
  const [showAgentHub, setShowAgentHub] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const [busyDemo, setBusyDemo] = useState(false);
  const [liveProgress, setLiveProgress] = useState<ProgressEventDto | null>(null);
  const [renderLogs, setRenderLogs] = useState<ProgressEventDto[]>([]);
  const [toast, setToast] = useState<{ msg: string; level: 'info' | 'success' | 'error' } | null>(null);
  const [lastHotReload, setLastHotReload] = useState<string | null>(null);
  const [pendingTrimPick, setPendingTrimPick] = useState<{
    assetPath: string;
    trimStartSec: number;
  } | null>(null);
  const [windowState, setWindowState] = useState<DesktopWindowStateDto>({
    isMaximized: false,
    isFullScreen: false,
    isFocused: true,
    appVersion: '',
  });
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatusDto>({
    phase: 'idle',
    currentVersion: '1.3.0',
    target: {
      isDesktop: Boolean(window.coodanceDesktop?.isDesktop),
      platform: window.coodanceDesktop?.platform || 'web',
      arch: window.coodanceDesktop?.arch || 'x64',
      installKind: window.coodanceDesktop?.isDesktop ? 'nsis' : 'web',
      currentVersion: '1.3.0',
    },
    checkResult: null,
    download: null,
    error: null,
    lastCheckedAt: null,
  });

  const isDesktop = Boolean(window.coodanceDesktop?.isDesktop);

  const notify = useCallback((msg: string, level: 'info' | 'success' | 'error' = 'info') => {
    setToast({ msg, level });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Global Cmd+K / Ctrl+K shortcut for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    void window.coodanceDesktop?.setThemeBackground?.(uiTheme);
  }, [uiTheme]);

  useEffect(() => {
    const desktop = window.coodanceDesktop;
    if (!desktop?.isDesktop) return;
    let mounted = true;
    void desktop.getWindowState?.().then((state) => {
      if (mounted && state) setWindowState(state);
    });
    const unsub = desktop.onWindowStateChange?.((state) => {
      setWindowState(state);
    });
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);

  // Desktop IPC Update Bridge Subscriptions
  useEffect(() => {
    const desktop = window.coodanceDesktop;
    if (!desktop?.isDesktop) return;
    let mounted = true;
    void desktop.getUpdateState?.().then((st) => {
      if (mounted && st) setUpdateStatus(st);
    });
    const unsubStatus = desktop.onUpdateStatusChange?.((st) => {
      setUpdateStatus(st);
    });
    const unsubOpen = desktop.onOpenUpdateModal?.(() => {
      setShowUpdateModal(true);
    });
    return () => {
      mounted = false;
      unsubStatus?.();
      unsubOpen?.();
    };
  }, []);

  const handleCheckUpdates = useCallback(async (manual = true) => {
    const desktop = window.coodanceDesktop;
    if (desktop?.isDesktop && desktop.checkForUpdates) {
      const next = await desktop.checkForUpdates({ manual });
      if (next) setUpdateStatus(next);
      return;
    }

    setUpdateStatus((prev) => ({ ...prev, phase: 'checking', error: null }));
    try {
      const res = await apiRequest<{
        result: UpdateCheckResultDto;
        updateSettings: SettingsDto['update'];
      }>('/api/update/check', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSettings((prev) => (prev ? { ...prev, update: res.updateSettings } : prev));
      setUpdateStatus((prev) => ({
        ...prev,
        phase: res.result.updateAvailable ? 'available' : 'up-to-date',
        currentVersion: res.result.currentVersion,
        target: res.result.target,
        checkResult: res.result,
        download: null,
        error: null,
        lastCheckedAt: res.result.checkedAt,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setUpdateStatus((prev) => ({
        ...prev,
        phase: manual ? 'error' : prev.phase === 'checking' ? 'idle' : prev.phase,
        error: manual ? msg : prev.error,
      }));
    }
  }, []);

  useEffect(() => {
    if (isDesktop || authNeeded) return;
    let mounted = true;
    void apiRequest<{
      currentVersion: string;
      platform: string;
      arch: string;
      lastCheck: UpdateCheckResultDto | null;
    }>('/api/update/status')
      .then((res) => {
        if (!mounted) return;
        setUpdateStatus((prev) => ({
          ...prev,
          currentVersion: res.currentVersion,
          target: {
            isDesktop: false,
            platform: res.platform,
            arch: res.arch,
            installKind: 'web',
            currentVersion: res.currentVersion,
          },
          checkResult: res.lastCheck || prev.checkResult,
          phase: res.lastCheck
            ? res.lastCheck.updateAvailable
              ? 'available'
              : 'up-to-date'
            : prev.phase,
          lastCheckedAt: res.lastCheck?.checkedAt || prev.lastCheckedAt,
        }));
      })
      .catch(() => {
        // non-fatal
      });
    return () => {
      mounted = false;
    };
  }, [isDesktop, authNeeded]);

  useEffect(() => {
    if (isDesktop || authNeeded || !settings) return;
    if (settings.update?.autoCheck === false) return;
    const startupTimer = window.setTimeout(() => {
      void handleCheckUpdates(false);
    }, 5000);
    const periodicTimer = window.setInterval(() => {
      void handleCheckUpdates(false);
    }, 12 * 60 * 60 * 1000);
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(periodicTimer);
    };
  }, [isDesktop, authNeeded, settings?.update?.autoCheck, handleCheckUpdates]);

  const handleStartUpdateDownload = useCallback(async () => {
    const desktop = window.coodanceDesktop;
    if (!desktop?.startUpdateDownload) return;
    const next = await desktop.startUpdateDownload();
    if (next) setUpdateStatus(next);
  }, []);

  const handleCancelUpdateDownload = useCallback(async () => {
    const desktop = window.coodanceDesktop;
    if (!desktop?.cancelUpdateDownload) return;
    const next = await desktop.cancelUpdateDownload();
    if (next) setUpdateStatus(next);
    notify('已取消更新下载（已保留断点缓存）', 'info');
  }, [notify]);

  const handleInstallUpdate = useCallback(async (): Promise<DesktopInstallActionResultDto | null> => {
    const desktop = window.coodanceDesktop;
    if (!desktop?.installUpdate) return null;
    try {
      const res = await desktop.installUpdate();
      notify(res.message, 'success');
      return res;
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
      return null;
    }
  }, [notify]);

  const handleQuitForInstall = useCallback(async () => {
    await window.coodanceDesktop?.quitForUpdateInstall?.();
  }, []);

  const handleSkipUpdateVersion = useCallback(
    async (version: string) => {
      const desktop = window.coodanceDesktop;
      if (desktop?.isDesktop && desktop.skipUpdateVersion) {
        const next = await desktop.skipUpdateVersion(version);
        if (next) setUpdateStatus(next);
        setSettings((prev) =>
          prev
            ? { ...prev, update: { ...(prev.update || FALLBACK_UPDATE_SETTINGS), skippedVersion: version } }
            : prev,
        );
      } else {
        const res = await apiRequest<{
          updateSettings: SettingsDto['update'];
          lastCheck: UpdateCheckResultDto | null;
        }>('/api/update/skip', {
          method: 'POST',
          body: JSON.stringify({ version }),
        });
        setSettings((prev) => (prev ? { ...prev, update: res.updateSettings } : prev));
        setUpdateStatus((prev) => ({
          ...prev,
          checkResult:
            res.lastCheck || (prev.checkResult ? { ...prev.checkResult, isSkipped: Boolean(version) } : null),
        }));
      }
      notify(version ? `已跳过 v${version} 的更新提醒` : '已恢复版本更新提醒', 'info');
    },
    [notify],
  );

  const handleTestUpdateMirrors = useCallback(
    async (draft: {
      mirrorMode: UpdateMirrorMode;
      customMirrorPrefix: string;
    }): Promise<UpdateMirrorTestResultDto[]> => {
      const desktop = window.coodanceDesktop;
      if (desktop?.isDesktop && desktop.testUpdateMirrors) {
        return desktop.testUpdateMirrors(draft);
      }
      const res = await apiRequest<{ results: UpdateMirrorTestResultDto[] }>(
        '/api/update/test-mirrors',
        {
          method: 'POST',
          body: JSON.stringify(draft),
        },
      );
      return res.results;
    },
    [],
  );

  const handleRevealUpdateDownload = useCallback(async () => {
    await window.coodanceDesktop?.revealDownloadedUpdate?.();
  }, []);

  const loadProjectWorkspace = useCallback(async (slug: string) => {
    const data = await apiRequest<ProjectWorkspaceDto>(`/api/projects/${encodeURIComponent(slug)}`);
    setWorkspace(data);
  }, []);

  const loadAll = useCallback(
    async (preferSlug?: string) => {
      try {
        const [setRes, projRes] = await Promise.all([
          apiRequest<{ settings: SettingsDto; ffmpeg: FfmpegHealthDto }>('/api/settings'),
          apiRequest<{ workspaceDir: string; projects: ProjectSummaryDto[] }>('/api/projects'),
        ]);
        setAuthNeeded(false);
        setSettings(setRes.settings);
        setFfmpeg(setRes.ffmpeg);
        setLang(setRes.settings.language || 'zh-CN');
        setUiTheme(setRes.settings.uiTheme || 'dark');
        setWorkspaceDir(projRes.workspaceDir);
        setProjects(projRes.projects);

        const nextSlug =
          preferSlug && projRes.projects.some((p) => p.slug === preferSlug)
            ? preferSlug
            : activeSlug && projRes.projects.some((p) => p.slug === activeSlug)
              ? activeSlug
              : projRes.projects[0]?.slug || null;

        setActiveSlug(nextSlug);
        if (nextSlug) {
          await loadProjectWorkspace(nextSlug);
        } else {
          setWorkspace(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Unauthorized') || msg.includes('401')) {
          setAuthNeeded(true);
        } else {
          notify(msg, 'error');
        }
      }
    },
    [activeSlug, loadProjectWorkspace, notify],
  );

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (authNeeded) return;
    return connectStudioWs(
      (ev) => {
        setLiveProgress(ev);
        if (ev.kind === 'render') {
          setRenderLogs((prev) => [...prev.slice(-80), ev]);
        }
        if (ev.progress >= 1) {
          window.setTimeout(() => {
            setLiveProgress((curr) => (curr?.jobId === ev.jobId ? null : curr));
          }, 2600);
        }
      },
      (fileEv) => {
        if (fileEv.projectSlug === activeSlug) {
          setLastHotReload(`${fileEv.relativePath} · ${new Date().toLocaleTimeString()}`);
          void loadProjectWorkspace(fileEv.projectSlug);
        }
      },
    );
  }, [activeSlug, authNeeded, loadProjectWorkspace]);

  const handleSelectProject = async (slug: string) => {
    setActiveSlug(slug);
    await loadProjectWorkspace(slug);
  };

  const handleCreateProject = async (payload: {
    slug: string;
    title: string;
    theme: 'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald';
  }) => {
    const res = await apiRequest<{ project: ProjectSummaryDto }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await loadAll(res.project.slug);
    setActiveTab('script');
    notify(`✔ 已创建工程: ${res.project.slug}`, 'success');
  };

  const handleCreateDemo = async () => {
    setBusyDemo(true);
    try {
      const res = await apiRequest<{ project: ProjectSummaryDto }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ demo: true, slug: 'demo-coodance-launch' }),
      });
      await loadAll(res.project.slug);
      setActiveTab('storyboard');
      notify('✔ 完整 6 镜实机示例工程已就绪，可直接点击播放或渲染！', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyDemo(false);
    }
  };

  const handleDeleteProject = async (slug: string) => {
    await apiRequest(`/api/projects/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    await loadAll();
    notify(`已删除工程: ${slug}`, 'info');
  };

  const handleSaveSettings = async (next: SettingsDto) => {
    const res = await apiRequest<{ settings: SettingsDto; ffmpeg: FfmpegHealthDto }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(next),
    });
    setSettings(res.settings);
    setFfmpeg(res.ffmpeg);
    setWorkspaceDir(res.settings.workspaceDir);
    await loadAll();
    notify('✔ 设置已保存', 'success');
  };

  const handleQuickSnapshot = async () => {
    if (!activeSlug) return;
    try {
      const res = await apiRequest<{ snapshot: { tag: string } }>(
        `/api/projects/${encodeURIComponent(activeSlug)}/snapshots`,
        {
          method: 'POST',
          body: JSON.stringify({ note: 'Quick studio snapshot' }),
        },
      );
      await loadProjectWorkspace(activeSlug);
      notify(`✔ 已生成快照标签 ${res.snapshot.tag}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const openUpdateCenter = () => {
    setShowUpdateModal(true);
    if (updateStatus.phase === 'idle') {
      void handleCheckUpdates(true);
    }
  };

  const isFramelessDesktop = Boolean(window.coodanceDesktop?.customTitleBar);
  const shellClasses = cn(
    'studio-shell flex flex-col w-full h-full bg-canvas overflow-hidden relative',
    isFramelessDesktop && 'desktop-frameless',
    windowState.isMaximized && 'is-maximized',
    windowState.isFullScreen && 'is-fullscreen',
  );

  if (authNeeded) {
    return (
      <div
        className={cn(
          'auth-shell flex flex-col w-full h-full bg-canvas relative',
          isFramelessDesktop && 'desktop-frameless',
          windowState.isMaximized && 'is-maximized',
        )}
      >
        {isFramelessDesktop ? (
          <header className="studio-topbar is-desktop has-window-controls">
            <div className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span className="text-[13.5px] font-bold tracking-[-0.02em] text-text-primary">
                CooDance
              </span>
            </div>
            <div className="flex items-center h-full">
              <DesktopWindowControls
                lang={lang}
                windowState={windowState}
                onWindowStateChange={setWindowState}
              />
            </div>
          </header>
        ) : null}

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-[380px] p-6 rounded-[10px] bg-panel border border-border-strong shadow-studio-lg flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <BrandMark size="md" />
              <div>
                <h2 className="m-0 text-[14px] font-semibold text-text-primary">
                  CooDance Web 访问认证
                </h2>
                <div className="text-[11.5px] text-text-muted mt-0.5">
                  自托管访问口令保护
                </div>
              </div>
            </div>
            <div className="text-[12px] text-text-secondary leading-relaxed">
              当前自托管服务启用了访问口令保护，请输入{' '}
              <code className="font-mono text-text-primary">COODANCE_ACCESS_TOKEN</code>。
            </div>
            <StudioInput
              type="password"
              mono
              placeholder="输入访问口令..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setStoredToken(tokenInput.trim());
                void loadAll();
              }}
              className="w-full"
            >
              解锁工作台
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <StudioTooltipProvider>
      <div className={shellClasses}>
        {/* 44px Precision Topbar */}
        <StudioTitleBar
          lang={lang}
          uiTheme={uiTheme}
          activeTab={activeTab}
          activeSlug={activeSlug}
          windowState={windowState}
          updateStatus={updateStatus}
          onSelectTab={setActiveTab}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenAgentHub={() => setShowAgentHub(true)}
          onOpenUpdateModal={openUpdateCenter}
          onQuickSnapshot={() => void handleQuickSnapshot()}
          onToggleLang={() => setLang((l) => (l === 'zh-CN' ? 'en-US' : 'zh-CN'))}
          onToggleTheme={() => setUiTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
          onOpenSettings={() => {
            setSettingsFocusSection('general');
            setShowSettings(true);
          }}
          onWindowStateChange={setWindowState}
        />

        {/* Edge-to-Edge Resizable Main Body: Project Sidebar (248px) + Stage */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <Group orientation="horizontal" className="flex-1 min-h-0">
            <Panel defaultSize="248px" minSize="200px" maxSize="360px">
              <ProjectSidebar
                lang={lang}
                workspaceDir={workspaceDir}
                projects={projects}
                activeSlug={activeSlug}
                busyDemo={busyDemo}
                onSelectProject={(slug) => void handleSelectProject(slug)}
                onCreateProject={handleCreateProject}
                onCreateDemo={handleCreateDemo}
                onDeleteProject={handleDeleteProject}
                onChangeWorkspaceDir={async (dir) => {
                  if (settings) {
                    await handleSaveSettings({ ...settings, workspaceDir: dir });
                  }
                }}
              />
            </Panel>

            <ResizeHandle />

            <Panel minSize="48%">
              <main className="h-full w-full flex flex-col min-w-0 min-h-0 overflow-hidden bg-canvas">
                {/* Live Job Progress Banner */}
                {liveProgress ? (
                  <div className="flex items-center gap-3 px-3.5 h-8 bg-panel border-b border-border-subtle shrink-0 text-[11.5px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    <span className="font-mono text-[10.5px] font-semibold uppercase text-accent">
                      {liveProgress.kind}
                    </span>
                    <div className="w-[160px] h-1 rounded-full bg-hover overflow-hidden shrink-0">
                      <div
                        className="h-full bg-accent transition-all duration-150"
                        style={{ width: `${Math.round(liveProgress.progress * 100)}%` }}
                      />
                    </div>
                    <span className="text-text-primary truncate">{liveProgress.message}</span>
                  </div>
                ) : null}

                {/* 32px Precision Project Status Bar */}
                {workspace ? (
                  <div className="flex items-center justify-between gap-3 px-3.5 h-8 bg-panel/75 border-b border-border-subtle text-[11.5px] shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald shrink-0" />
                      <span className="font-semibold text-text-primary truncate">
                        {workspace.summary.title}
                      </span>
                      <span className="font-mono text-[11px] text-text-muted truncate hidden md:inline">
                        {workspace.summary.path}
                      </span>
                      {window.coodanceDesktop?.isDesktop ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void window.coodanceDesktop?.revealPath(workspace.summary.path)}
                          className="h-5 px-1.5 text-[10.5px]"
                        >
                          <FolderOpen size={11} />
                          <span>{lang === 'zh-CN' ? '打开目录' : 'Reveal'}</span>
                        </Button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-mono text-[10.5px] text-text-muted">
                      <Radio
                        size={11}
                        className={lastHotReload ? 'text-accent' : 'text-emerald'}
                      />
                      <span className="truncate max-w-[260px]">
                        {lastHotReload
                          ? `${lang === 'zh-CN' ? '热更新' : 'Sync'}: ${lastHotReload}`
                          : lang === 'zh-CN'
                            ? '磁盘双向监听中'
                            : 'Disk watch active'}
                      </span>
                    </div>
                  </div>
                ) : null}

                {/* Active Stage View or Clean Welcome State */}
                {!workspace ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center">
                    <BrandMark size="lg" />
                    <div className="flex flex-col gap-1.5 max-w-[500px]">
                      <h2 className="m-0 text-[20px] font-bold tracking-[-0.025em] text-text-primary">
                        {t(lang, 'emptyTitle')}
                      </h2>
                      <p className="m-0 text-[13px] leading-relaxed text-text-secondary">
                        {t(lang, 'emptyDesc')}
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      disabled={busyDemo}
                      onClick={() => void handleCreateDemo()}
                    >
                      <Play size={13} />
                      <span>
                        {busyDemo ? '正在初始化 6 镜实机示例...' : t(lang, 'createDemo')}
                      </span>
                    </Button>
                  </div>
                ) : (
                  <>
                    {activeTab === 'script' && settings ? (
                      <ScriptTtsView
                        lang={lang}
                        uiTheme={uiTheme}
                        workspace={workspace}
                        settings={settings}
                        onRefresh={async () => {
                          await loadAll(workspace.summary.slug);
                        }}
                        onNotify={notify}
                      />
                    ) : null}

                    {activeTab === 'assets' ? (
                      <AssetInspectorView
                        lang={lang}
                        workspace={workspace}
                        onRefresh={async () => {
                          await loadAll(workspace.summary.slug);
                        }}
                        onNotify={notify}
                        onPickVideoTrim={(assetPath, trimStartSec) => {
                          setPendingTrimPick({ assetPath, trimStartSec });
                          setActiveTab('storyboard');
                        }}
                      />
                    ) : null}

                    {activeTab === 'storyboard' ? (
                      <StoryboardStudioView
                        lang={lang}
                        uiTheme={uiTheme}
                        workspace={workspace}
                        onRefresh={async () => {
                          await loadAll(workspace.summary.slug);
                        }}
                        onNotify={notify}
                        pendingTrimPick={pendingTrimPick}
                        onConsumedTrimPick={() => setPendingTrimPick(null)}
                      />
                    ) : null}

                    {activeTab === 'render' ? (
                      <RenderSnapshotsView
                        lang={lang}
                        uiTheme={uiTheme}
                        workspace={workspace}
                        renderLogs={renderLogs}
                        onRefresh={async () => {
                          await loadAll(workspace.summary.slug);
                        }}
                        onNotify={notify}
                      />
                    ) : null}
                  </>
                )}
              </main>
            </Panel>
          </Group>
        </div>

        {/* Bottom-Right Floating Toast Notification */}
        {toast ? (
          <div
            role="status"
            className={cn(
              'fixed bottom-4 right-4 z-[120] max-w-[420px] px-3.5 py-2.5 rounded-[8px]',
              'bg-elevated border border-border-strong shadow-studio-lg text-[12px] text-text-primary',
              'border-l-2',
              toast.level === 'error'
                ? 'border-l-danger'
                : toast.level === 'success'
                  ? 'border-l-emerald'
                  : 'border-l-accent',
            )}
          >
            {toast.msg}
          </div>
        ) : null}

        {/* Global Command Palette (Cmd+K / Ctrl+K) */}
        <CommandPalette
          open={showCommandPalette}
          onOpenChange={setShowCommandPalette}
          lang={lang}
          uiTheme={uiTheme}
          projects={projects}
          activeSlug={activeSlug}
          onSelectTab={setActiveTab}
          onSelectProject={(slug) => void handleSelectProject(slug)}
          onQuickSnapshot={() => void handleQuickSnapshot()}
          onOpenSettings={() => {
            setSettingsFocusSection('general');
            setShowSettings(true);
          }}
          onOpenAgentHub={() => setShowAgentHub(true)}
          onOpenUpdateModal={openUpdateCenter}
          onToggleTheme={() => setUiTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
          onToggleLang={() => setLang((l) => (l === 'zh-CN' ? 'en-US' : 'zh-CN'))}
        />

        {/* Settings Modal */}
        {showSettings && settings ? (
          <SettingsModal
            lang={lang}
            settings={settings}
            ffmpeg={ffmpeg}
            updateStatus={updateStatus}
            focusSection={settingsFocusSection}
            onClose={() => setShowSettings(false)}
            onSave={handleSaveSettings}
            onOpenUpdateCenter={openUpdateCenter}
            onTestMirrors={handleTestUpdateMirrors}
          />
        ) : null}

        {/* Software Update Center Modal */}
        {showUpdateModal ? (
          <UpdateModal
            lang={lang}
            isDesktop={isDesktop}
            status={updateStatus}
            updateSettings={settings?.update || FALLBACK_UPDATE_SETTINGS}
            onClose={() => setShowUpdateModal(false)}
            onCheckNow={() => handleCheckUpdates(true)}
            onStartDownload={handleStartUpdateDownload}
            onCancelDownload={handleCancelUpdateDownload}
            onInstallNow={handleInstallUpdate}
            onQuitForInstall={handleQuitForInstall}
            onSkipVersion={handleSkipUpdateVersion}
            onOpenSettings={() => {
              setShowUpdateModal(false);
              setSettingsFocusSection('update');
              setShowSettings(true);
            }}
            onRevealDownload={handleRevealUpdateDownload}
            onNotify={notify}
          />
        ) : null}

        {/* External AI Agent Hub Modal */}
        {showAgentHub && settings ? (
          <AgentHubModal
            lang={lang}
            uiTheme={uiTheme}
            settings={settings}
            activeProjectSlug={activeSlug}
            onClose={() => setShowAgentHub(false)}
            onSaveSettings={handleSaveSettings}
            onNotify={notify}
          />
        ) : null}
      </div>
    </StudioTooltipProvider>
  );
};
