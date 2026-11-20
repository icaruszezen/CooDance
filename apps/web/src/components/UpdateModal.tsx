import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Loader2,
  Power,
  RefreshCw,
  Settings,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import {
  AppUpdateSettingsDto,
  DesktopInstallActionResultDto,
  DesktopUpdateStatusDto,
  UpdateAssetInfoDto,
} from '../api';
import { UiLang } from '../i18n';

interface UpdateModalProps {
  lang: UiLang;
  isDesktop: boolean;
  status: DesktopUpdateStatusDto;
  updateSettings: AppUpdateSettingsDto;
  onClose: () => void;
  onCheckNow: () => Promise<void>;
  onStartDownload: () => Promise<void>;
  onCancelDownload: () => Promise<void>;
  onInstallNow: () => Promise<DesktopInstallActionResultDto | null>;
  onQuitForInstall: () => Promise<void>;
  onSkipVersion: (version: string) => Promise<void>;
  onOpenSettings: () => void;
  onRevealDownload: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '—';
  return `${formatBytes(bps)}/s`;
}

function formatEta(etaSec: number | null, lang: UiLang): string {
  if (etaSec === null || !Number.isFinite(etaSec) || etaSec < 0) {
    return lang === 'zh-CN' ? '估算中...' : 'Calculating...';
  }
  if (etaSec < 60) {
    return lang === 'zh-CN' ? `剩余 ${etaSec} 秒` : `${etaSec}s left`;
  }
  const min = Math.floor(etaSec / 60);
  const sec = etaSec % 60;
  return lang === 'zh-CN' ? `剩余 ${min} 分 ${sec} 秒` : `${min}m ${sec}s left`;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function describeInstallKind(
  target: DesktopUpdateStatusDto['target'],
  asset: UpdateAssetInfoDto | null,
  lang: UiLang,
): string {
  const kind = asset?.installKind || target.installKind;
  const archLabel = (asset?.arch || target.arch) === 'arm64' ? 'Apple Silicon (arm64)' : 'x64';
  if (kind === 'nsis') {
    return lang === 'zh-CN' ? 'Windows 安装版 (NSIS Setup)' : 'Windows Installer (NSIS)';
  }
  if (kind === 'portable-zip') {
    return lang === 'zh-CN' ? 'Windows 免安装便携版 (ZIP)' : 'Windows Portable (ZIP)';
  }
  if (kind === 'dmg') {
    return lang === 'zh-CN' ? `macOS 安装镜像 (${archLabel} DMG)` : `macOS Disk Image (${archLabel} DMG)`;
  }
  if (kind === 'appimage') {
    return 'Linux AppImage';
  }
  return lang === 'zh-CN' ? 'Web / Docker 自托管版' : 'Web / Docker Self-Hosted';
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key++} style={{ color: 'var(--text-primary)' }}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={key++} className="update-inline-code mono">
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIdx = match.index + token.length;
  }
  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }
  return nodes;
}

const ReleaseNotesView: React.FC<{ notes: string; lang: UiLang }> = ({ notes, lang }) => {
  const lines = useMemo(() => {
    const trimmed = (notes || '').trim();
    if (!trimmed) return [];
    return trimmed.split(/\r?\n/);
  }, [notes]);

  if (lines.length === 0) {
    return (
      <div className="update-notes-empty">
        {lang === 'zh-CN' ? '该版本暂未附带详细更新说明。' : 'No detailed release notes provided.'}
      </div>
    );
  }

  return (
    <div className="update-notes-body">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} style={{ height: 6 }} />;
        if (line.startsWith('### ')) {
          return (
            <h5 key={idx} className="update-notes-h3">
              {renderInlineMarkdown(line.slice(4))}
            </h5>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h4 key={idx} className="update-notes-h2">
              {renderInlineMarkdown(line.slice(3))}
            </h4>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} className="update-notes-li">
              <span className="update-notes-bullet" />
              <span>{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="update-notes-p">
            {renderInlineMarkdown(line)}
          </p>
        );
      })}
    </div>
  );
};

function buildAcceleratedLink(rawUrl: string, updateSettings: AppUpdateSettingsDto): string {
  if (updateSettings.mirrorMode === 'direct') return rawUrl;
  const custom = (updateSettings.customMirrorPrefix || '').trim();
  if (custom && /^https?:\/\//i.test(custom)) {
    if (custom.includes('{encoded_url}')) {
      return custom.replace(/\{encoded_url\}/g, encodeURIComponent(rawUrl));
    }
    if (custom.includes('{url}')) {
      const qIdx = custom.indexOf('?');
      const tIdx = custom.indexOf('{url}');
      return custom.replace(/\{url\}/g, qIdx !== -1 && tIdx > qIdx ? encodeURIComponent(rawUrl) : rawUrl);
    }
    return `${custom.endsWith('/') ? custom : `${custom}/`}${rawUrl}`;
  }
  return `https://gh-proxy.org/${rawUrl}`;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  lang,
  isDesktop,
  status,
  updateSettings,
  onClose,
  onCheckNow,
  onStartDownload,
  onCancelDownload,
  onInstallNow,
  onQuitForInstall,
  onSkipVersion,
  onOpenSettings,
  onRevealDownload,
  onNotify,
}) => {
  const [installAction, setInstallAction] = useState<DesktopInstallActionResultDto | null>(null);
  const [busyInstall, setBusyInstall] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const check = status.checkResult;
  const dl = status.download;
  const isZh = lang === 'zh-CN';
  const isBusyDownload = status.phase === 'downloading' || status.phase === 'verifying';
  const isChecking = status.phase === 'checking';

  const openExternalUrl = (url: string) => {
    if (window.coodanceDesktop?.openExternal) {
      void window.coodanceDesktop.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyCommand = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd((prev) => (prev === id ? null : prev)), 1800);
      onNotify(isZh ? '✔ 已复制升级命令' : 'Copied upgrade command', 'success');
    } catch {
      onNotify(isZh ? '复制失败，请手动选中复制' : 'Failed to copy command', 'error');
    }
  };

  const handleInstallClick = async () => {
    setBusyInstall(true);
    try {
      const res = await onInstallNow();
      if (res) {
        setInstallAction(res);
      }
    } finally {
      setBusyInstall(false);
    }
  };

  const installButtonLabel = (() => {
    const kind = check?.matchedAsset?.installKind || status.target.installKind;
    if (kind === 'nsis') {
      return isZh ? '立即安装并重启' : 'Install & Restart';
    }
    if (kind === 'dmg') {
      return isZh ? '打开 DMG 安装镜像' : 'Open DMG Installer';
    }
    if (kind === 'portable-zip') {
      return isZh ? '在文件夹中定位压缩包' : 'Reveal Portable ZIP';
    }
    return isZh ? '打开更新包' : 'Open Update Package';
  })();

  const mirrorModeLabel = (() => {
    switch (updateSettings.mirrorMode) {
      case 'cn-only':
        return isZh ? '仅国内加速镜像' : 'China Mirrors Only';
      case 'custom':
        return isZh ? '自定义加速节点' : 'Custom Mirror';
      case 'direct':
        return isZh ? 'GitHub 官方直连' : 'GitHub Direct';
      default:
        return isZh ? '国内镜像优选（自动故障切换）' : 'Auto (China Mirrors -> GitHub)';
    }
  })();

  const dockerUpgradeCmd = 'docker compose pull && docker compose up -d';
  const gitUpgradeCmd = 'git pull && npm ci && npm run build && npm start';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        id="update-center-modal"
        className="modal-window update-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="update-header-icon">
              <Sparkles size={15} />
            </div>
            <div>
              <h3 className="panel-title" style={{ margin: 0 }}>
                {isZh ? '软件更新中心' : 'Software Updates'}
              </h3>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                {isZh ? '仓库：icaruszezen/CooDance · ' : 'Repo: icaruszezen/CooDance · '}
                {mirrorModeLabel}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="chip mono">v{status.currentVersion}</span>
            <button
              id="btn-close-update-modal"
              type="button"
              className="btn btn-sm btn-icon"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ gap: 14 }}>
          {/* Checking State */}
          {isChecking ? (
            <div className="update-hero-card checking">
              <Loader2 size={20} className="spin-icon" style={{ color: 'var(--cyan)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {isZh ? '正在通过加速线路检测最新版本...' : 'Checking for latest release...'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {isZh
                    ? `通道：${updateSettings.includePrerelease ? '包含测试版 (Pre-release)' : '仅正式版 (Stable)'} · 线路策略：${mirrorModeLabel}`
                    : `Channel: ${updateSettings.includePrerelease ? 'Pre-release' : 'Stable'} · Route: ${mirrorModeLabel}`}
                </div>
              </div>
            </div>
          ) : null}

          {/* Error Banner */}
          {status.phase === 'error' && status.error ? (
            <div className="update-hero-card error">
              <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--danger)' }}>
                  {isZh ? '更新流程遇到问题' : 'Update Encountered an Issue'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, wordBreak: 'break-word' }}>
                  {status.error}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
                    <Settings size={12} /> {isZh ? '调整加速节点' : 'Mirror Settings'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      openExternalUrl(
                        check?.releaseUrl || 'https://github.com/icaruszezen/CooDance/releases/latest',
                      )
                    }
                  >
                    <ExternalLink size={12} /> {isZh ? '前往 GitHub Releases' : 'Open GitHub Releases'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Up to Date Card */}
          {!isChecking && status.phase === 'up-to-date' && check ? (
            <div className="update-hero-card up-to-date">
              <CheckCircle2 size={20} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  {isZh
                    ? `当前已是最新版本 v${status.currentVersion}`
                    : `You are up to date (v${status.currentVersion})`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                  {isZh
                    ? `仓库最新：${check.latestTag} · 检测源：${check.sourceNode.label} · 检测时间：${formatDateTime(check.checkedAt)}`
                    : `Latest: ${check.latestTag} · Source: ${check.sourceNode.label} · Checked: ${formatDateTime(check.checkedAt)}`}
                </div>
              </div>
            </div>
          ) : null}

          {/* Idle State (never checked yet) */}
          {!isChecking && status.phase === 'idle' && !check ? (
            <div className="update-hero-card">
              <Globe size={19} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {isZh ? '尚未执行版本检测' : 'Not Checked Yet'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {isZh
                    ? '点击下方「检查更新」，将优先通过中国区加速镜像查询最新 Release。'
                    : 'Click Check Updates to query the latest release via accelerated mirrors.'}
                </div>
              </div>
            </div>
          ) : null}

          {/* Update Available / Downloading / Verifying / Ready / Installing */}
          {check && check.updateAvailable ? (
            <>
              <div
                className={`update-hero-card ${status.phase === 'ready' ? 'ready' : 'available'}`}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="update-version-row">
                    <span className="chip mono">v{check.currentVersion}</span>
                    <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                    <span
                      className={`chip mono ${status.phase === 'ready' ? 'chip-emerald' : 'chip-accent'}`}
                      style={{ fontWeight: 700 }}
                    >
                      v{check.latestVersion}
                    </span>
                    {check.isPrerelease ? (
                      <span className="chip chip-cyan">Pre-release</span>
                    ) : null}
                    {check.isSkipped ? (
                      <span className="chip">{isZh ? '已跳过提醒' : 'Skipped'}</span>
                    ) : null}
                    <span className="chip update-source-chip">
                      <Globe size={10} />
                      {check.sourceNode.label}
                    </span>
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>
                    {check.releaseName}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                    {isZh ? '发布时间：' : 'Published: '}
                    {formatDateTime(check.publishedAt)}
                    {' · '}
                    {describeInstallKind(status.target, check.matchedAsset, lang)}
                  </div>
                </div>
              </div>

              {/* Desktop Package Info & Download / Verification Progress */}
              {isDesktop && check.matchedAsset ? (
                <div className="update-package-card">
                  <div className="update-package-top">
                    <div style={{ minWidth: 0 }}>
                      <div className="mono update-asset-name">{check.matchedAsset.name}</div>
                      <div className="update-asset-meta">
                        <span>
                          {isZh ? '文件大小：' : 'Size: '}
                          <strong className="mono">{formatBytes(check.matchedAsset.size)}</strong>
                        </span>
                        <span className="update-sha-pill">
                          <ShieldCheck size={12} style={{ color: 'var(--emerald)' }} />
                          {check.matchedAsset.sha256 ? (
                            <span
                              className="mono"
                              title={`SHA256: ${check.matchedAsset.sha256}`}
                            >
                              SHA256: {check.matchedAsset.sha256.slice(0, 12)}…
                            </span>
                          ) : (
                            <span style={{ color: 'var(--danger)' }}>
                              {isZh ? '缺少 SHA256 校验和' : 'Missing SHA256'}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Active Download or Verification Progress */}
                  {(status.phase === 'downloading' || status.phase === 'verifying') && dl ? (
                    <div className="update-progress-box">
                      <div className="update-progress-header">
                        <span style={{ fontWeight: 600, fontSize: 12 }}>
                          {status.phase === 'verifying'
                            ? isZh
                              ? '正在强制校验 SHA256 安全指纹...'
                              : 'Verifying SHA256 checksum...'
                            : isZh
                              ? `正在加速下载 ${dl.percent.toFixed(1)}%`
                              : `Downloading ${dl.percent.toFixed(1)}%`}
                        </span>
                        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)}
                        </span>
                      </div>

                      <div className="progress-rail update-progress-rail">
                        <div
                          className={`progress-fill ${status.phase === 'verifying' ? 'verifying' : ''}`}
                          style={{ width: `${Math.min(100, Math.max(2, dl.percent))}%` }}
                        />
                      </div>

                      <div className="update-progress-meta">
                        <span className="chip chip-cyan" style={{ fontSize: 10.5 }}>
                          <Globe size={10} />
                          {dl.activeMirrorLabel}
                          {dl.maxAttempts > 1 ? ` (${dl.attempt}/${dl.maxAttempts})` : ''}
                        </span>
                        {dl.resumed ? (
                          <span className="chip chip-emerald" style={{ fontSize: 10.5 }}>
                            {isZh ? '断点续传' : 'Resumed'}
                          </span>
                        ) : null}
                        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
                          {status.phase === 'verifying'
                            ? isZh
                              ? '防篡改校验中'
                              : 'Integrity check'
                            : `${formatSpeed(dl.speedBytesPerSec)} · ${formatEta(dl.etaSec, lang)}`}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* Ready / Verified Banner */}
                  {status.phase === 'ready' && dl?.verifiedSha256 ? (
                    <div className="update-verified-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ShieldCheck size={16} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--emerald)' }}>
                          {isZh
                            ? '安装包已就绪且 SHA256 安全校验通过'
                            : 'Installer ready & SHA256 integrity verified'}
                        </div>
                      </div>
                      <div className="mono update-verified-detail">
                        {isZh ? '下载线路：' : 'Mirror: '}
                        {dl.activeMirrorLabel} · SHA256: {dl.verifiedSha256.slice(0, 16)}…
                      </div>
                      {dl.filePath ? (
                        <div className="mono update-verified-path" title={dl.filePath}>
                          {dl.filePath}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Guided post-open instruction for macOS DMG / Windows Portable */}
                  {installAction ? (
                    <div className="update-install-guide">
                      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{installAction.message}</div>
                      {installAction.canQuitNow ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void onQuitForInstall()}
                          >
                            <Power size={12} />
                            {isZh ? '立即退出 CooDance 以便替换' : 'Quit CooDance Now'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => void onRevealDownload()}
                          >
                            <FolderOpen size={12} />
                            {isZh ? '在文件夹中查看' : 'Show in Folder'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Web / Docker Self-Hosted Upgrade Guide */}
              {!isDesktop ? (
                <div className="update-web-guide">
                  <div className="update-section-title">
                    <Terminal size={13} style={{ color: 'var(--cyan)' }} />
                    {isZh
                      ? 'Web / Docker 自托管端升级指引'
                      : 'Web / Docker Self-Hosted Upgrade Guide'}
                  </div>

                  <div className="update-cmd-grid">
                    <div className="update-cmd-row">
                      <span className="update-cmd-label">Docker Compose</span>
                      <code className="mono update-cmd-code">{dockerUpgradeCmd}</code>
                      <button
                        type="button"
                        className="btn btn-sm btn-icon"
                        title={isZh ? '复制命令' : 'Copy'}
                        onClick={() => void handleCopyCommand('docker', dockerUpgradeCmd)}
                      >
                        {copiedCmd === 'docker' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <div className="update-cmd-row">
                      <span className="update-cmd-label">{isZh ? '源码构建' : 'From Source'}</span>
                      <code className="mono update-cmd-code">{gitUpgradeCmd}</code>
                      <button
                        type="button"
                        className="btn btn-sm btn-icon"
                        title={isZh ? '复制命令' : 'Copy'}
                        onClick={() => void handleCopyCommand('git', gitUpgradeCmd)}
                      >
                        {copiedCmd === 'git' ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>

                  {check.allAssets.length > 0 ? (
                    <div className="update-web-assets">
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {isZh
                          ? '如需下载桌面客户端（已自动应用中国区加速线路）：'
                          : 'Desktop installers (via configured acceleration mirror):'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {check.allAssets.slice(0, 4).map((asset) => (
                          <button
                            key={asset.name}
                            type="button"
                            className="btn btn-sm"
                            onClick={() =>
                              openExternalUrl(buildAcceleratedLink(asset.downloadUrl, updateSettings))
                            }
                          >
                            <Download size={11} />
                            <span className="mono" style={{ fontSize: 11 }}>
                              {asset.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Release Notes */}
              <div className="update-notes-panel">
                <div className="update-section-title">
                  {isZh ? `版本更新日志 (${check.latestTag})` : `Release Notes (${check.latestTag})`}
                </div>
                <ReleaseNotesView notes={check.releaseNotes} lang={lang} />
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="modal-footer update-modal-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {check?.updateAvailable && !isBusyDownload ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  void onSkipVersion(check.isSkipped ? '' : check.latestVersion)
                }
              >
                <SkipForward size={12} />
                {check.isSkipped
                  ? isZh
                    ? '恢复此版本提醒'
                    : 'Unskip Version'
                  : isZh
                    ? '跳过此版本'
                    : 'Skip Version'}
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn-sm"
              onClick={onOpenSettings}
            >
              <Settings size={12} />
              {isZh ? '加速线路设置' : 'Mirror Settings'}
            </button>

            {check?.releaseUrl ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => openExternalUrl(check.releaseUrl)}
              >
                <ExternalLink size={12} />
                GitHub Release
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isBusyDownload ? (
              <button
                id="btn-cancel-update-download"
                type="button"
                className="btn btn-danger"
                onClick={() => void onCancelDownload()}
              >
                <X size={13} />
                {isZh ? '取消下载' : 'Cancel Download'}
              </button>
            ) : status.phase === 'ready' && isDesktop ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void onRevealDownload()}
                >
                  <FolderOpen size={13} />
                  {isZh ? '打开目录' : 'Reveal'}
                </button>
                <button
                  id="btn-install-update-now"
                  type="button"
                  className="btn btn-primary"
                  disabled={busyInstall}
                  onClick={() => void handleInstallClick()}
                >
                  <Download size={13} />
                  {busyInstall
                    ? isZh
                      ? '正在准备安装...'
                      : 'Preparing...'
                    : installButtonLabel}
                </button>
              </>
            ) : check?.updateAvailable && isDesktop && check.matchedAsset ? (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={isChecking}
                  onClick={() => void onCheckNow()}
                >
                  <RefreshCw size={13} />
                  {isZh ? '重新检测' : 'Recheck'}
                </button>
                <button
                  id="btn-download-update-now"
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void onStartDownload()}
                >
                  <Download size={13} />
                  {isZh ? '加速下载更新' : 'Download Update'}
                </button>
              </>
            ) : (
              <button
                id="btn-check-update-now"
                type="button"
                className="btn btn-primary"
                disabled={isChecking}
                onClick={() => void onCheckNow()}
              >
                {isChecking ? <Loader2 size={13} className="spin-icon" /> : <RefreshCw size={13} />}
                {isChecking
                  ? isZh
                    ? '检测中...'
                    : 'Checking...'
                  : isZh
                    ? '立即检查更新'
                    : 'Check for Updates'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
