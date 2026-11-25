import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  Languages,
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
  Search,
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
import { Button, StudioTooltip, cn } from './ui';

export type StageTab = 'script' | 'assets' | 'storyboard' | 'render';

interface StudioTitleBarProps {
  lang: UiLang;
  uiTheme: 'dark' | 'light';
  activeTab: StageTab;
  activeSlug: string | null;
  windowState: DesktopWindowStateDto;
  updateStatus: DesktopUpdateStatusDto;
  onSelectTab: (tab: StageTab) => void;
  onOpenCommandPalette: () => void;
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
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
  onOpenCommandPalette,
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

  const topbarClasses = cn(
    'studio-topbar',
    isDesktop && 'is-desktop',
    isMac && 'platform-darwin',
    hasCustomWindowControls && 'has-window-controls',
    isDesktop && !windowState.isFocused && 'window-unfocused',
  );

  return (
    <header className={topbarClasses}>
      {/* Left: Brand & Integrated Desktop Studio Menu */}
      <div className="flex items-center gap-2 shrink-0" ref={menuContainerRef}>
        {isDesktop ? (
          <div className="brand-menu-anchor">
            <button
              id="btn-studio-app-menu"
              type="button"
              className={cn('brand-menu-trigger', menuOpen && 'open')}
              title={t(lang, 'appMenuTitle')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <BrandMark size="sm" />
              <span className="text-[13.5px] font-bold tracking-[-0.02em] text-text-primary">
                CooDance
              </span>
              <span className="brand-menu-chevron" aria-hidden="true">
                <ChevronDown size={12} />
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
                            <Icon size={12} />
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
                        <Minus size={11} />
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
                        <Plus size={11} />
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
                      {windowState.isFullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
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
                      <RefreshCw size={12} />
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
                      <RotateCcw size={12} />
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
                      <Terminal size={12} />
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
                      <ArrowUpCircle size={12} />
                      <span>{t(lang, 'menuCheckUpdate')}</span>
                    </span>
                    {updateStatus.phase === 'ready' && updateStatus.checkResult ? (
                      <span className="font-mono text-[10.5px] text-emerald">
                        v{updateStatus.checkResult.latestVersion}
                      </span>
                    ) : updateStatus.phase === 'downloading' && updateStatus.download ? (
                      <span className="font-mono text-[10.5px] text-cyan">
                        {Math.round(updateStatus.download.percent)}%
                      </span>
                    ) : updateStatus.checkResult?.updateAvailable ? (
                      <span className="font-mono text-[10.5px] text-accent">
                        v{updateStatus.checkResult.latestVersion}
                      </span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-text-muted">
                        v{windowState.appVersion || updateStatus.currentVersion}
                      </span>
                    )}
                  </button>
                </div>

                <div className="app-menu-footer">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald shrink-0" />
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
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <h1 className="m-0 text-[13.5px] font-bold tracking-[-0.02em] text-text-primary leading-none">
              CooDance
            </h1>
            <StudioTooltip content={t(lang, 'updateCenter')}>
              <button
                id="btn-web-version-badge"
                type="button"
                onClick={onOpenUpdateModal}
                className="font-mono text-[10.5px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded-[5px] border border-border-subtle bg-elevated/60 hover:bg-hover transition-colors cursor-pointer"
              >
                {updateStatus.currentVersion ? `v${updateStatus.currentVersion}` : platformLabel}
              </button>
            </StudioTooltip>
          </div>
        )}
      </div>

      {/* Center: 01..04 Precision Pipeline Segmented Switcher */}
      <nav
        className="stage-nav inline-flex items-center gap-0.5 p-[2px] rounded-[7px] bg-canvas border border-border-subtle shrink-0"
        aria-label="Pipeline Stages"
      >
        {(
          [
            { id: 'script', num: '01', label: t(lang, 'tabScript') },
            { id: 'assets', num: '02', label: t(lang, 'tabAssets') },
            { id: 'storyboard', num: '03', label: t(lang, 'tabStoryboard') },
            { id: 'render', num: '04', label: t(lang, 'tabRender') },
          ] as const
        ).map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-[5px] text-[12px] font-medium whitespace-nowrap cursor-pointer transition-colors duration-100',
                isActive
                  ? 'bg-elevated text-text-primary shadow-studio-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-hover/60',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[10.5px] tabular-nums',
                  isActive ? 'text-accent font-semibold' : 'text-text-muted',
                )}
              >
                {item.num}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Command Palette, Agent Hub, Actions & Window Controls */}
      <div className="flex items-center h-full shrink-0">
        <div className="topbar-actions flex items-center gap-1.5">
          {updateStatus.phase === 'downloading' || updateStatus.phase === 'verifying' ? (
            <Button
              id="btn-topbar-update-pill"
              size="sm"
              variant="default"
              onClick={onOpenUpdateModal}
              className="text-cyan border-cyan/30"
            >
              <Loader2 size={12} className="spin-icon" />
              <span className="font-mono text-[11px]">
                {updateStatus.phase === 'verifying'
                  ? lang === 'zh-CN'
                    ? '校验中'
                    : 'Verifying'
                  : `${Math.round(updateStatus.download?.percent || 0)}%`}
              </span>
            </Button>
          ) : updateStatus.phase === 'ready' && updateStatus.checkResult ? (
            <Button
              id="btn-topbar-update-pill"
              size="sm"
              variant="default"
              onClick={onOpenUpdateModal}
              className="text-emerald border-emerald/30"
            >
              <CheckCircle2 size={12} />
              <span>v{updateStatus.checkResult.latestVersion}</span>
            </Button>
          ) : updateStatus.checkResult?.updateAvailable && !updateStatus.checkResult.isSkipped ? (
            <Button
              id="btn-topbar-update-pill"
              size="sm"
              variant="default"
              onClick={onOpenUpdateModal}
              className="text-accent border-accent/35"
            >
              <Download size={12} />
              <span>v{updateStatus.checkResult.latestVersion}</span>
            </Button>
          ) : null}

          <StudioTooltip
            content={lang === 'zh-CN' ? '命令面板' : 'Command Palette'}
            kbd={isMac ? '⌘K' : 'Ctrl+K'}
          >
            <button
              id="btn-command-palette"
              type="button"
              onClick={onOpenCommandPalette}
              className="inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] bg-canvas border border-border-subtle text-text-muted hover:text-text-primary hover:border-border-strong transition-colors cursor-pointer"
            >
              <Search size={12} />
              <kbd className="font-mono text-[10.5px] leading-none">
                {isMac ? '⌘K' : 'Ctrl K'}
              </kbd>
            </button>
          </StudioTooltip>

          <StudioTooltip content={t(lang, 'agentHub')}>
            <Button
              id="btn-open-agent-hub"
              size="sm"
              variant="default"
              onClick={onOpenAgentHub}
            >
              <Bot size={13} className="text-text-secondary" />
              <span>{t(lang, 'agentHubShort')}</span>
            </Button>
          </StudioTooltip>

          {activeSlug ? (
            <StudioTooltip content={t(lang, 'quickSnapshot')}>
              <Button
                id="btn-quick-snapshot"
                size="sm"
                variant="ghost"
                onClick={onQuickSnapshot}
              >
                <Tag size={13} />
                <span className="hidden xl:inline">{t(lang, 'quickSnapshot')}</span>
              </Button>
            </StudioTooltip>
          ) : null}

          <StudioTooltip content={lang === 'zh-CN' ? 'Switch to English' : '切换为简体中文'}>
            <Button size="icon" variant="ghost" onClick={onToggleLang}>
              <Languages size={14} />
            </Button>
          </StudioTooltip>

          <StudioTooltip
            content={
              uiTheme === 'dark'
                ? lang === 'zh-CN'
                  ? '切换浅色主题'
                  : 'Switch to Light Theme'
                : lang === 'zh-CN'
                  ? '切换暗色主题'
                  : 'Switch to Dark Theme'
            }
          >
            <Button id="btn-theme-toggle" size="icon" variant="ghost" onClick={onToggleTheme}>
              {uiTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
          </StudioTooltip>

          <StudioTooltip content={t(lang, 'settings')}>
            <Button id="btn-open-settings" size="icon" variant="ghost" onClick={onOpenSettings}>
              <Settings size={14} />
            </Button>
          </StudioTooltip>
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
