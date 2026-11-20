import React, { useEffect, useRef, useState } from 'react';
import {
  X,
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
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-window" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h3 className="panel-title">
            <KeyRound size={15} style={{ color: 'var(--accent)' }} />
            {lang === 'zh-CN' ? '工作台与管线设置' : 'Studio & Pipeline Settings'}
          </h3>
          <button type="button" className="btn btn-sm btn-icon" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">
          {/* Workspace & FFmpeg Health */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>工作区目录与底层环境</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                value={draft.workspaceDir}
                onChange={(e) => setDraft({ ...draft, workspaceDir: e.target.value })}
              />
              {window.coodanceDesktop?.isDesktop ? (
                <button type="button" className="btn" onClick={() => void handlePickWorkspace()}>
                  <FolderOpen size={14} /> 浏览
                </button>
              ) : null}
            </div>

            {ffmpeg ? (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: ffmpeg.ok ? 'var(--emerald-soft)' : 'var(--danger-soft)',
                  color: ffmpeg.ok ? 'var(--emerald)' : 'var(--danger)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {ffmpeg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                <span>
                  {ffmpeg.ok
                    ? `FFmpeg / FFprobe 正常 (${ffmpeg.source}): ${ffmpeg.ffmpegVersion || ffmpeg.ffmpegPath}`
                    : `FFmpeg 异常: ${ffmpeg.error}`}
                </span>
              </div>
            ) : null}
          </div>

          {/* Volcengine Doubao 2.0 Credentials */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>
              火山引擎豆包语音合成 2.0 (seed-tts-2.0)
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: 11.5 }}>
                凭证经 AES-256-GCM 本地加密保存
              </span>
            </div>
            <div className="form-grid-2">
              <div>
                <label className="field-label">AppID (X-Api-App-Id)</label>
                <input
                  className="input mono"
                  placeholder="输入火山引擎 AppID"
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
                <label className="field-label">Access Token (X-Api-Access-Key)</label>
                <input
                  type="password"
                  className="input mono"
                  placeholder="输入 Access Token"
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
            <div className="form-grid-2">
              <div>
                <label className="field-label">Resource ID</label>
                <input
                  className="input mono"
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
                <label className="field-label">默认合成引擎</label>
                <select
                  className="select"
                  value={draft.tts.defaultProvider}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tts: {
                        ...draft.tts,
                        defaultProvider: e.target.value as SettingsDto['tts']['defaultProvider'],
                      },
                    })
                  }
                >
                  <option value="doubao">火山豆包 2.0 (无密钥时自动降级)</option>
                  <option value="edge">免费 Edge-TTS</option>
                  <option value="local">本地演示语音 (完全离线)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Optional AI Storyboard Assistant */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>
              可选：AI 分镜自动编排 (OpenAI 兼容接口)
            </div>
            <div className="form-grid-3">
              <div>
                <label className="field-label">API Base URL</label>
                <input
                  className="input mono"
                  value={draft.ai.baseUrl}
                  onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, baseUrl: e.target.value } })}
                />
              </div>
              <div>
                <label className="field-label">API Key</label>
                <input
                  type="password"
                  className="input mono"
                  placeholder="sk-..."
                  value={draft.ai.apiKey}
                  onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, apiKey: e.target.value } })}
                />
              </div>
              <div>
                <label className="field-label">模型 Model</label>
                <input
                  className="input mono"
                  value={draft.ai.model}
                  onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, model: e.target.value } })}
                />
              </div>
            </div>
          </div>

          {/* Self-hosted Web Access Token */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>
              Web 自托管可选访问口令（留空则免密）
            </div>
            <input
              type="password"
              className="input mono"
              placeholder="可选：设置 COODANCE_ACCESS_TOKEN 保护私有 Web 部署与 /mcp 端点"
              value={draft.security.webAccessToken}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  security: { webAccessToken: e.target.value },
                })
              }
            />
          </div>

          {/* External AI Agent / MCP Settings */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>
              外部 AI Agent / MCP 服务与护栏
            </div>
            <div className="form-grid-2">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.mcp?.enabled !== false}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mcp: { ...draft.mcp, enabled: e.target.checked },
                    })
                  }
                />
                <span>启用 Streamable HTTP MCP (/mcp)</span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.mcp?.autoSnapshotOnAgentWrite !== false}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mcp: { ...draft.mcp, autoSnapshotOnAgentWrite: e.target.checked },
                    })
                  }
                />
                <span>Agent 写入前自动打 Git 快照</span>
              </label>
            </div>

            <div className="form-grid-2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.mcp?.fixedPortEnabled !== false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        mcp: { ...draft.mcp, fixedPortEnabled: e.target.checked },
                      })
                    }
                  />
                  <span>桌面端固定本地端口</span>
                </label>
                <input
                  type="number"
                  className="input mono"
                  style={{ width: 88 }}
                  min={1024}
                  max={65535}
                  disabled={draft.mcp?.fixedPortEnabled === false}
                  value={draft.mcp?.fixedPort ?? 4170}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mcp: { ...draft.mcp, fixedPort: Number(e.target.value) || 4170 },
                    })
                  }
                />
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(draft.mcp?.allowPaidTtsFromAgent)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      mcp: { ...draft.mcp, allowPaidTtsFromAgent: e.target.checked },
                    })
                  }
                />
                <span>允许外部 Agent 调用付费豆包 TTS</span>
              </label>
            </div>
          </div>

          {/* Auto-Update & China Acceleration Mirrors */}
          <div
            id="settings-update-section"
            ref={updateSectionRef}
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={14} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>
                  {lang === 'zh-CN'
                    ? '自动更新与中国区加速线路'
                    : 'Auto-Update & China Acceleration Mirrors'}
                </span>
                <span className="chip mono" style={{ fontSize: 10.5 }}>
                  v{updateStatus.currentVersion}
                </span>
                {updateStatus.checkResult?.updateAvailable ? (
                  <span className="chip chip-accent mono" style={{ fontSize: 10.5 }}>
                    {lang === 'zh-CN' ? '新版本' : 'New'} v{updateStatus.checkResult.latestVersion}
                  </span>
                ) : null}
              </div>

              <button
                id="btn-settings-check-update"
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onClose();
                  onOpenUpdateCenter();
                }}
              >
                <RefreshCw size={12} />
                {lang === 'zh-CN' ? '打开更新中心' : 'Open Update Center'}
              </button>
            </div>

            <div className="form-grid-2">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.update.autoCheck !== false}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      update: { ...draft.update, autoCheck: e.target.checked },
                    })
                  }
                />
                <span>
                  {lang === 'zh-CN'
                    ? '启动时自动静默检查更新（每 12 小时复检）'
                    : 'Auto-check on startup (recheck every 12h)'}
                </span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(draft.update.includePrerelease)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      update: { ...draft.update, includePrerelease: e.target.checked },
                    })
                  }
                />
                <span>
                  {lang === 'zh-CN'
                    ? '接收测试版（Pre-release）更新通道'
                    : 'Include Pre-release (Beta) channel'}
                </span>
              </label>
            </div>

            {window.coodanceDesktop?.isDesktop ? (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(draft.update.autoDownload)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      update: { ...draft.update, autoDownload: e.target.checked },
                    })
                  }
                />
                <span>
                  {lang === 'zh-CN'
                    ? '检测到新版本后在后台自动加速下载（约 200MB，下载并校验 SHA256 后提示安装）'
                    : 'Auto-download update in background (~200MB, SHA256 verified before install)'}
                </span>
              </label>
            ) : null}

            <div className="form-grid-2">
              <div>
                <label className="field-label">
                  {lang === 'zh-CN' ? '下载加速模式（中国大陆网络适配）' : 'Acceleration Mode'}
                </label>
                <select
                  id="select-update-mirror-mode"
                  className="select"
                  value={draft.update.mirrorMode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      update: {
                        ...draft.update,
                        mirrorMode: e.target.value as UpdateMirrorMode,
                      },
                    })
                  }
                >
                  <option value="auto">
                    {lang === 'zh-CN'
                      ? '自动优选（国内加速 → 直连回退）'
                      : 'Auto (China Mirrors -> GitHub Direct)'}
                  </option>
                  <option value="cn-only">
                    {lang === 'zh-CN'
                      ? '仅国内加速镜像（多节点自动切换）'
                      : 'China Mirrors Only'}
                  </option>
                  <option value="custom">
                    {lang === 'zh-CN' ? '仅使用自定义加速地址' : 'Custom Mirror Only'}
                  </option>
                  <option value="direct">
                    {lang === 'zh-CN'
                      ? 'GitHub 官方直连（海外/代理网络）'
                      : 'GitHub Direct'}
                  </option>
                </select>
              </div>

              <div>
                <label className="field-label">
                  {lang === 'zh-CN'
                    ? '自定义加速镜像前缀（可选，优先级最高）'
                    : 'Custom Mirror Prefix (Optional)'}
                </label>
                <input
                  id="input-custom-mirror-prefix"
                  className="input mono"
                  placeholder="https://gh-proxy.org/ 或 https://my-worker.dev/{url}"
                  value={draft.update.customMirrorPrefix}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      update: {
                        ...draft.update,
                        customMirrorPrefix: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className="update-mirror-probe-bar">
              <button
                id="btn-test-update-mirrors"
                type="button"
                className="btn btn-sm"
                disabled={testingMirrors}
                onClick={() => void handleTestMirrors()}
              >
                {testingMirrors ? <Loader2 size={12} className="spin-icon" /> : <Gauge size={12} />}
                {testingMirrors
                  ? lang === 'zh-CN'
                    ? '正在探测各节点延迟...'
                    : 'Testing mirror latency...'
                  : lang === 'zh-CN'
                    ? '测试加速节点延迟'
                    : 'Test Mirror Latency'}
              </button>

              {draft.update.skippedVersion ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="chip mono" style={{ fontSize: 11 }}>
                    {lang === 'zh-CN' ? '已跳过' : 'Skipped'} v{draft.update.skippedVersion}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        update: { ...draft.update, skippedVersion: '' },
                      })
                    }
                  >
                    <RotateCcw size={11} />
                    {lang === 'zh-CN' ? '恢复提醒' : 'Reset'}
                  </button>
                </div>
              ) : null}

              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {lang === 'zh-CN'
                  ? '所有第三方镜像下载均强制校验 SHA256'
                  : 'All mirror downloads enforce SHA256 verification'}
              </span>
            </div>

            {mirrorProbeResults ? (
              <div id="mirror-probe-results" className="mirror-probe-grid">
                {mirrorProbeResults.map((node) => (
                  <div
                    key={node.id}
                    className={`mirror-probe-item ${node.ok ? 'ok' : 'fail'}`}
                    title={node.error || node.prefix || 'https://github.com'}
                  >
                    <span className={`mirror-probe-dot ${node.ok ? 'ok' : 'fail'}`} />
                    <span className="mirror-probe-label">{node.label}</span>
                    <span className="mono mirror-probe-latency">
                      {node.ok && node.latencyMs !== null
                        ? `${node.latencyMs}ms`
                        : lang === 'zh-CN'
                          ? '不可达'
                          : 'Fail'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={13} />
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </form>
    </div>
  );
};
