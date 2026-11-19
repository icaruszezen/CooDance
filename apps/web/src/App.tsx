import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings,
  Sun,
  Moon,
  Languages,
  Tag,
  Sparkles,
  FileText,
  Film,
  Layers,
  Clapperboard,
  FolderOpen,
  Radio,
  Bot,
} from 'lucide-react';
import {
  FfmpegHealthDto,
  ProgressEventDto,
  ProjectSummaryDto,
  ProjectWorkspaceDto,
  SettingsDto,
  apiRequest,
  connectStudioWs,
  setStoredToken,
} from './api';
import { UiLang, t } from './i18n';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ScriptTtsView } from './components/ScriptTtsView';
import { AssetInspectorView } from './components/AssetInspectorView';
import { StoryboardStudioView } from './components/StoryboardStudioView';
import { RenderSnapshotsView } from './components/RenderSnapshotsView';
import { SettingsModal } from './components/SettingsModal';
import { AgentHubModal } from './components/AgentHubModal';

type StageTab = 'script' | 'assets' | 'storyboard' | 'render';

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
  const [showAgentHub, setShowAgentHub] = useState(false);
  const [busyDemo, setBusyDemo] = useState(false);
  const [liveProgress, setLiveProgress] = useState<ProgressEventDto | null>(null);
  const [renderLogs, setRenderLogs] = useState<ProgressEventDto[]>([]);
  const [toast, setToast] = useState<{ msg: string; level: 'info' | 'success' | 'error' } | null>(null);
  const [lastHotReload, setLastHotReload] = useState<string | null>(null);
  const [pendingTrimPick, setPendingTrimPick] = useState<{
    assetPath: string;
    trimStartSec: number;
  } | null>(null);

  const notify = useCallback((msg: string, level: 'info' | 'success' | 'error' = 'info') => {
    setToast({ msg, level });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
  }, [uiTheme]);

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

  // Connect WebSocket for live progress & external file hot-reload
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

  if (authNeeded) {
    return (
      <div className="empty-stage" style={{ height: '100%' }}>
        <div className="panel-card" style={{ width: 380, padding: 22, gap: 14 }}>
          <h2 className="panel-title">CooDance Web 访问认证</h2>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', textAlign: 'left' }}>
            当前自托管服务启用了访问口令保护，请输入 <code className="mono">COODANCE_ACCESS_TOKEN</code>。
          </div>
          <input
            type="password"
            className="input mono"
            placeholder="输入访问口令..."
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStoredToken(tokenInput.trim());
              void loadAll();
            }}
          >
            解锁工作台
          </button>
        </div>
      </div>
    );
  }

  const platformBadge = window.coodanceDesktop?.isDesktop
    ? window.coodanceDesktop.platform === 'darwin'
      ? 'macOS Desktop'
      : window.coodanceDesktop.platform === 'win32'
        ? 'Windows Desktop'
        : 'Desktop'
    : 'Web Studio';

  return (
    <div className="studio-shell">
      {/* Top Studio Header Bar */}
      <header className="studio-topbar">
        <div className="brand-group">
          <div className="brand-mark">CD</div>
          <div>
            <h1 className="brand-title">CooDance</h1>
          </div>
          <span className="brand-badge">{platformBadge}</span>
        </div>

        <nav className="stage-nav" aria-label="Pipeline Stages">
          {(
            [
              { id: 'script', num: 1, label: t(lang, 'tabScript'), icon: FileText },
              { id: 'assets', num: 2, label: t(lang, 'tabAssets'), icon: Film },
              { id: 'storyboard', num: 3, label: t(lang, 'tabStoryboard'), icon: Layers },
              { id: 'render', num: 4, label: t(lang, 'tabRender'), icon: Clapperboard },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                type="button"
                className={`stage-tab ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <span className="stage-step-num">{item.num}</span>
                <Icon size={13} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <button
            id="btn-open-agent-hub"
            type="button"
            className="btn btn-sm topbar-agent-btn"
            onClick={() => setShowAgentHub(true)}
          >
            <Bot size={13} />
            {t(lang, 'agentHub')}
          </button>

          {activeSlug ? (
            <button
              id="btn-quick-snapshot"
              type="button"
              className="btn btn-sm"
              onClick={() => void handleQuickSnapshot()}
            >
              <Tag size={13} />
              {t(lang, 'quickSnapshot')}
            </button>
          ) : null}

          <button
            type="button"
            className="btn btn-sm btn-icon"
            title={lang === 'zh-CN' ? 'Switch to English' : '切换中文'}
            onClick={() => setLang((l) => (l === 'zh-CN' ? 'en-US' : 'zh-CN'))}
          >
            <Languages size={14} />
          </button>

          <button
            id="btn-theme-toggle"
            type="button"
            className="btn btn-sm btn-icon"
            title={uiTheme === 'dark' ? '切换浅色主题' : '切换暗色工坊主题'}
            onClick={() => setUiTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
          >
            {uiTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            id="btn-open-settings"
            type="button"
            className="btn btn-sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings size={13} />
            {t(lang, 'settings')}
          </button>
        </div>
      </header>

      {/* Left Project Switcher Sidebar */}
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

      {/* Main Content Stage */}
      <main className="studio-main">
        {/* Live Progress Strip */}
        {liveProgress ? (
          <div className="live-progress-banner">
            <span className="status-dot busy" />
            <span className="chip chip-accent mono">{liveProgress.kind.toUpperCase()}</span>
            <div className="progress-rail">
              <div
                className="progress-fill"
                style={{ width: `${Math.round(liveProgress.progress * 100)}%` }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{liveProgress.message}</span>
          </div>
        ) : null}

        {/* Active Project Status Strip */}
        {workspace ? (
          <div className="workspace-status-strip">
            <div className="status-left">
              <span className="status-dot" />
              <strong style={{ color: 'var(--text-primary)' }}>{workspace.summary.title}</strong>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {workspace.summary.path}
              </span>
              {window.coodanceDesktop?.isDesktop ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ height: 23, fontSize: 11 }}
                  onClick={() => void window.coodanceDesktop?.revealPath(workspace.summary.path)}
                >
                  <FolderOpen size={11} /> 打开目录
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {lastHotReload ? (
                <span className="chip chip-emerald mono">
                  <Radio size={10} /> 热更新: {lastHotReload}
                </span>
              ) : (
                <span className="chip mono">
                  <Radio size={10} style={{ color: 'var(--emerald)' }} /> 磁盘双向监听中
                </span>
              )}
              {toast ? (
                <span
                  className={`chip ${toast.level === 'error' ? '' : toast.level === 'success' ? 'chip-emerald' : 'chip-cyan'}`}
                  style={
                    toast.level === 'error'
                      ? { background: 'var(--danger-soft)', color: 'var(--danger)', borderColor: 'transparent' }
                      : undefined
                  }
                >
                  {toast.msg}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Workspace Active View or Empty Welcome State */}
        {!workspace ? (
          <div className="empty-stage">
            <div className="brand-mark" style={{ width: 52, height: 52, fontSize: 22, borderRadius: 14 }}>
              CD
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
              {t(lang, 'emptyTitle')}
            </h2>
            <p style={{ margin: 0, maxWidth: 540, fontSize: 13.5, lineHeight: 1.7 }}>
              {t(lang, 'emptyDesc')}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyDemo}
                onClick={() => void handleCreateDemo()}
              >
                <Sparkles size={14} />
                {busyDemo ? '正在初始化 6 镜实机示例...' : t(lang, 'createDemo')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'script' && settings ? (
              <ScriptTtsView
                lang={lang}
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

      {/* Settings Modal */}
      {showSettings && settings ? (
        <SettingsModal
          lang={lang}
          settings={settings}
          ffmpeg={ffmpeg}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      ) : null}

      {/* External AI Agent Hub (MCP + Skill) Modal */}
      {showAgentHub && settings ? (
        <AgentHubModal
          lang={lang}
          settings={settings}
          activeProjectSlug={activeSlug}
          onClose={() => setShowAgentHub(false)}
          onSaveSettings={handleSaveSettings}
          onNotify={notify}
        />
      ) : null}
    </div>
  );
};
