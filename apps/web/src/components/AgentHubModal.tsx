import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  Bot,
  Plug,
  Copy,
  Check,
  Download,
  ShieldCheck,
  Wrench,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Trash2,
  RefreshCw,
  Terminal,
  Globe,
  FileCode2,
} from 'lucide-react';
import {
  AgentClientId,
  AgentClientStatusDto,
  AgentInfoResponseDto,
  AgentTransportMode,
  InstallAgentResultDto,
  SettingsDto,
  SkillFileDto,
  apiRequest,
  skillZipDownloadUrl,
} from '../api';
import { UiLang } from '../i18n';

interface AgentHubModalProps {
  lang: UiLang;
  settings: SettingsDto;
  activeProjectSlug: string | null;
  onClose: () => void;
  onSaveSettings: (next: SettingsDto) => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
}

type HubTab = 'connect' | 'skill' | 'tools';

const STAGE_LABEL: Record<string, string> = {
  project: '项目',
  script: '口播 & TTS',
  assets: '素材工坊',
  storyboard: '分镜门禁',
  render: '异步渲染',
  safety: '版本回退',
};

export const AgentHubModal: React.FC<AgentHubModalProps> = ({
  lang,
  settings,
  activeProjectSlug,
  onClose,
  onSaveSettings,
  onNotify,
}) => {
  const [tab, setTab] = useState<HubTab>('connect');
  const [loading, setLoading] = useState(true);
  const [agentData, setAgentData] = useState<AgentInfoResponseDto | null>(null);
  const [skillFiles, setSkillFiles] = useState<SkillFileDto[]>([]);
  const [activeSkillFile, setActiveSkillFile] = useState<string>('SKILL.md');

  const [selectedClientId, setSelectedClientId] = useState<AgentClientId>('cursor');
  const [transport, setTransport] = useState<AgentTransportMode>('http');
  const [installMcp, setInstallMcp] = useState(true);
  const [installSkill, setInstallSkill] = useState(true);

  const [busyInstall, setBusyInstall] = useState(false);
  const [installFeedback, setInstallFeedback] = useState<InstallAgentResultDto | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [mcpDraft, setMcpDraft] = useState(() => ({ ...settings.mcp }));
  const [savingGuardrails, setSavingGuardrails] = useState(false);

  useEffect(() => {
    setMcpDraft({ ...settings.mcp });
  }, [settings.mcp]);

  const loadHubData = useCallback(async () => {
    setLoading(true);
    try {
      const [infoRes, skillRes] = await Promise.all([
        apiRequest<AgentInfoResponseDto>('/api/agent/info'),
        apiRequest<{ skillDir: string | null; files: SkillFileDto[] }>('/api/agent/skill/files'),
      ]);
      setAgentData(infoRes);
      setSkillFiles(skillRes.files);
      if (skillRes.files.length > 0 && !skillRes.files.some((f) => f.relativePath === activeSkillFile)) {
        setActiveSkillFile(skillRes.files[0].relativePath);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeSkillFile, onNotify]);

  useEffect(() => {
    void loadHubData();
  }, [loadHubData]);

  const selectedClient: AgentClientStatusDto | null = useMemo(() => {
    if (!agentData) return null;
    return (
      agentData.info.clients.find((c) => c.id === selectedClientId) ||
      agentData.info.clients[0] ||
      null
    );
  }, [agentData, selectedClientId]);

  const handleSelectClient = (client: AgentClientStatusDto) => {
    setSelectedClientId(client.id);
    setTransport(client.recommendedTransport);
    setInstallMcp(Boolean(client.configPath));
    setInstallSkill(Boolean(client.skillInstallDir));
    setInstallFeedback(null);
  };

  const activeSnippet = useMemo(() => {
    if (!agentData) return '';
    const s = agentData.info.snippets;
    if (selectedClientId === 'cursor') return transport === 'http' ? s.cursorHttp : s.cursorStdio;
    if (selectedClientId === 'claude-code')
      return transport === 'http' ? s.claudeCodeHttp : s.claudeCodeStdio;
    if (selectedClientId === 'claude-desktop')
      return transport === 'http' ? s.claudeDesktopHttp : s.claudeDesktopStdio;
    return transport === 'http' ? s.genericHttp : s.genericStdio;
  }, [agentData, selectedClientId, transport]);

  const copyText = async (key: string, text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 2000);
      onNotify(successMsg, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleInstallAction = async (dryRun: boolean) => {
    if (!selectedClient) return;
    setBusyInstall(true);
    try {
      const res = await apiRequest<{
        result: InstallAgentResultDto;
        info: AgentInfoResponseDto['info'];
      }>('/api/agent/install', {
        method: 'POST',
        body: JSON.stringify({
          clientId: selectedClient.id,
          transport,
          installMcp,
          installSkill,
          dryRun,
        }),
      });
      setInstallFeedback(res.result);
      setAgentData((prev) => (prev ? { ...prev, info: res.info } : prev));
      if (!dryRun) {
        onNotify(`✔ ${selectedClient.name}：${res.result.message}`, 'success');
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyInstall(false);
    }
  };

  const handleUninstallAction = async () => {
    if (!selectedClient) return;
    setBusyInstall(true);
    try {
      const res = await apiRequest<{
        result: { ok: boolean; message: string; backupPath?: string };
        info: AgentInfoResponseDto['info'];
      }>('/api/agent/uninstall', {
        method: 'POST',
        body: JSON.stringify({
          clientId: selectedClient.id,
          removeMcp: selectedClient.mcpInstalled,
          removeSkill: selectedClient.skillInstalled,
        }),
      });
      setAgentData((prev) => (prev ? { ...prev, info: res.info } : prev));
      setInstallFeedback(null);
      onNotify(`✔ ${selectedClient.name}：${res.result.message}`, 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyInstall(false);
    }
  };

  const handleSaveGuardrails = async () => {
    setSavingGuardrails(true);
    try {
      await onSaveSettings({
        ...settings,
        mcp: mcpDraft,
      });
      await loadHubData();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSavingGuardrails(false);
    }
  };

  const handleCopyProjectPrompt = async () => {
    if (!activeProjectSlug) return;
    try {
      const res = await apiRequest<{ prompt: string }>(
        `/api/projects/${encodeURIComponent(activeProjectSlug)}/ai/agent-context`,
      );
      await copyText(
        'prompt',
        res.prompt,
        lang === 'zh-CN'
          ? `已复制工程 ${activeProjectSlug} 的完整上下文 Prompt`
          : `Copied context prompt for ${activeProjectSlug}`,
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const activeSkillContent =
    skillFiles.find((f) => f.relativePath === activeSkillFile)?.content || '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        id="agent-hub-modal"
        className="modal-window wide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={17} style={{ color: 'var(--cyan)' }} />
            <div>
              <h3 className="panel-title" style={{ margin: 0 }}>
                {lang === 'zh-CN'
                  ? '外部 AI Agent 接入中心 · MCP + Skill 协同引擎'
                  : 'External AI Agent Hub · MCP + Skill'}
              </h3>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {lang === 'zh-CN'
                  ? 'MCP 提供 11 个强校验确定性管线工具，Skill 提供 5 阶段编导与外部生图/录屏/SVG 入库 SOP'
                  : '11 validated MCP tools + 5-stage Code-as-Video Skill SOP with CLI fallback'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="segmented-pills" role="tablist">
              <button
                id="agent-tab-connect"
                type="button"
                className={`segmented-pill ${tab === 'connect' ? 'active' : ''}`}
                onClick={() => setTab('connect')}
              >
                <Plug size={12} style={{ marginRight: 5, verticalAlign: '-2px' }} />
                一键接入
              </button>
              <button
                id="agent-tab-skill"
                type="button"
                className={`segmented-pill ${tab === 'skill' ? 'active' : ''}`}
                onClick={() => setTab('skill')}
              >
                <BookOpen size={12} style={{ marginRight: 5, verticalAlign: '-2px' }} />
                Skill 规范包
              </button>
              <button
                id="agent-tab-tools"
                type="button"
                className={`segmented-pill ${tab === 'tools' ? 'active' : ''}`}
                onClick={() => setTab('tools')}
              >
                <ShieldCheck size={12} style={{ marginRight: 5, verticalAlign: '-2px' }} />
                工具与护栏
              </button>
            </div>

            <button type="button" className="btn btn-sm btn-icon" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Live MCP Status Strip */}
          {agentData ? (
            <div className="agent-hub-status-strip">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  className={`chip ${agentData.info.mcpEnabled ? 'chip-emerald' : ''}`}
                  style={
                    !agentData.info.mcpEnabled
                      ? { background: 'var(--danger-soft)', color: 'var(--danger)' }
                      : undefined
                  }
                >
                  <span
                    className="status-dot"
                    style={{
                      background: agentData.info.mcpEnabled ? 'var(--emerald)' : 'var(--danger)',
                    }}
                  />
                  {agentData.info.mcpEnabled ? 'Streamable HTTP MCP 在线' : 'MCP HTTP 已暂停'}
                </span>

                <div className="agent-hub-endpoint-pill">
                  <Globe size={12} />
                  <span>{agentData.info.httpEndpointUrl}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-icon"
                    style={{ height: 22, width: 22, padding: 0 }}
                    title="复制 MCP 端点 URL"
                    onClick={() =>
                      void copyText(
                        'endpoint',
                        agentData.info.httpEndpointUrl,
                        '已复制 MCP HTTP 端点 URL',
                      )
                    }
                  >
                    {copiedKey === 'endpoint' ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                </div>

                <span className="chip mono">
                  {agentData.toolsCatalog.length} Tools · {agentData.resourcesCatalog.length} Resources
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="chip chip-cyan mono">
                  Port {agentData.info.actualPort}
                  {agentData.info.guardrails.fixedPortEnabled ? ' (固定)' : ' (动态)'}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  title="刷新检测状态"
                  onClick={() => void loadHubData()}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
          ) : null}

          {agentData?.info.portFallbackReason ? (
            <div className="agent-alert warn">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{agentData.info.portFallbackReason}</span>
            </div>
          ) : null}

          {loading && !agentData ? (
            <div className="empty-stage" style={{ minHeight: 260 }}>
              正在检测本机 AI 客户端与 MCP 端点状态...
            </div>
          ) : null}

          {/* TAB 1: Client One-Click Connect & Installer */}
          {tab === 'connect' && agentData && selectedClient ? (
            <div className="agent-hub-grid">
              {/* Left: Client List */}
              <div className="agent-client-list">
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', paddingLeft: 2 }}>
                  选择外部 AI 客户端（支持自动检测与安全合并）
                </div>
                {agentData.info.clients.map((client) => (
                  <button
                    key={client.id}
                    id={`agent-client-${client.id}`}
                    type="button"
                    className={`agent-client-card ${selectedClient.id === client.id ? 'active' : ''}`}
                    onClick={() => handleSelectClient(client)}
                  >
                    <div className="agent-client-card-head">
                      <span className="agent-client-card-title">{client.name}</span>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {client.mcpInstalled ? (
                          <span className="chip chip-emerald" style={{ fontSize: 10 }}>
                            MCP ({client.mcpInstalledMode})
                          </span>
                        ) : null}
                        {client.skillInstalled ? (
                          <span className="chip chip-cyan" style={{ fontSize: 10 }}>
                            Skill
                          </span>
                        ) : null}
                        {!client.mcpInstalled && !client.skillInstalled && client.clientDetected ? (
                          <span className="chip" style={{ fontSize: 10 }}>
                            已检测
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="agent-client-card-desc">{client.description}</div>
                  </button>
                ))}
              </div>

              {/* Right: Client Configuration Workbench */}
              <div className="agent-workbench">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedClient.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      推荐连接模式：
                      <strong style={{ color: 'var(--accent)' }}>
                        {selectedClient.recommendedTransport === 'http'
                          ? '固定本地 HTTP（实时热更新 + 零进程开销）'
                          : '离线零依赖 stdio（不开软件后台可用）'}
                      </strong>
                    </div>
                  </div>

                  {/* Dual-Mode Transport Toggle */}
                  <div className="segmented-pills">
                    <button
                      id="agent-mode-http"
                      type="button"
                      className={`segmented-pill ${transport === 'http' ? 'active' : ''}`}
                      onClick={() => {
                        setTransport('http');
                        setInstallFeedback(null);
                      }}
                    >
                      <Globe size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                      本地固定 HTTP
                    </button>
                    <button
                      id="agent-mode-stdio"
                      type="button"
                      className={`segmented-pill ${transport === 'stdio' ? 'active' : ''}`}
                      onClick={() => {
                        setTransport('stdio');
                        setInstallFeedback(null);
                      }}
                    >
                      <Terminal size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                      离线零依赖 stdio
                    </button>
                  </div>
                </div>

                {/* Runtime info pill */}
                <div className="agent-alert info" style={{ padding: '8px 10px' }}>
                  {transport === 'http' ? (
                    <>
                      <Globe size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>
                        通过 <code className="mono">{agentData.info.httpEndpointUrl}</code> 直连当前 CooDance 服务；Agent
                        调用 TTS、导入素材或渲染时，工作台会同步展示实时进度与画布热更新。
                      </span>
                    </>
                  ) : (
                    <>
                      <Terminal size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>
                        运行时：<code className="mono">{agentData.info.stdioRuntimeLabel}</code>。即使关闭 CooDance
                        窗口，外部 Agent 仍可离线操作工作区并在下次打开时自动同步。
                      </span>
                    </>
                  )}
                </div>

                {/* Target Paths & Install Checkboxes */}
                {selectedClient.canAutoInstall ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-panel)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {selectedClient.configPath ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={installMcp}
                          onChange={(e) => setInstallMcp(e.target.checked)}
                        />
                        <span>
                          安全合并写入 MCP 配置（写入前自动生成 <code className="mono">.bak</code> 备份）：
                          <code className="mono" style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                            {selectedClient.configPath}
                          </code>
                        </span>
                      </label>
                    ) : null}

                    {selectedClient.skillInstallDir ? (
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={installSkill}
                          onChange={(e) => setInstallSkill(e.target.checked)}
                        />
                        <span>
                          同步安装 <code className="mono">coodance-video-producer</code> Skill 到：
                          <code className="mono" style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>
                            {selectedClient.skillInstallDir}
                          </code>
                        </span>
                      </label>
                    ) : (
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        提示：{selectedClient.name} 无标准全局 Skill 目录，但连接 MCP 后可直接按需读取内置资源{' '}
                        <code className="mono">coodance://skill/guide</code> 获取完整 5 阶段编导规范。
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {selectedClient.canAutoInstall ? (
                    <>
                      <button
                        id="btn-agent-install"
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busyInstall || (!installMcp && !installSkill)}
                        onClick={() => void handleInstallAction(false)}
                      >
                        <Plug size={12} />
                        {busyInstall
                          ? '写入中...'
                          : selectedClient.mcpInstalled || selectedClient.skillInstalled
                            ? '一键更新配置 / Skill'
                            : '一键安全安装'}
                      </button>
                      <button
                        id="btn-agent-preview"
                        type="button"
                        className="btn btn-sm"
                        disabled={busyInstall || (!installMcp && !installSkill)}
                        onClick={() => void handleInstallAction(true)}
                      >
                        <Eye size={12} />
                        预览合并结果
                      </button>
                    </>
                  ) : null}

                  <button
                    id="btn-copy-mcp-snippet"
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      void copyText(
                        'snippet',
                        installFeedback?.previewConfigJson || activeSnippet,
                        `已复制 ${selectedClient.name} (${transport.toUpperCase()}) MCP 配置 JSON`,
                      )
                    }
                  >
                    {copiedKey === 'snippet' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedKey === 'snippet' ? '已复制' : '复制 JSON 配置'}
                  </button>

                  {(selectedClient.mcpInstalled || selectedClient.skillInstalled) &&
                  selectedClient.canAutoInstall ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: 'var(--danger)' }}
                      disabled={busyInstall}
                      onClick={() => void handleUninstallAction()}
                    >
                      <Trash2 size={12} />
                      安全移除
                    </button>
                  ) : null}
                </div>

                {/* Install / Dry-Run Feedback */}
                {installFeedback ? (
                  <div className={`agent-alert ${installFeedback.dryRun ? 'info' : 'success'}`}>
                    <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div>
                        <strong>{installFeedback.message}</strong>
                      </div>
                      {installFeedback.backupPath ? (
                        <div style={{ fontSize: 11, marginTop: 3 }}>
                          原配置已备份至：<code className="mono">{installFeedback.backupPath}</code>
                        </div>
                      ) : null}
                      {installFeedback.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 11, marginTop: 3, color: 'var(--accent)' }}>
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* JSON Config Code Block */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    <span>
                      {installFeedback?.previewConfigJson
                        ? '合并后的完整配置文件预览'
                        : `${selectedClient.name} · ${transport.toUpperCase()} MCP 配置片段`}
                    </span>
                    <span className="mono">mcpServers.coodance</span>
                  </div>
                  <pre className="agent-code-block">
                    {installFeedback?.previewConfigJson || activeSnippet}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}

          {/* TAB 2: Skill Bundle Explorer & Download */}
          {tab === 'skill' && agentData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="agent-hub-status-strip">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileCode2 size={15} style={{ color: 'var(--accent)' }} />
                    <span>coodance-video-producer Skill 创作规范包</span>
                    <span className="chip chip-accent mono">{skillFiles.length} 个文件</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    指导外部 Agent 按 5 阶段 SOP 撰写口播、产出 16:9 SVG / AI 图片 / 录屏并通过{' '}
                    <code className="mono">coodance_import_asset</code> 入库，无 MCP 时自动降级使用本地 CLI。
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    id="btn-download-skill-zip"
                    href={skillZipDownloadUrl()}
                    download="coodance-video-producer-skill.zip"
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={13} />
                    下载 Skill 压缩包 (.zip)
                  </a>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      void copyText('skill-file', activeSkillContent, `已复制 ${activeSkillFile}`)
                    }
                  >
                    {copiedKey === 'skill-file' ? <Check size={12} /> : <Copy size={12} />}
                    复制当前文档
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {skillFiles.map((f) => (
                  <button
                    key={f.relativePath}
                    type="button"
                    className={`btn btn-sm ${activeSkillFile === f.relativePath ? 'btn-primary' : ''}`}
                    onClick={() => setActiveSkillFile(f.relativePath)}
                  >
                    <span className="mono">{f.relativePath}</span>
                    <span style={{ opacity: 0.72, fontSize: 10.5 }}>
                      {(f.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </button>
                ))}
              </div>

              <pre className="agent-doc-block">{activeSkillContent || '未找到 Skill 文档内容。'}</pre>
            </div>
          ) : null}

          {/* TAB 3: MCP Tools Catalog & Safety Guardrails */}
          {tab === 'tools' && agentData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Guardrail Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={14} style={{ color: 'var(--emerald)' }} />
                    <span>安全与成本护栏配置</span>
                  </div>
                  <button
                    id="btn-save-mcp-guardrails"
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={savingGuardrails}
                    onClick={() => void handleSaveGuardrails()}
                  >
                    {savingGuardrails ? '保存中...' : '保存护栏设置'}
                  </button>
                </div>

                <div className="agent-guardrail-grid">
                  <div className="agent-guardrail-item">
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>启用 Streamable HTTP MCP (/mcp)</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        关闭后外部 HTTP 客户端将收到 503，不影响本地 CLI。
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mcpDraft.enabled}
                      onChange={(e) => setMcpDraft({ ...mcpDraft, enabled: e.target.checked })}
                      style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                    />
                  </div>

                  <div className="agent-guardrail-item">
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>桌面端固定本地 MCP 端口</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        重启桌面端生效；端口冲突时自动回退随机端口并提示。
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        className="input mono"
                        style={{ width: 76, height: 28, padding: '2px 8px' }}
                        min={1024}
                        max={65535}
                        disabled={!mcpDraft.fixedPortEnabled}
                        value={mcpDraft.fixedPort}
                        onChange={(e) =>
                          setMcpDraft({ ...mcpDraft, fixedPort: Number(e.target.value) || 4170 })
                        }
                      />
                      <input
                        type="checkbox"
                        checked={mcpDraft.fixedPortEnabled}
                        onChange={(e) =>
                          setMcpDraft({ ...mcpDraft, fixedPortEnabled: e.target.checked })
                        }
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                      />
                    </div>
                  </div>

                  <div className="agent-guardrail-item">
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>Agent 写入前自动打 Git 快照</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        覆盖 script.txt / edit_plan.json 或渲染前自动存档，随时一键回退。
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mcpDraft.autoSnapshotOnAgentWrite}
                      onChange={(e) =>
                        setMcpDraft({ ...mcpDraft, autoSnapshotOnAgentWrite: e.target.checked })
                      }
                      style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                    />
                  </div>

                  <div className="agent-guardrail-item">
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>允许 Agent 触发付费豆包 TTS</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        默认关闭以防外部 Agent 误扣费（关闭时自动引导使用免费 Edge-TTS / 本地离线）。
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mcpDraft.allowPaidTtsFromAgent}
                      onChange={(e) =>
                        setMcpDraft({ ...mcpDraft, allowPaidTtsFromAgent: e.target.checked })
                      }
                      style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                    />
                  </div>
                </div>
              </div>

              {/* 11 MCP Tools Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wrench size={14} style={{ color: 'var(--cyan)' }} />
                  <span>已注册 MCP 工具（{agentData.toolsCatalog.length} 个高内聚工具）</span>
                </div>
                <div className="agent-tools-grid">
                  {agentData.toolsCatalog.map((tool) => (
                    <div key={tool.name} className="agent-tool-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <code className="mono" style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 700 }}>
                          {tool.name}
                        </code>
                        <span className="chip" style={{ fontSize: 10 }}>
                          {STAGE_LABEL[tool.stage] || tool.stage}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{tool.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                        {tool.description}
                      </div>
                      {tool.guardrail ? (
                        <div style={{ fontSize: 11, color: 'var(--emerald)', marginTop: 2 }}>
                          🛡 {tool.guardrail}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* 4 MCP Resources */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  渐进式 MCP Resources（按需读取，零常驻 Token 负担）
                </div>
                <div className="agent-tools-grid">
                  {agentData.resourcesCatalog.map((res) => (
                    <div key={res.uri} className="agent-tool-card">
                      <code className="mono" style={{ fontSize: 11.5, color: 'var(--accent)' }}>
                        {res.uri}
                      </code>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{res.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{res.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeProjectSlug ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleCopyProjectPrompt()}
              >
                {copiedKey === 'prompt' ? <Check size={12} /> : <Copy size={12} />}
                零配置兜底：复制当前工程 ({activeProjectSlug}) 上下文 Prompt
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                所有外部写入操作均会通过 Chokidar 自动热重载到工作台。
              </span>
            )}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
