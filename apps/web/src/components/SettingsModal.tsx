import React, { useEffect, useRef, useState } from 'react';
import {
  Save,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Globe,
  Gauge,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import {
  DesktopUpdateStatusDto,
  FfmpegHealthDto,
  SettingsDto,
  UpdateMirrorMode,
  UpdateMirrorTestResultDto,
  setStoredToken,
} from '../api';
import { UiLang } from '../i18n';
import {
  Button,
  FieldLabel,
  NumberScrubInput,
  StudioDialog,
  StudioInput,
  StudioSelect,
  StudioSwitch,
  cn,
} from './ui';

interface SettingsModalProps {
  lang: UiLang;
  settings: SettingsDto;
  ffmpeg: FfmpegHealthDto | null;
  updateStatus: DesktopUpdateStatusDto;
  focusSection?: 'general' | 'update';
  onClose: () => void;
  onSave: (next: SettingsDto) => Promise<void>;
  onOpenUpdateCenter: () => void;
  onTestMirrors: (draft: {
    mirrorMode: UpdateMirrorMode;
    customMirrorPrefix: string;
  }) => Promise<UpdateMirrorTestResultDto[]>;
}

const DEFAULT_UPDATE_SETTINGS: SettingsDto['update'] = {
  autoCheck: true,
  autoDownload: false,
  includePrerelease: false,
  mirrorMode: 'auto',
  customMirrorPrefix: '',
  skippedVersion: '',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  lang,
  settings,
  ffmpeg,
  updateStatus,
  focusSection = 'general',
  onClose,
  onSave,
  onOpenUpdateCenter,
  onTestMirrors,
}) => {
  const [draft, setDraft] = useState<SettingsDto>(() => {
    const cloned = structuredClone(settings);
    cloned.update = { ...DEFAULT_UPDATE_SETTINGS, ...(cloned.update || {}) };
    return cloned;
  });
  const [saving, setSaving] = useState(false);
  const [testingMirrors, setTestingMirrors] = useState(false);
  const [mirrorProbeResults, setMirrorProbeResults] = useState<UpdateMirrorTestResultDto[] | null>(
    null,
  );
  const updateSectionRef = useRef<HTMLDivElement | null>(null);
  const isZh = lang === 'zh-CN';

  useEffect(() => {
    if (focusSection === 'update' && updateSectionRef.current) {
      updateSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusSection]);

  const handlePickWorkspace = async () => {
    if (window.coodanceDesktop?.isDesktop) {
      const dir = await window.coodanceDesktop.selectDirectory();
      if (dir) setDraft({ ...draft, workspaceDir: dir });
    }
  };

  const handleTestMirrors = async () => {
    setTestingMirrors(true);
    try {
      const results = await onTestMirrors({
        mirrorMode: draft.update.mirrorMode,
        customMirrorPrefix: draft.update.customMirrorPrefix,
      });
      setMirrorProbeResults(results);
    } finally {
      setTestingMirrors(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
      if (draft.security.webAccessToken && draft.security.webAccessToken !== '••••••••') {
        setStoredToken(draft.security.webAccessToken);
      } else if (!draft.security.webAccessToken) {
        setStoredToken('');
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title={
        <>
          <KeyRound size={14} className="text-accent" />
          <span>{isZh ? '工作台与管线设置' : 'Studio & Pipeline Settings'}</span>
        </>
      }
      description={
        isZh
          ? '配置工作区目录、语音合成密钥、外部 MCP 护栏与软件更新加速节点'
          : 'Configure workspace directory, TTS credentials, MCP guardrails, and update mirrors'
      }
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {isZh ? '取消' : 'Cancel'}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            <Save size={12} />
            <span>{saving ? (isZh ? '保存中...' : 'Saving...') : isZh ? '保存设置' : 'Save Settings'}</span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Workspace & FFmpeg Health */}
        <section className="flex flex-col gap-2.5">
          <div className="text-[12px] font-semibold text-text-primary">
            {isZh ? '工作区目录与底层环境' : 'Workspace & Runtime Environment'}
          </div>
          <div className="flex gap-2">
            <StudioInput
              compact
              mono
              value={draft.workspaceDir}
              onChange={(e) => setDraft({ ...draft, workspaceDir: e.target.value })}
            />
            {window.coodanceDesktop?.isDesktop ? (
              <Button size="sm" variant="default" onClick={() => void handlePickWorkspace()}>
                <FolderOpen size={13} />
                <span>{isZh ? '浏览' : 'Browse'}</span>
              </Button>
            ) : null}
          </div>

          {ffmpeg ? (
            <div
              className={cn(
                'px-3 py-2 rounded-[7px] border text-[11.5px] flex items-center gap-2',
                ffmpeg.ok
                  ? 'bg-emerald-soft/60 border-emerald/25 text-emerald'
                  : 'bg-danger-soft/70 border-danger/25 text-danger',
              )}
            >
              {ffmpeg.ok ? (
                <CheckCircle2 size={13} className="shrink-0" />
              ) : (
                <AlertTriangle size={13} className="shrink-0" />
              )}
              <span className="truncate font-mono">
                {ffmpeg.ok
                  ? `FFmpeg / FFprobe OK (${ffmpeg.source}): ${ffmpeg.ffmpegVersion || ffmpeg.ffmpegPath}`
                  : `FFmpeg Error: ${ffmpeg.error}`}
              </span>
            </div>
          ) : null}
        </section>

        {/* Volcengine Doubao 2.0 Credentials */}
        <section className="pt-4 border-t border-border-subtle flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold text-text-primary">
              {isZh ? '火山引擎豆包语音合成 2.0 (seed-tts-2.0)' : 'Volcengine Doubao TTS 2.0'}
            </span>
            <span className="text-[11px] text-text-muted">
              {isZh ? '凭证经 AES-256-GCM 本地加密保存' : 'Encrypted locally with AES-256-GCM'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>AppID (X-Api-App-Id)</FieldLabel>
              <StudioInput
                compact
                mono
                placeholder={isZh ? '输入火山引擎 AppID' : 'Enter AppID'}
                value={draft.tts.doubao.appId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tts: {
                      ...draft.tts,
                      doubao: { ...draft.tts.doubao, appId: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>Access Token (X-Api-Access-Key)</FieldLabel>
              <StudioInput
                compact
                mono
                type="password"
                placeholder={isZh ? '输入 Access Token' : 'Enter Access Token'}
                value={draft.tts.doubao.accessToken}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tts: {
                      ...draft.tts,
                      doubao: { ...draft.tts.doubao, accessToken: e.target.value },
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Resource ID</FieldLabel>
              <StudioInput
                compact
                mono
                value={draft.tts.doubao.resourceId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tts: {
                      ...draft.tts,
                      doubao: { ...draft.tts.doubao, resourceId: e.target.value },
                    },
                  })
                }
              />
            </div>
            <div>
              <FieldLabel>{isZh ? '默认合成引擎' : 'Default Provider'}</FieldLabel>
              <StudioSelect
                compact
                value={draft.tts.defaultProvider}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    tts: {
                      ...draft.tts,
                      defaultProvider: v as SettingsDto['tts']['defaultProvider'],
                    },
                  })
                }
                options={[
                  { value: 'doubao', label: '火山豆包 2.0', hint: '自动降级' },
                  { value: 'edge', label: '免费 Edge-TTS', hint: '免密钥' },
                  { value: 'local', label: '本地演示语音', hint: '完全离线' },
                ]}
              />
            </div>
          </div>
        </section>

        {/* Optional AI Storyboard Assistant */}
        <section className="pt-4 border-t border-border-subtle flex flex-col gap-2.5">
          <div className="text-[12px] font-semibold text-text-primary">
            {isZh ? '可选：AI 分镜自动编排 (OpenAI 兼容接口)' : 'Optional: AI Storyboard (OpenAI Compatible)'}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <FieldLabel>API Base URL</FieldLabel>
              <StudioInput
                compact
                mono
                value={draft.ai.baseUrl}
                onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, baseUrl: e.target.value } })}
              />
            </div>
            <div>
              <FieldLabel>API Key</FieldLabel>
              <StudioInput
                compact
                mono
                type="password"
                placeholder="sk-..."
                value={draft.ai.apiKey}
                onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, apiKey: e.target.value } })}
              />
            </div>
            <div>
              <FieldLabel>{isZh ? '模型 Model' : 'Model'}</FieldLabel>
              <StudioInput
                compact
                mono
                value={draft.ai.model}
                onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value } })}
              />
            </div>
          </div>
        </section>

        {/* Self-hosted Web Access Token */}
        <section className="pt-4 border-t border-border-subtle flex flex-col gap-2">
          <div className="text-[12px] font-semibold text-text-primary">
            {isZh ? 'Web 自托管可选访问口令（留空则免密）' : 'Self-Hosted Web Access Token (Optional)'}
          </div>
          <StudioInput
            compact
            mono
            type="password"
            placeholder={
              isZh
                ? '可选：设置 COODANCE_ACCESS_TOKEN 保护私有 Web 部署与 /mcp 端点'
                : 'Optional COODANCE_ACCESS_TOKEN for Web & /mcp protection'
            }
            value={draft.security.webAccessToken}
            onChange={(e) =>
              setDraft({
                ...draft,
                security: { webAccessToken: e.target.value },
              })
            }
          />
        </section>

        {/* External AI Agent / MCP Guardrails (Linear-style 1px Divider List) */}
        <section className="pt-4 border-t border-border-subtle flex flex-col gap-2.5">
          <div className="text-[12px] font-semibold text-text-primary">
            {isZh ? '外部 AI Agent / MCP 服务与护栏' : 'External AI Agent / MCP Guardrails'}
          </div>

          <div className="rounded-[8px] border border-border-subtle divide-y divide-border-subtle bg-elevated/35 overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-text-primary">
                  {isZh ? '启用 Streamable HTTP MCP (/mcp)' : 'Enable Streamable HTTP MCP (/mcp)'}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {isZh
                    ? '允许 Cursor、Claude Code 等客户端直连本地 MCP 端点'
                    : 'Allow external MCP clients to connect via HTTP'}
                </div>
              </div>
              <StudioSwitch
                checked={draft.mcp?.enabled !== false}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, mcp: { ...draft.mcp, enabled: checked } })
                }
              />
            </div>

            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-text-primary">
                  {isZh ? '桌面端固定本地端口' : 'Fixed Local Desktop Port'}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {isZh
                    ? '重启桌面端生效；冲突时自动回退至随机可用端口'
                    : 'Takes effect after desktop restart; falls back automatically on conflict'}
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-[96px]">
                  <NumberScrubInput
                    compact
                    prefix=":"
                    min={1024}
                    max={65535}
                    step={1}
                    disabled={draft.mcp?.fixedPortEnabled === false}
                    value={draft.mcp?.fixedPort ?? 4170}
                    onValueChange={(val) =>
                      setDraft({
                        ...draft,
                        mcp: { ...draft.mcp, fixedPort: Math.round(val) || 4170 },
                      })
                    }
                  />
                </div>
                <StudioSwitch
                  checked={draft.mcp?.fixedPortEnabled !== false}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, mcp: { ...draft.mcp, fixedPortEnabled: checked } })
                  }
                />
              </div>
            </div>

            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-text-primary">
                  {isZh ? 'Agent 写入前自动打 Git 快照' : 'Auto Git Snapshot Before Agent Writes'}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {isZh
                    ? '覆盖 script.txt / edit_plan.json 或渲染前自动存档，支持单文件回退'
                    : 'Creates automatic recovery snapshots before agent mutations'}
                </div>
              </div>
              <StudioSwitch
                checked={draft.mcp?.autoSnapshotOnAgentWrite !== false}
                onCheckedChange={(checked) =>
                  setDraft({
                    ...draft,
                    mcp: { ...draft.mcp, autoSnapshotOnAgentWrite: checked },
                  })
                }
              />
            </div>

            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-text-primary">
                  {isZh ? '允许外部 Agent 调用付费豆包 TTS' : 'Allow Paid Doubao TTS from Agent'}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  {isZh
                    ? '默认关闭以防外部 Agent 误扣费（关闭时自动降级免费 Edge / 本地语音）'
                    : 'Disabled by default to prevent accidental billing'}
                </div>
              </div>
              <StudioSwitch
                checked={Boolean(draft.mcp?.allowPaidTtsFromAgent)}
                onCheckedChange={(checked) =>
                  setDraft({
                    ...draft,
                    mcp: { ...draft.mcp, allowPaidTtsFromAgent: checked },
                  })
                }
              />
            </div>
          </div>
        </section>

        {/* Auto-Update & China Acceleration Mirrors */}
        <section
          id="settings-update-section"
          ref={updateSectionRef}
          className="pt-4 border-t border-border-subtle flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Globe size={13} className="text-text-muted" />
              <span className="text-[12px] font-semibold text-text-primary">
                {isZh ? '自动更新与中国区加速线路' : 'Auto-Update & China Acceleration Mirrors'}
              </span>
              <span className="font-mono text-[10.5px] text-text-muted px-1.5 py-0.5 rounded-[4px] bg-elevated border border-border-subtle">
                v{updateStatus.currentVersion}
              </span>
              {updateStatus.checkResult?.updateAvailable ? (
                <span className="font-mono text-[10.5px] text-accent">
                  → v{updateStatus.checkResult.latestVersion}
                </span>
              ) : null}
            </div>

            <Button
              id="btn-settings-check-update"
              size="xs"
              variant="default"
              onClick={() => {
                onClose();
                onOpenUpdateCenter();
              }}
            >
              <RefreshCw size={11} />
              <span>{isZh ? '打开更新中心' : 'Open Update Center'}</span>
            </Button>
          </div>

          <div className="rounded-[8px] border border-border-subtle divide-y divide-border-subtle bg-elevated/35 overflow-hidden">
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <div className="text-[12px] text-text-primary">
                {isZh
                  ? '启动时自动静默检查更新（每 12 小时复检）'
                  : 'Auto-check on startup (recheck every 12h)'}
              </div>
              <StudioSwitch
                checked={draft.update.autoCheck !== false}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, update: { ...draft.update, autoCheck: checked } })
                }
              />
            </div>

            <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
              <div className="text-[12px] text-text-primary">
                {isZh
                  ? '接收测试版（Pre-release）更新通道'
                  : 'Include Pre-release (Beta) channel'}
              </div>
              <StudioSwitch
                checked={Boolean(draft.update.includePrerelease)}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, update: { ...draft.update, includePrerelease: checked } })
                }
              />
            </div>

            {window.coodanceDesktop?.isDesktop ? (
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                <div className="text-[12px] text-text-primary">
                  {isZh
                    ? '检测到新版本后后台自动加速下载（校验 SHA256 后提示安装）'
                    : 'Auto-download updates in background (SHA256 verified)'}
                </div>
                <StudioSwitch
                  checked={Boolean(draft.update.autoDownload)}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, update: { ...draft.update, autoDownload: checked } })
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                {isZh ? '下载加速模式（中国大陆适配）' : 'Acceleration Mode'}
              </FieldLabel>
              <StudioSelect
                id="select-update-mirror-mode"
                compact
                value={draft.update.mirrorMode}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    update: { ...draft.update, mirrorMode: v as UpdateMirrorMode },
                  })
                }
                options={[
                  {
                    value: 'auto',
                    label: isZh ? '自动优选（国内加速 → 直连回退）' : 'Auto (Mirrors → Direct)',
                    hint: 'auto',
                  },
                  {
                    value: 'cn-only',
                    label: isZh ? '仅国内加速镜像' : 'China Mirrors Only',
                    hint: 'cn',
                  },
                  {
                    value: 'custom',
                    label: isZh ? '仅使用自定义加速地址' : 'Custom Mirror Only',
                    hint: 'custom',
                  },
                  {
                    value: 'direct',
                    label: isZh ? 'GitHub 官方直连' : 'GitHub Direct',
                    hint: 'direct',
                  },
                ]}
              />
            </div>

            <div>
              <FieldLabel>
                {isZh ? '自定义加速镜像前缀（可选）' : 'Custom Mirror Prefix (Optional)'}
              </FieldLabel>
              <StudioInput
                id="input-custom-mirror-prefix"
                compact
                mono
                placeholder="https://gh-proxy.org/ 或 https://my-worker.dev/{url}"
                value={draft.update.customMirrorPrefix}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    update: { ...draft.update, customMirrorPrefix: e.target.value },
                  })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              id="btn-test-update-mirrors"
              size="xs"
              variant="default"
              disabled={testingMirrors}
              onClick={() => void handleTestMirrors()}
            >
              {testingMirrors ? <Loader2 size={11} className="spin-icon" /> : <Gauge size={11} />}
              <span>
                {testingMirrors
                  ? isZh
                    ? '正在探测各节点延迟...'
                    : 'Testing latency...'
                  : isZh
                    ? '测试加速节点延迟'
                    : 'Test Mirror Latency'}
              </span>
            </Button>

            {draft.update.skippedVersion ? (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] text-text-muted">
                  {isZh ? '已跳过' : 'Skipped'} v{draft.update.skippedVersion}
                </span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      update: { ...draft.update, skippedVersion: '' },
                    })
                  }
                >
                  <RotateCcw size={11} />
                  <span>{isZh ? '恢复提醒' : 'Reset'}</span>
                </Button>
              </div>
            ) : null}

            <span className="text-[11px] text-text-muted ml-auto">
              {isZh ? '所有第三方镜像均强制校验 SHA256' : 'All mirror downloads enforce SHA256'}
            </span>
          </div>

          {mirrorProbeResults ? (
            <div
              id="mirror-probe-results"
              className="grid grid-cols-2 gap-1.5 p-2 rounded-[7px] bg-code border border-border-subtle"
            >
              {mirrorProbeResults.map((node) => (
                <div
                  key={node.id}
                  title={node.error || node.prefix || 'https://github.com'}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] bg-elevated border text-[11px]',
                    node.ok ? 'border-border-subtle' : 'border-danger/25 opacity-75',
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      node.ok ? 'bg-emerald' : 'bg-danger',
                    )}
                  />
                  <span className="truncate flex-1 text-text-primary">{node.label}</span>
                  <span
                    className={cn(
                      'font-mono font-medium shrink-0',
                      node.ok ? 'text-emerald' : 'text-danger',
                    )}
                  >
                    {node.ok && node.latencyMs !== null
                      ? `${node.latencyMs}ms`
                      : isZh
                        ? '不可达'
                        : 'Fail'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </StudioDialog>
  );
};
