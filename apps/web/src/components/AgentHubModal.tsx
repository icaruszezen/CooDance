import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import {
  Button,
  CodeEditor,
  NumberScrubInput,
  SegmentedTabs,
  StudioDialog,
  StudioSwitch,
  cn,
} from './ui';

interface AgentHubModalProps {
  lang: UiLang;
  uiTheme: 'dark' | 'light';
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
  uiTheme,
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
  const isZh = lang === 'zh-CN';

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
        isZh
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
    <StudioDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      id="agent-hub-modal"
      size="xl"
      title={
        <>
          <Bot size={15} className="text-text-secondary" />
          <span>
            {isZh
              ? '外部 AI Agent 接入中心 · MCP + Skill'
              : 'External AI Agent Hub · MCP + Skill'}
          </span>
        </>
      }
      description={
        isZh
          ? '11 个强校验确定性 MCP 工具 + 5 阶段 Code-as-Video Skill 编导规范'
          : '11 validated MCP tools + 5-stage Code-as-Video Skill SOP with CLI fallback'
      }
      headerExtra={
        <SegmentedTabs
          value={tab}
          onValueChange={setTab}
          size="xs"
          items={[
            {
              value: 'connect',
              id: 'agent-tab-connect',
              label: (
                <>
                  <Plug size={11} />
                  <span>{isZh ? '一键接入' : 'Connect'}</span>
                </>
              ),
            },
            {
              value: 'skill',
              id: 'agent-tab-skill',
              label: (
                <>
                  <BookOpen size={11} />
                  <span>{isZh ? 'Skill 规范包' : 'Skill Pack'}</span>
                </>
              ),
            },
            {
              value: 'tools',
              id: 'agent-tab-tools',
              label: (
                <>
                  <ShieldCheck size={11} />
                  <span>{isZh ? '工具与护栏' : 'Tools & Safety'}</span>
                </>
              ),
            },
          ]}
        />
      }
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          <div>
            {activeProjectSlug ? (
              <Button size="xs" variant="default" onClick={() => void handleCopyProjectPrompt()}>
                {copiedKey === 'prompt' ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                <span>
                  {isZh
                    ? `复制当前工程 (${activeProjectSlug}) 上下文 Prompt`
                    : `Copy ${activeProjectSlug} Context Prompt`}
                </span>
              </Button>
            ) : (
              <span className="text-[11px] text-text-muted">
                {isZh
                  ? '所有外部写入操作均会通过 Chokidar 自动热重载到工作台。'
                  : 'All external writes automatically hot-reload via Chokidar.'}
              </span>
            )}
          </div>
          <Button size="sm" variant="default" onClick={onClose}>
            {isZh ? '关闭' : 'Close'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {/* Live MCP Status Strip */}
        {agentData ? (
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-[8px] bg-elevated/60 border border-border-subtle">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-text-primary">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    agentData.info.mcpEnabled ? 'bg-emerald' : 'bg-danger',
                  )}
                />
                <span>
                  {agentData.info.mcpEnabled ? 'Streamable HTTP MCP 在线' : 'MCP HTTP 已暂停'}
                </span>
              </span>

              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] bg-code border border-border-subtle font-mono text-[11.5px] text-text-primary">
                <Globe size={11} className="text-text-muted" />
                <span>{agentData.info.httpEndpointUrl}</span>
                <button
                  type="button"
                  title="复制 MCP 端点 URL"
                  onClick={() =>
                    void copyText(
                      'endpoint',
                      agentData.info.httpEndpointUrl,
                      '已复制 MCP HTTP 端点 URL',
                    )
                  }
                  className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
                >
                  {copiedKey === 'endpoint' ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                </button>
              </div>

              <span className="font-mono text-[11px] text-text-muted">
                {agentData.toolsCatalog.length} Tools · {agentData.resourcesCatalog.length} Resources
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-text-secondary px-2 py-0.5 rounded-[5px] bg-canvas border border-border-subtle">
                Port {agentData.info.actualPort}
                {agentData.info.guardrails.fixedPortEnabled ? ' (固定)' : ' (动态)'}
              </span>
              <Button size="xs" variant="ghost" title="刷新检测状态" onClick={() => void loadHubData()}>
                <RefreshCw size={12} />
              </Button>
            </div>
          </div>
        ) : null}

        {agentData?.info.portFallbackReason ? (
          <div className="px-3 py-2 rounded-[7px] bg-accent-soft border border-accent/25 text-accent text-[12px] flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{agentData.info.portFallbackReason}</span>
          </div>
        ) : null}

        {loading && !agentData ? (
          <div className="py-20 text-center text-[12.5px] text-text-muted">
            {isZh ? '正在检测本机 AI 客户端与 MCP 端点状态...' : 'Detecting local AI clients & MCP endpoint...'}
          </div>
        ) : null}

        {/* TAB 1: Client Connect & Installer */}
        {tab === 'connect' && agentData && selectedClient ? (
          <div className="grid grid-cols-[276px_minmax(0,1fr)] gap-3.5 min-h-[410px]">
            {/* Left: Client Selector List */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="text-[11px] font-medium text-text-muted px-0.5">
                {isZh ? '选择外部 AI 客户端' : 'Select AI Client'}
              </div>
              <div className="border border-border-subtle rounded-[8px] overflow-hidden divide-y divide-border-subtle bg-elevated/35">
                {agentData.info.clients.map((client) => {
                  const isActive = selectedClient.id === client.id;
                  return (
                    <button
                      key={client.id}
                      id={`agent-client-${client.id}`}
                      type="button"
                      onClick={() => handleSelectClient(client)}
                      className={cn(
                        'relative w-full text-left px-3 py-2.5 flex flex-col gap-1 transition-colors cursor-pointer',
                        isActive ? 'bg-elevated text-text-primary' : 'hover:bg-hover/60 text-text-secondary',
                      )}
                    >
                      {isActive ? (
                        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold text-text-primary">
                          {client.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {client.mcpInstalled ? (
                            <span className="font-mono text-[10px] text-emerald px-1.5 py-px rounded-[4px] bg-emerald-soft">
                              MCP
                            </span>
                          ) : null}
                          {client.skillInstalled ? (
                            <span className="font-mono text-[10px] text-cyan px-1.5 py-px rounded-[4px] bg-cyan-soft">
                              Skill
                            </span>
                          ) : null}
                          {!client.mcpInstalled && !client.skillInstalled && client.clientDetected ? (
                            <span className="font-mono text-[10px] text-text-muted px-1.5 py-px rounded-[4px] bg-canvas border border-border-subtle">
                              {isZh ? '已检测' : 'Detected'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-[11px] text-text-muted leading-snug">
                        {client.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Client Configuration Workbench */}
            <div className="rounded-[8px] border border-border-subtle bg-elevated/35 p-3.5 flex flex-col gap-3 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[13.5px] font-semibold text-text-primary">
                    {selectedClient.name}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {isZh ? '推荐模式：' : 'Recommended: '}
                    <span className="text-text-secondary font-medium">
                      {selectedClient.recommendedTransport === 'http'
                        ? isZh
                          ? '固定本地 HTTP（实时热更新 + 零进程开销）'
                          : 'Local HTTP (Live hot-reload)'
                        : isZh
                          ? '离线零依赖 stdio（不开软件后台可用）'
                          : 'Offline stdio'}
                    </span>
                  </div>
                </div>

                <SegmentedTabs
                  value={transport}
                  onValueChange={(next) => {
                    setTransport(next);
                    setInstallFeedback(null);
                  }}
                  size="xs"
                  items={[
                    {
                      value: 'http',
                      id: 'agent-mode-http',
                      label: (
                        <>
                          <Globe size={11} />
                          <span>{isZh ? '本地固定 HTTP' : 'HTTP'}</span>
                        </>
                      ),
                    },
                    {
                      value: 'stdio',
                      id: 'agent-mode-stdio',
                      label: (
                        <>
                          <Terminal size={11} />
                          <span>{isZh ? '离线 stdio' : 'stdio'}</span>
                        </>
                      ),
                    },
                  ]}
                />
              </div>

              <div className="px-3 py-2 rounded-[6px] bg-panel border border-border-subtle text-[11.5px] text-text-secondary leading-relaxed flex items-start gap-2">
                {transport === 'http' ? (
                  <>
                    <Globe size={13} className="text-text-muted shrink-0 mt-0.5" />
                    <span>
                      通过 <code className="font-mono text-text-primary">{agentData.info.httpEndpointUrl}</code> 直连当前 CooDance
                      服务；Agent 调用 TTS、导入素材或渲染时，工作台同步展示实时进度与画布热更新。
                    </span>
                  </>
                ) : (
                  <>
                    <Terminal size={13} className="text-text-muted shrink-0 mt-0.5" />
                    <span>
                      运行时：<code className="font-mono text-text-primary">{agentData.info.stdioRuntimeLabel}</code>。即使关闭
                      CooDance 窗口，外部 Agent 仍可离线读写工作区。
                    </span>
                  </>
                )}
              </div>

              {/* Target Paths & Install Switches */}
              {selectedClient.canAutoInstall ? (
                <div className="rounded-[7px] border border-border-subtle divide-y divide-border-subtle bg-panel overflow-hidden">
                  {selectedClient.configPath ? (
                    <div className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 text-[11.5px] text-text-secondary leading-snug">
                        <span className="text-text-primary font-medium">安全合并写入 MCP 配置</span>
                        <span className="text-text-muted">（写入前自动生成 .bak 备份）</span>
                        <div className="font-mono text-[10.5px] text-text-muted truncate mt-0.5">
                          {selectedClient.configPath}
                        </div>
                      </div>
                      <StudioSwitch checked={installMcp} onCheckedChange={setInstallMcp} />
                    </div>
                  ) : null}

                  {selectedClient.skillInstallDir ? (
                    <div className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 text-[11.5px] text-text-secondary leading-snug">
                        <span className="text-text-primary font-medium">
                          同步安装 coodance-video-producer Skill
                        </span>
                        <div className="font-mono text-[10.5px] text-text-muted truncate mt-0.5">
                          {selectedClient.skillInstallDir}
                        </div>
                      </div>
                      <StudioSwitch checked={installSkill} onCheckedChange={setInstallSkill} />
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-text-muted">
                      提示：{selectedClient.name} 无标准全局 Skill 目录，连接 MCP 后可直接读取内置资源{' '}
                      <code className="font-mono text-text-secondary">coodance://skill/guide</code>。
                    </div>
                  )}
                </div>
              ) : null}

              {/* Action Bar */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedClient.canAutoInstall ? (
                  <>
                    <Button
                      id="btn-agent-install"
                      size="xs"
                      variant="primary"
                      disabled={busyInstall || (!installMcp && !installSkill)}
                      onClick={() => void handleInstallAction(false)}
                    >
                      <Plug size={11} />
                      <span>
                        {busyInstall
                          ? '写入中...'
                          : selectedClient.mcpInstalled || selectedClient.skillInstalled
                            ? '一键更新配置 / Skill'
                            : '一键安全安装'}
                      </span>
                    </Button>
                    <Button
                      id="btn-agent-preview"
                      size="xs"
                      variant="default"
                      disabled={busyInstall || (!installMcp && !installSkill)}
                      onClick={() => void handleInstallAction(true)}
                    >
                      <Eye size={11} />
                      <span>预览合并结果</span>
                    </Button>
                  </>
                ) : null}

                <Button
                  id="btn-copy-mcp-snippet"
                  size="xs"
                  variant="default"
                  onClick={() =>
                    void copyText(
                      'snippet',
                      installFeedback?.previewConfigJson || activeSnippet,
                      `已复制 ${selectedClient.name} (${transport.toUpperCase()}) MCP 配置 JSON`,
                    )
                  }
                >
                  {copiedKey === 'snippet' ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                  <span>{copiedKey === 'snippet' ? '已复制' : '复制 JSON 配置'}</span>
                </Button>

                {(selectedClient.mcpInstalled || selectedClient.skillInstalled) &&
                selectedClient.canAutoInstall ? (
                  <Button
                    size="xs"
                    variant="danger"
                    disabled={busyInstall}
                    onClick={() => void handleUninstallAction()}
                  >
                    <Trash2 size={11} />
                    <span>安全移除</span>
                  </Button>
                ) : null}
              </div>

              {installFeedback ? (
                <div
                  className={cn(
                    'px-3 py-2 rounded-[7px] border text-[11.5px] flex items-start gap-2',
                    installFeedback.dryRun
                      ? 'bg-cyan-soft/50 border-cyan/25 text-cyan'
                      : 'bg-emerald-soft/50 border-emerald/25 text-emerald',
                  )}
                >
                  <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold">{installFeedback.message}</div>
                    {installFeedback.backupPath ? (
                      <div className="text-[10.5px] opacity-85 mt-0.5 font-mono truncate">
                        Backup: {installFeedback.backupPath}
                      </div>
                    ) : null}
                    {installFeedback.warnings.map((w, i) => (
                      <div key={i} className="text-[10.5px] text-accent mt-0.5">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Read-Only CodeMirror 6 JSON Snippet */}
              <div className="flex flex-col gap-1 flex-1 min-h-[160px]">
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>
                    {installFeedback?.previewConfigJson
                      ? '合并后的完整配置文件预览'
                      : `${selectedClient.name} · ${transport.toUpperCase()} MCP 配置片段`}
                  </span>
                  <span className="font-mono">mcpServers.coodance</span>
                </div>
                <div className="flex-1 min-h-[150px] max-h-[220px] rounded-[7px] border border-border-subtle overflow-hidden">
                  <CodeEditor
                    value={installFeedback?.previewConfigJson || activeSnippet}
                    language="json"
                    theme={uiTheme}
                    readOnly
                    lineNumbers
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* TAB 2: Skill Bundle Explorer (Read-Only CodeMirror 6 Markdown) */}
        {tab === 'skill' && agentData ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-[8px] bg-elevated/50 border border-border-subtle">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                  <FileCode2 size={14} className="text-accent" />
                  <span>coodance-video-producer Skill 创作规范包</span>
                  <span className="font-mono text-[10.5px] text-text-muted">
                    ({skillFiles.length} files)
                  </span>
                </div>
                <div className="text-[11.5px] text-text-muted mt-0.5">
                  指导外部 Agent 按 5 阶段 SOP 撰写口播、产出 16:9 素材并通过{' '}
                  <code className="font-mono text-text-secondary">coodance_import_asset</code> 入库。
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  id="btn-download-skill-zip"
                  href={skillZipDownloadUrl()}
                  download="coodance-video-producer-skill.zip"
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-primary text-primary-ink hover:bg-primary-hover text-[12px] font-semibold no-underline transition-colors"
                >
                  <Download size={12} />
                  <span>下载 Skill (.zip)</span>
                </a>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() =>
                    void copyText('skill-file', activeSkillContent, `已复制 ${activeSkillFile}`)
                  }
                >
                  {copiedKey === 'skill-file' ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                  <span>复制文档</span>
                </Button>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {skillFiles.map((f) => (
                <Button
                  key={f.relativePath}
                  size="xs"
                  variant={activeSkillFile === f.relativePath ? 'primary' : 'default'}
                  onClick={() => setActiveSkillFile(f.relativePath)}
                  className="font-mono"
                >
                  <span>{f.relativePath}</span>
                  <span className="opacity-65 text-[10px]">
                    {(f.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </Button>
              ))}
            </div>

            <div className="h-[360px] rounded-[8px] border border-border-subtle overflow-hidden">
              <CodeEditor
                value={activeSkillContent || '未找到 Skill 文档内容。'}
                language="markdown"
                theme={uiTheme}
                readOnly
                wordWrap
                lineNumbers
              />
            </div>
          </div>
        ) : null}

        {/* TAB 3: Guardrails (Linear 1px List) + MCP Tools & Resources Catalog */}
        {tab === 'tools' && agentData ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-text-primary">
                  <ShieldCheck size={13} className="text-emerald" />
                  <span>安全与成本护栏配置</span>
                </div>
                <Button
                  id="btn-save-mcp-guardrails"
                  size="xs"
                  variant="primary"
                  disabled={savingGuardrails}
                  onClick={() => void handleSaveGuardrails()}
                >
                  {savingGuardrails ? '保存中...' : '保存护栏设置'}
                </Button>
              </div>

              <div className="rounded-[8px] border border-border-subtle divide-y divide-border-subtle bg-elevated/35 overflow-hidden">
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-text-primary">
                      启用 Streamable HTTP MCP (/mcp)
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      关闭后外部 HTTP 客户端将收到 503，不影响本地 CLI。
                    </div>
                  </div>
                  <StudioSwitch
                    checked={mcpDraft.enabled}
                    onCheckedChange={(checked) => setMcpDraft({ ...mcpDraft, enabled: checked })}
                  />
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-text-primary">
                      桌面端固定本地 MCP 端口
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      重启桌面端生效；端口冲突时自动回退随机端口并提示。
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
                        disabled={!mcpDraft.fixedPortEnabled}
                        value={mcpDraft.fixedPort}
                        onValueChange={(val) =>
                          setMcpDraft({ ...mcpDraft, fixedPort: Math.round(val) || 4170 })
                        }
                      />
                    </div>
                    <StudioSwitch
                      checked={mcpDraft.fixedPortEnabled}
                      onCheckedChange={(checked) =>
                        setMcpDraft({ ...mcpDraft, fixedPortEnabled: checked })
                      }
                    />
                  </div>
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-text-primary">
                      Agent 写入前自动打 Git 快照
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      覆盖 script.txt / edit_plan.json 或渲染前自动存档，随时一键回退。
                    </div>
                  </div>
                  <StudioSwitch
                    checked={mcpDraft.autoSnapshotOnAgentWrite}
                    onCheckedChange={(checked) =>
                      setMcpDraft({ ...mcpDraft, autoSnapshotOnAgentWrite: checked })
                    }
                  />
                </div>

                <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-text-primary">
                      允许 Agent 触发付费豆包 TTS
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      默认关闭以防外部 Agent 误扣费（关闭时自动引导使用免费 Edge-TTS / 本地离线）。
                    </div>
                  </div>
                  <StudioSwitch
                    checked={mcpDraft.allowPaidTtsFromAgent}
                    onCheckedChange={(checked) =>
                      setMcpDraft({ ...mcpDraft, allowPaidTtsFromAgent: checked })
                    }
                  />
                </div>
              </div>
            </div>

            {/* 11 MCP Tools */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[12.5px] font-semibold text-text-primary">
                <Wrench size={13} className="text-text-muted" />
                <span>已注册 MCP 工具（{agentData.toolsCatalog.length} 个高内聚工具）</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {agentData.toolsCatalog.map((tool) => (
                  <div
                    key={tool.name}
                    className="p-2.5 rounded-[7px] bg-elevated/45 border border-border-subtle flex flex-col gap-1 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-[11.5px] font-semibold text-text-primary truncate">
                        {tool.name}
                      </code>
                      <span className="font-mono text-[10px] text-text-muted px-1.5 py-px rounded-[4px] bg-canvas border border-border-subtle shrink-0">
                        {STAGE_LABEL[tool.stage] || tool.stage}
                      </span>
                    </div>
                    <div className="text-[11.5px] font-medium text-text-secondary">{tool.title}</div>
                    <div className="text-[11px] text-text-muted leading-snug">{tool.description}</div>
                    {tool.guardrail ? (
                      <div className="text-[10.5px] text-emerald mt-0.5">🛡 {tool.guardrail}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* 4 MCP Resources */}
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold text-text-secondary">
                渐进式 MCP Resources（按需读取，零常驻 Token 负担）
              </div>
              <div className="grid grid-cols-2 gap-2">
                {agentData.resourcesCatalog.map((res) => (
                  <div
                    key={res.uri}
                    className="p-2.5 rounded-[7px] bg-elevated/45 border border-border-subtle flex flex-col gap-1"
                  >
                    <code className="font-mono text-[11px] text-accent">{res.uri}</code>
                    <div className="text-[11.5px] font-medium text-text-primary">{res.name}</div>
                    <div className="text-[11px] text-text-muted leading-snug">{res.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </StudioDialog>
  );
};
