import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpCircle,
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
import { Button, StudioDialog, cn } from './ui';

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
        <strong key={key++} className="text-text-primary font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="px-1 py-px rounded-[4px] bg-elevated border border-border-subtle font-mono text-[11px] text-text-primary"
        >
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
      <div className="text-[12px] text-text-muted">
        {lang === 'zh-CN' ? '该版本暂未附带详细更新说明。' : 'No detailed release notes provided.'}
      </div>
    );
  }

  return (
    <div className="max-h-[210px] overflow-y-auto flex flex-col gap-1 pr-1 text-[12px] text-text-secondary">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <div key={idx} className="h-1.5" />;
        if (line.startsWith('### ')) {
          return (
            <h5 key={idx} className="mt-1.5 mb-0.5 text-[12px] font-semibold text-accent">
              {renderInlineMarkdown(line.slice(4))}
            </h5>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h4 key={idx} className="mt-1 mb-0.5 text-[13px] font-semibold text-text-primary">
              {renderInlineMarkdown(line.slice(3))}
            </h4>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="w-1 h-1 rounded-full bg-text-muted mt-2 shrink-0" />
              <span>{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        return (
          <p key={idx} className="m-0 leading-relaxed">
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
    if (kind === 'nsis') return isZh ? '立即安装并重启' : 'Install & Restart';
    if (kind === 'dmg') return isZh ? '打开 DMG 安装镜像' : 'Open DMG Installer';
    if (kind === 'portable-zip') return isZh ? '在文件夹中定位压缩包' : 'Reveal Portable ZIP';
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
        return isZh ? '国内镜像优选（自动故障切换）' : 'Auto (China Mirrors → GitHub)';
    }
  })();

  const dockerUpgradeCmd = 'docker compose pull && docker compose up -d';
  const gitUpgradeCmd = 'git pull && npm ci && npm run build && npm start';

  return (
    <StudioDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      id="update-center-modal"
      closeButtonId="btn-close-update-modal"
      size="md"
      title={
        <>
          <ArrowUpCircle size={15} className="text-accent" />
          <span>{isZh ? '软件更新中心' : 'Software Updates'}</span>
        </>
      }
      description={`${isZh ? '仓库：' : 'Repo: '}icaruszezen/CooDance · ${mirrorModeLabel}`}
      headerExtra={
        <span className="font-mono text-[11px] text-text-muted px-1.5 py-0.5 rounded-[4px] bg-elevated border border-border-subtle">
          v{status.currentVersion}
        </span>
      }
      footer={
        <div className="w-full flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {check?.updateAvailable && !isBusyDownload ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void onSkipVersion(check.isSkipped ? '' : check.latestVersion)}
              >
                <SkipForward size={11} />
                <span>
                  {check.isSkipped
                    ? isZh
                      ? '恢复此版本提醒'
                      : 'Unskip Version'
                    : isZh
                      ? '跳过此版本'
                      : 'Skip Version'}
                </span>
              </Button>
            ) : null}

            <Button size="xs" variant="ghost" onClick={onOpenSettings}>
              <Settings size={11} />
              <span>{isZh ? '加速线路设置' : 'Mirror Settings'}</span>
            </Button>

            {check?.releaseUrl ? (
              <Button size="xs" variant="ghost" onClick={() => openExternalUrl(check.releaseUrl)}>
                <ExternalLink size={11} />
                <span>GitHub Release</span>
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {isBusyDownload ? (
              <Button
                id="btn-cancel-update-download"
                size="sm"
                variant="danger"
                onClick={() => void onCancelDownload()}
              >
                <X size={12} />
                <span>{isZh ? '取消下载' : 'Cancel Download'}</span>
              </Button>
            ) : status.phase === 'ready' && isDesktop ? (
              <>
                <Button size="sm" variant="default" onClick={() => void onRevealDownload()}>
                  <FolderOpen size={12} />
                  <span>{isZh ? '打开目录' : 'Reveal'}</span>
                </Button>
                <Button
                  id="btn-install-update-now"
                  size="sm"
                  variant="primary"
                  disabled={busyInstall}
                  onClick={() => void handleInstallClick()}
                >
                  <Download size={12} />
                  <span>
                    {busyInstall ? (isZh ? '准备中...' : 'Preparing...') : installButtonLabel}
                  </span>
                </Button>
              </>
            ) : check?.updateAvailable && isDesktop && check.matchedAsset ? (
              <>
                <Button
                  size="sm"
                  variant="default"
                  disabled={isChecking}
                  onClick={() => void onCheckNow()}
                >
                  <RefreshCw size={12} />
                  <span>{isZh ? '重新检测' : 'Recheck'}</span>
                </Button>
                <Button
                  id="btn-download-update-now"
                  size="sm"
                  variant="primary"
                  onClick={() => void onStartDownload()}
                >
                  <Download size={12} />
                  <span>{isZh ? '加速下载更新' : 'Download Update'}</span>
                </Button>
              </>
            ) : (
              <Button
                id="btn-check-update-now"
                size="sm"
                variant="primary"
                disabled={isChecking}
                onClick={() => void onCheckNow()}
              >
                {isChecking ? <Loader2 size={12} className="spin-icon" /> : <RefreshCw size={12} />}
                <span>
                  {isChecking
                    ? isZh
                      ? '检测中...'
                      : 'Checking...'
                    : isZh
                      ? '立即检查更新'
                      : 'Check for Updates'}
                </span>
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {isChecking ? (
          <div className="flex items-start gap-3 p-3.5 rounded-[8px] bg-elevated/60 border border-border-subtle">
            <Loader2 size={18} className="spin-icon text-cyan mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-text-primary">
                {isZh ? '正在通过加速线路检测最新版本...' : 'Checking for latest release...'}
              </div>
              <div className="text-[11.5px] text-text-muted mt-0.5">
                {isZh
                  ? `通道：${updateSettings.includePrerelease ? '包含测试版 (Pre-release)' : '仅正式版 (Stable)'} · 策略：${mirrorModeLabel}`
                  : `Channel: ${updateSettings.includePrerelease ? 'Pre-release' : 'Stable'} · Route: ${mirrorModeLabel}`}
              </div>
            </div>
          </div>
        ) : null}

        {status.phase === 'error' && status.error ? (
          <div className="flex items-start gap-3 p-3.5 rounded-[8px] bg-danger-soft/60 border border-danger/25">
            <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-danger">
                {isZh ? '更新流程遇到问题' : 'Update Encountered an Issue'}
              </div>
              <div className="text-[11.5px] text-text-secondary mt-1 break-words">
                {status.error}
              </div>
              <div className="flex gap-2 mt-2.5 flex-wrap">
                <Button size="xs" variant="default" onClick={onOpenSettings}>
                  <Settings size={11} /> {isZh ? '调整加速节点' : 'Mirror Settings'}
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={() =>
                    openExternalUrl(
                      check?.releaseUrl || 'https://github.com/icaruszezen/CooDance/releases/latest',
                    )
                  }
                >
                  <ExternalLink size={11} /> GitHub Releases
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {!isChecking && status.phase === 'up-to-date' && check ? (
          <div className="flex items-start gap-3 p-3.5 rounded-[8px] bg-emerald-soft/45 border border-emerald/25">
            <CheckCircle2 size={18} className="text-emerald shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-text-primary">
                {isZh
                  ? `当前已是最新版本 v${status.currentVersion}`
                  : `You are up to date (v${status.currentVersion})`}
              </div>
              <div className="text-[11.5px] text-text-secondary mt-0.5">
                {isZh
                  ? `仓库最新：${check.latestTag} · 检测源：${check.sourceNode.label} · ${formatDateTime(check.checkedAt)}`
                  : `Latest: ${check.latestTag} · Source: ${check.sourceNode.label} · ${formatDateTime(check.checkedAt)}`}
              </div>
            </div>
          </div>
        ) : null}

        {!isChecking && status.phase === 'idle' && !check ? (
          <div className="flex items-start gap-3 p-3.5 rounded-[8px] bg-elevated/50 border border-border-subtle">
            <Globe size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-text-primary">
                {isZh ? '尚未执行版本检测' : 'Not Checked Yet'}
              </div>
              <div className="text-[11.5px] text-text-muted mt-0.5">
                {isZh
                  ? '点击下方「立即检查更新」，将优先通过中国区加速镜像查询最新 Release。'
                  : 'Click Check for Updates below to query the latest release.'}
              </div>
            </div>
          </div>
        ) : null}

        {check && check.updateAvailable ? (
          <>
            <div className="p-3.5 rounded-[8px] bg-elevated/60 border border-border-subtle">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] bg-canvas border border-border-subtle text-text-secondary">
                  v{check.currentVersion}
                </span>
                <ArrowRight size={12} className="text-text-muted" />
                <span
                  className={cn(
                    'font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-[4px]',
                    status.phase === 'ready'
                      ? 'bg-emerald-soft text-emerald'
                      : 'bg-accent-soft text-accent',
                  )}
                >
                  v{check.latestVersion}
                </span>
                {check.isPrerelease ? (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[4px] bg-cyan-soft text-cyan">
                    Pre-release
                  </span>
                ) : null}
                {check.isSkipped ? (
                  <span className="text-[10.5px] text-text-muted">
                    ({isZh ? '已跳过' : 'Skipped'})
                  </span>
                ) : null}
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10.5px] text-text-muted">
                  <Globe size={10} />
                  {check.sourceNode.label}
                </span>
              </div>

              <div className="text-[13.5px] font-semibold text-text-primary mt-2">
                {check.releaseName}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {isZh ? '发布时间：' : 'Published: '}
                {formatDateTime(check.publishedAt)} ·{' '}
                {describeInstallKind(status.target, check.matchedAsset, lang)}
              </div>
            </div>

            {isDesktop && check.matchedAsset ? (
              <div className="p-3.5 rounded-[8px] bg-elevated/45 border border-border-subtle flex flex-col gap-2.5">
                <div className="min-w-0">
                  <div className="font-mono text-[12px] font-semibold text-text-primary break-all">
                    {check.matchedAsset.name}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-text-secondary">
                    <span>
                      {isZh ? '文件大小：' : 'Size: '}
                      <strong className="font-mono text-text-primary">
                        {formatBytes(check.matchedAsset.size)}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                      <ShieldCheck size={11} className="text-emerald" />
                      {check.matchedAsset.sha256 ? (
                        <span title={`SHA256: ${check.matchedAsset.sha256}`}>
                          SHA256: {check.matchedAsset.sha256.slice(0, 12)}…
                        </span>
                      ) : (
                        <span className="text-danger">
                          {isZh ? '缺少 SHA256' : 'Missing SHA256'}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {(status.phase === 'downloading' || status.phase === 'verifying') && dl ? (
                  <div className="pt-2.5 border-t border-border-subtle flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 text-[11.5px]">
                      <span className="font-medium text-text-primary">
                        {status.phase === 'verifying'
                          ? isZh
                            ? '正在校验 SHA256 安全指纹...'
                            : 'Verifying SHA256...'
                          : isZh
                            ? `正在加速下载 ${dl.percent.toFixed(1)}%`
                            : `Downloading ${dl.percent.toFixed(1)}%`}
                      </span>
                      <span className="font-mono text-text-muted tabular-nums">
                        {formatBytes(dl.downloadedBytes)} / {formatBytes(dl.totalBytes)}
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-canvas overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-150',
                          status.phase === 'verifying' ? 'bg-emerald' : 'bg-accent',
                        )}
                        style={{ width: `${Math.min(100, Math.max(2, dl.percent))}%` }}
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-muted font-mono">
                      <span>
                        {dl.activeMirrorLabel}
                        {dl.maxAttempts > 1 ? ` (${dl.attempt}/${dl.maxAttempts})` : ''}
                      </span>
                      {dl.resumed ? (
                        <span className="text-emerald">{isZh ? '断点续传' : 'Resumed'}</span>
                      ) : null}
                      <span className="ml-auto tabular-nums">
                        {status.phase === 'verifying'
                          ? isZh
                            ? '防篡改校验中'
                            : 'Integrity check'
                          : `${formatSpeed(dl.speedBytesPerSec)} · ${formatEta(dl.etaSec, lang)}`}
                      </span>
                    </div>
                  </div>
                ) : null}

                {status.phase === 'ready' && dl?.verifiedSha256 ? (
                  <div className="p-2.5 rounded-[7px] bg-emerald-soft/50 border border-emerald/25 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald">
                      <ShieldCheck size={14} />
                      <span>
                        {isZh ? '安装包已就绪且 SHA256 校验通过' : 'Installer ready & SHA256 verified'}
                      </span>
                    </div>
                    <div className="font-mono text-[10.5px] text-text-secondary">
                      {dl.activeMirrorLabel} · SHA256: {dl.verifiedSha256.slice(0, 16)}…
                    </div>
                    {dl.filePath ? (
                      <div className="font-mono text-[10px] text-text-muted truncate" title={dl.filePath}>
                        {dl.filePath}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {installAction ? (
                  <div className="p-3 rounded-[7px] bg-accent-soft/60 border border-accent/25 text-[12px] text-text-primary">
                    <div className="leading-relaxed">{installAction.message}</div>
                    {installAction.canQuitNow ? (
                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        <Button size="xs" variant="primary" onClick={() => void onQuitForInstall()}>
                          <Power size={11} />
                          <span>{isZh ? '立即退出 CooDance 以便替换' : 'Quit CooDance Now'}</span>
                        </Button>
                        <Button size="xs" variant="default" onClick={() => void onRevealDownload()}>
                          <FolderOpen size={11} />
                          <span>{isZh ? '在文件夹中查看' : 'Show in Folder'}</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isDesktop ? (
              <div className="p-3.5 rounded-[8px] bg-elevated/45 border border-border-subtle flex flex-col gap-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-text-primary">
                  <Terminal size={12} className="text-text-muted" />
                  <span>
                    {isZh ? 'Web / Docker 自托管端升级指引' : 'Web / Docker Self-Hosted Upgrade'}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {[
                    { id: 'docker', label: 'Docker Compose', cmd: dockerUpgradeCmd },
                    { id: 'git', label: isZh ? '源码构建' : 'From Source', cmd: gitUpgradeCmd },
                  ].map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-[6px] bg-code border border-border-subtle"
                    >
                      <span className="text-[11px] font-medium text-text-muted w-[92px] shrink-0">
                        {row.label}
                      </span>
                      <code className="flex-1 font-mono text-[11px] text-text-primary overflow-x-auto whitespace-nowrap">
                        {row.cmd}
                      </code>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void handleCopyCommand(row.id, row.cmd)}
                        className="px-1.5 shrink-0"
                      >
                        {copiedCmd === row.id ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                      </Button>
                    </div>
                  ))}
                </div>

                {check.allAssets.length > 0 ? (
                  <div className="pt-2 border-t border-border-subtle">
                    <div className="text-[11px] text-text-muted mb-1.5">
                      {isZh
                        ? '桌面客户端下载（已应用加速线路）：'
                        : 'Desktop installers (via configured mirror):'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {check.allAssets.slice(0, 4).map((asset) => (
                        <Button
                          key={asset.name}
                          size="xs"
                          variant="default"
                          onClick={() =>
                            openExternalUrl(buildAcceleratedLink(asset.downloadUrl, updateSettings))
                          }
                          className="font-mono text-[10.5px]"
                        >
                          <Download size={10} />
                          <span>{asset.name}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="p-3.5 rounded-[8px] bg-code border border-border-subtle flex flex-col gap-2">
              <div className="text-[12px] font-semibold text-text-primary">
                {isZh ? `版本更新日志 (${check.latestTag})` : `Release Notes (${check.latestTag})`}
              </div>
              <ReleaseNotesView notes={check.releaseNotes} lang={lang} />
            </div>
          </>
        ) : null}
      </div>
    </StudioDialog>
  );
};
