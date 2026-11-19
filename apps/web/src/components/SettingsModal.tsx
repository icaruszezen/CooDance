import React, { useState } from 'react';
import { X, Save, CheckCircle2, AlertTriangle, FolderOpen, KeyRound } from 'lucide-react';
import { FfmpegHealthDto, SettingsDto, setStoredToken } from '../api';
import { UiLang } from '../i18n';

interface SettingsModalProps {
  lang: UiLang;
  settings: SettingsDto;
  ffmpeg: FfmpegHealthDto | null;
  onClose: () => void;
  onSave: (next: SettingsDto) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  lang,
  settings,
  ffmpeg,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<SettingsDto>(structuredClone(settings));
  const [saving, setSaving] = useState(false);

  const handlePickWorkspace = async () => {
    if (window.coodanceDesktop?.isDesktop) {
      const dir = await window.coodanceDesktop.selectDirectory();
      if (dir) setDraft({ ...draft, workspaceDir: dir });
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
