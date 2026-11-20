import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Clipboard,
  Copy,
  Download,
  FileText,
  Film,
  Languages,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Scissors,
  Settings,
  Sun,
  Tag,
  Terminal,
  TextSelect,
  Undo2,
} from 'lucide-react';
import type {
  DesktopEditAction,
  DesktopUpdateStatusDto,
  DesktopViewAction,
  DesktopWindowStateDto,
} from '../api';
import { UiLang, t } from '../i18n';
import { BrandMark } from './BrandMark';

export type StageTab = 'script' | 'assets' | 'storyboard' | 'render';

interface StudioTitleBarProps {
  lang: UiLang;
  uiTheme: 'dark' | 'light';
  activeTab: StageTab;
  activeSlug: string | null;
  windowState: DesktopWindowStateDto;
  updateStatus: DesktopUpdateStatusDto;
  onSelectTab: (tab: StageTab) => void;
  onOpenAgentHub: () => void;
  onOpenUpdateModal: () => void;
  onQuickSnapshot: () => void;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onWindowStateChange: (next: DesktopWindowStateDto) => void;
}

interface DesktopWindowControlsProps {
  lang: UiLang;
  windowState: DesktopWindowStateDto;
  onWindowStateChange: (next: DesktopWindowStateDto) => void;
}

export const DesktopWindowControls: React.FC<DesktopWindowControlsProps> = ({
  lang,
  windowState,
  onWindowStateChange,
}) => {
  const desktop = window.coodanceDesktop;
  if (!desktop?.customTitleBar) return null;

  const isRestorable = windowState.isMaximized || windowState.isFullScreen;
  const maxTooltip = windowState.isFullScreen
    ? t(lang, 'menuExitFullscreen')
    : windowState.isMaximized
      ? t(lang, 'winRestore')
      : t(lang, 'winMaximize');

  const handleMinimize = () => {
    void desktop.windowMinimize?.();
  };

  const handleToggleMaximize = async () => {
    const next = await desktop.windowToggleMaximize?.();
    if (next) onWindowStateChange(next);
  };

  const handleClose = () => {
    void desktop.windowClose?.();
  };

  return (
    <div className="window-controls" role="group" aria-label="Window Controls">
      <button
        id="btn-win-minimize"
        type="button"
        className="window-ctrl-btn"
        title={t(lang, 'winMinimize')}
        aria-label={t(lang, 'winMinimize')}
        onClick={handleMinimize}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <line
            x1="1.5"
            y1="6"
            x2="10.5"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <button
        id="btn-win-maximize"
        type="button"
        className="window-ctrl-btn"
        title={maxTooltip}
        aria-label={maxTooltip}
        onClick={() => void handleToggleMaximize()}
      >
        {windowState.isFullScreen ? (
          <Minimize2 size={12} strokeWidth={1.6} aria-hidden="true" />
        ) : isRestorable ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect
              x="1.75"
              y="3.75"
              width="6.5"
              height="6.5"
              rx="1.2"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M3.75 3.75V2.95C3.75 2.29 4.29 1.75 4.95 1.75H9.05C9.71 1.75 10.25 2.29 10.25 2.95V7.05C10.25 7.71 9.71 8.25 9.05 8.25H8.25"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect
              x="2"
              y="2"
              width="8"
              height="8"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        )}
      </button>

      <button
        id="btn-win-close"
        type="button"
        className="window-ctrl-btn window-ctrl-close"
        title={t(lang, 'winClose')}
        aria-label={t(lang, 'winClose')}
        onClick={handleClose}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

export const StudioTitleBar: React.FC<StudioTitleBarProps> = ({
  lang,
  uiTheme,
  activeTab,
  activeSlug,
  windowState,
  updateStatus,
  onSelectTab,
  onOpenAgentHub,
  onOpenUpdateModal,
  onQuickSnapshot,
  onToggleLang,
  onToggleTheme,
  onOpenSettings,
  onWindowStateChange,
}) => {
  const desktop = window.coodanceDesktop;
  const isDesktop = Boolean(desktop?.isDesktop);
  const isMac = desktop?.platform === 'darwin';
  const hasCustomWindowControls = Boolean(desktop?.customTitleBar);
  const modKey = isMac ? '⌘' : 'Ctrl+';

  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!desktop?.isDesktop) return;
    let mounted = true;
    void desktop.getZoomPercent?.().then((pct) => {
      if (mounted && typeof pct === 'number') setZoomPercent(pct);
    });
    const unsubZoom = desktop.onZoomChange?.((pct) => {
      setZoomPercent(pct);
    });
    return () => {
      mounted = false;
      unsubZoom?.();
    };
  }, [desktop]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const runEditAction = useCallback(
    async (action: DesktopEditAction) => {
      setMenuOpen(false);
      await desktop?.executeEditAction?.(action);
    },
    [desktop],
  );

  const runViewAction = useCallback(
    async (action: DesktopViewAction, keepMenuOpen = false) => {
      if (!keepMenuOpen) {
        setMenuOpen(false);
      }
      const res = await desktop?.executeViewAction?.(action);
      if (res) {
        setZoomPercent(res.zoomPercent);
        if (res.state) onWindowStateChange(res.state);
      }
    },
    [desktop, onWindowStateChange],
  );

  const platformLabel = desktop?.isDesktop
    ? desktop.platform === 'darwin'
      ? 'macOS Desktop'
      : desktop.platform === 'win32'
        ? 'Windows Desktop'
        : 'Linux Desktop'
    : 'Web Studio';

  const editItems: Array<{
    action: DesktopEditAction;
    label: string;
    shortcut: string;
    icon: React.ComponentType<{ size?: number }>;
  }> = [
    { action: 'undo', label: t(lang, 'menuUndo'), shortcut: `${modKey}Z`, icon: Undo2 },
    {
      action: 'redo',
      label: t(lang, 'menuRedo'),
      shortcut: isMac ? '⇧⌘Z' : 'Ctrl+Y',
      icon: Redo2,
    },
    { action: 'cut', label: t(lang, 'menuCut'), shortcut: `${modKey}X`, icon: Scissors },
    { action: 'copy', label: t(lang, 'menuCopy'), shortcut: `${modKey}C`, icon: Copy },
    { action: 'paste', label: t(lang, 'menuPaste'), shortcut: `${modKey}V`, icon: Clipboard },
    {
      action: 'selectAll',
      label: t(lang, 'menuSelectAll'),
      shortcut: `${modKey}A`,
      icon: TextSelect,
    },
  ];

  const topbarClasses = [
    'studio-topbar',
    isDesktop ? 'is-desktop' : '',
    isMac ? 'platform-darwin' : '',
    hasCustomWindowControls ? 'has-window-controls' : '',
    isDesktop && !windowState.isFocused ? 'window-unfocused' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <header className={topbarClasses}>
      {/* Left: Brand & Integrated Desktop Studio Menu */}
      <div className="topbar-left" ref={menuContainerRef}>
        {isDesktop ? (
          <div className="brand-menu-anchor">
            <button
              id="btn-studio-app-menu"
              type="button"
              className={`brand-menu-trigger ${menuOpen ? 'open' : ''}`}
              title={t(lang, 'appMenuTitle')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <BrandMark size="sm" />
              <h1 className="brand-title">CooDance</h1>
              <span className="brand-menu-chevron" aria-hidden="true">
                <ChevronDown size={13} />
              </span>
            </button>

            {menuOpen ? (
              <div
                id="studio-app-menu-popover"
                className="studio-app-menu"
                role="menu"
                aria-label={t(lang, 'appMenuTitle')}
              >
                <div className="app-menu-section">
                  <div className="app-menu-section-label">{t(lang, 'menuEdit')}</div>
                  <div className="app-menu-edit-grid">
                    {editItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.action}
                          type="button"
                          role="menuitem"
                          className="app-menu-grid-btn"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void runEditAction(item.action)}
                        >
                          <span className="app-menu-item-main">
                            <Icon size={13} />
                            <span>{item.label}</span>
                          </span>
                          <kbd className="app-menu-kbd">{item.shortcut}</kbd>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="app-menu-divider" />

                <div className="app-menu-section">
                  <div className="app-menu-section-label">{t(lang, 'menuView')}</div>

                  <div className="app-menu-zoom-row">
                    <span className="app-menu-zoom-label">{t(lang, 'menuZoom')}</span>
                    <div className="app-menu-zoom-stepper">
                      <button
                        type="button"
                        className="app-menu-zoom-btn"
                        title={`${modKey}-`}
                        disabled={zoomPercent <= 70}
                        onClick={() => void runViewAction('zoomOut', true)}
                      >
                        <Minus size={12} />
                      </button>
                      <button
                        type="button"
                        className="app-menu-zoom-value mono"
                        title={`${t(lang, 'menuZoomReset')} (${modKey}0)`}
                        onClick={() => void runViewAction('resetZoom', true)}
                      >
                        {zoomPercent}%
                      </button>
                      <button
                        type="button"
                        className="app-menu-zoom-btn"
                        title={`${modKey}+`}
                        disabled={zoomPercent >= 150}
                        onClick={() => void runViewAction('zoomIn', true)}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    className="app-menu-row"
                    onClick={() => void runViewAction('toggleFullScreen')}
                  >
                    <span className="app-menu-item-main">
                      {windowState.isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      <span>
                        {windowState.isFullScreen
                          ? t(lang, 'menuExitFullscreen')
                          : t(lang, 'menuFullscreen')}
                      </span>
                    </span>
                    <kbd className="app-menu-kbd">{isMac ? '⌃⌘F' : 'F11'}</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="app-menu-row"
                    onClick={() => void runViewAction('reload')}
                  >
                    <span className="app-menu-item-main">
                      <RefreshCw size={13} />
                      <span>{t(lang, 'menuReload')}</span>
                    </span>
                    <kbd className="app-menu-kbd">{`${modKey}R`}</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="app-menu-row"
                    onClick={() => void runViewAction('forceReload')}
                  >
                    <span className="app-menu-item-main">
                      <RotateCcw size={13} />
                      <span>{t(lang, 'menuForceReload')}</span>
                    </span>
                    <kbd className="app-menu-kbd">{isMac ? '⇧⌘R' : 'Ctrl+Shift+R'}</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="app-menu-row"
                    onClick={() => void runViewAction('toggleDevTools')}
                  >
                    <span className="app-menu-item-main">
                      <Terminal size={13} />
                      <span>{t(lang, 'menuDevTools')}</span>
                    </span>
                    <kbd className="app-menu-kbd">{isMac ? '⌥⌘I' : 'Ctrl+Shift+I'}</kbd>
                  </button>
                </div>

                <div className="app-menu-divider" />

                <div className="app-menu-section">
                  <button
                    id="btn-menu-check-update"
                    type="button"
                    role="menuitem"
                    className="app-menu-row"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenUpdateModal();
                    }}
                  >
                    <span className="app-menu-item-main">
                      <ArrowUpCircle size={13} />
                      <span>{t(lang, 'menuCheckUpdate')}</span>
                    </span>
                    {updateStatus.phase === 'ready' && updateStatus.checkResult ? (
                      <span className="chip chip-emerald mono" style={{ padding: '1px 6px', fontSize: 10 }}>
                        v{updateStatus.checkResult.latestVersion}
                      </span>
                    ) : updateStatus.phase === 'downloading' && updateStatus.download ? (
                      <span className="chip chip-cyan mono" style={{ padding: '1px 6px', fontSize: 10 }}>
                        {Math.round(updateStatus.download.percent)}%
                      </span>
                    ) : updateStatus.checkResult?.updateAvailable ? (
                      <span className="chip chip-accent mono" style={{ padding: '1px 6px', fontSize: 10 }}>
                        v{updateStatus.checkResult.latestVersion}
                      </span>
                    ) : (
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        v{windowState.appVersion || updateStatus.currentVersion}
                      </span>
                    )}
                  </button>
                </div>

                <div className="app-menu-footer">
                  <span className="status-dot" />
                  <span>{platformLabel}</span>
                  {windowState.appVersion || updateStatus.currentVersion ? (
                    <span className="mono app-menu-version">
                      v{windowState.appVersion || updateStatus.currentVersion}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="brand-group">
            <BrandMark size="sm" />
            <h1 className="brand-title">CooDance</h1>
            <button
              id="btn-web-version-badge"
              type="button"
              className="brand-badge brand-badge-btn"
              title={t(lang, 'updateCenter')}
              onClick={onOpenUpdateModal}
            >
              {platformLabel}
              {updateStatus.currentVersion ? ` · v${updateStatus.currentVersion}` : ''}
            </button>
          </div>
        )}
      </div>

      {/* Center: 4-Stage Video Pipeline Switcher */}
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
              onClick={() => onSelectTab(item.id)}
            >
              <span className="stage-step-num">{item.num}</span>
              <Icon size={13} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Studio Actions + Custom Window Controls */}
      <div className="topbar-right">
        <div className="topbar-actions">
          {updateStatus.phase === 'downloading' || updateStatus.phase === 'verifying' ? (
            <button
              id="btn-topbar-update-pill"
              type="button"
              className="btn btn-sm topbar-update-pill downloading"
              title={t(lang, 'updateCenter')}
              onClick={onOpenUpdateModal}
            >
              <Loader2 size={12} className="spin-icon" />
              <span className="mono">
                {updateStatus.phase === 'verifying'
                  ? lang === 'zh-CN'
                    ? '校验中'
                    : 'Verifying'
                  : `${t(lang, 'updateDownloadingShort')} ${Math.round(updateStatus.download?.percent || 0)}%`}
              </span>
            </button>
          ) : updateStatus.phase === 'ready' && updateStatus.checkResult ? (
            <button
              id="btn-topbar-update-pill"
              type="button"
              className="btn btn-sm topbar-update-pill ready"
              title={t(lang, 'updateCenter')}
              onClick={onOpenUpdateModal}
            >
              <CheckCircle2 size={12} />
              <span>
                {t(lang, 'updateReadyShort')} v{updateStatus.checkResult.latestVersion}
              </span>
            </button>
          ) : updateStatus.checkResult?.updateAvailable && !updateStatus.checkResult.isSkipped ? (
            <button
              id="btn-topbar-update-pill"
              type="button"
              className="btn btn-sm topbar-update-pill available"
              title={t(lang, 'updateCenter')}
              onClick={onOpenUpdateModal}
            >
              <Download size={12} />
              <span>
                {t(lang, 'updateAvailableShort')} v{updateStatus.checkResult.latestVersion}
              </span>
            </button>
          ) : null}

          <button
            id="btn-open-agent-hub"
            type="button"
            className="btn btn-sm topbar-agent-btn"
            title={t(lang, 'agentHub')}
            onClick={onOpenAgentHub}
          >
            <Bot size={13} />
            <span>{t(lang, 'agentHubShort')}</span>
            <span className="topbar-hide-compact"> (MCP &amp; Skill)</span>
          </button>

          {activeSlug ? (
            <button
              id="btn-quick-snapshot"
              type="button"
              className="btn btn-sm topbar-icon-collapse"
              title={t(lang, 'quickSnapshot')}
              onClick={onQuickSnapshot}
            >
              <Tag size={13} />
              <span className="topbar-hide-narrow">{t(lang, 'quickSnapshot')}</span>
            </button>
          ) : null}

          <button
            type="button"
            className="btn btn-sm btn-icon"
            title={lang === 'zh-CN' ? 'Switch to English' : '切换中文'}
            onClick={onToggleLang}
          >
            <Languages size={14} />
          </button>

          <button
            id="btn-theme-toggle"
            type="button"
            className="btn btn-sm btn-icon"
            title={uiTheme === 'dark' ? '切换浅色主题' : '切换暗色工坊主题'}
            onClick={onToggleTheme}
          >
            {uiTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          <button
            id="btn-open-settings"
            type="button"
            className="btn btn-sm topbar-icon-collapse"
            title={t(lang, 'settings')}
            onClick={onOpenSettings}
          >
            <Settings size={13} />
            <span className="topbar-hide-narrow">{t(lang, 'settings')}</span>
          </button>
        </div>

        {hasCustomWindowControls ? (
          <>
            <span className="window-controls-divider" aria-hidden="true" />
            <DesktopWindowControls
              lang={lang}
              windowState={windowState}
              onWindowStateChange={onWindowStateChange}
            />
          </>
        ) : null}
      </div>
    </header>
  );
};
