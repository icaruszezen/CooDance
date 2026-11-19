import React, { useState } from 'react';
import {
  Clapperboard,
  GitBranch,
  History,
  RotateCcw,
  FileCode2,
  Download,
  FolderOpen,
  Tag,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  ProgressEventDto,
  ProjectWorkspaceDto,
  apiRequest,
  projectFileUrl,
} from '../api';
import { UiLang, t } from '../i18n';

interface RenderSnapshotsViewProps {
  lang: UiLang;
  workspace: ProjectWorkspaceDto;
  renderLogs: ProgressEventDto[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
}

export const RenderSnapshotsView: React.FC<RenderSnapshotsViewProps> = ({
  lang,
  workspace,
  renderLogs,
  onRefresh,
  onNotify,
}) => {
  const [preset, setPreset] = useState<'production' | 'draft'>('production');
  const [outputName, setOutputName] = useState('');
  const [crf, setCrf] = useState(18);
  const [autoSnapshot, setAutoSnapshot] = useState(true);
  const [rendering, setRendering] = useState(false);

  const [snapNote, setSnapNote] = useState('');
  const [busySnap, setBusySnap] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(
    workspace.snapshots[0]?.tag || null,
  );
  const [diffData, setDiffData] = useState<{
    stat: string;
    patch: string;
    files: string[];
  } | null>(null);

  const handleRender = async () => {
    setRendering(true);
    try {
      const res = await apiRequest<{
        result: { relativePath: string; width: number; height: number; fps: number };
      }>(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/render`, {
        method: 'POST',
        body: JSON.stringify({
          preset,
          outputName: outputName.trim() || undefined,
          crf,
          autoSnapshot,
        }),
      });
      await onRefresh();
      onNotify(
        `✔ 导出完成: ${res.result.relativePath} (${res.result.width}×${res.result.height} @ ${res.result.fps}fps)`,
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRendering(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setBusySnap(true);
    try {
      const res = await apiRequest<{ snapshot: { tag: string } }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/snapshots`,
        {
          method: 'POST',
          body: JSON.stringify({ note: snapNote.trim() || 'Manual studio snapshot' }),
        },
      );
      setSnapNote('');
      await onRefresh();
      setSelectedTag(res.snapshot.tag);
      onNotify(`✔ 已打时间戳快照: ${res.snapshot.tag}`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusySnap(false);
    }
  };

  const handleInspectTag = async (tag: string) => {
    setSelectedTag(tag);
    try {
      const diff = await apiRequest<{ stat: string; patch: string; files: string[] }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/snapshots/${encodeURIComponent(tag)}/diff`,
      );
      setDiffData(diff);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRestore = async (tag: string, filePath?: string) => {
    const confirmText = filePath
      ? `确定将单文件 "${filePath}" 回退到快照 ${tag} 吗？（系统会先自动打安全备份快照）`
      : `确定将整个工程回退到快照 ${tag} 吗？（系统会先自动打安全备份快照）`;
    if (!window.confirm(confirmText)) return;

    setBusySnap(true);
    try {
      const res = await apiRequest<{ restored: { backupTag: string } }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/snapshots/${encodeURIComponent(tag)}/restore`,
        {
          method: 'POST',
          body: JSON.stringify({ filePath }),
        },
      );
      await onRefresh();
      onNotify(
        `✔ 已恢复 ${filePath || '整个工程'} 至 ${tag}（自动备份标签: ${res.restored.backupTag}）`,
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusySnap(false);
    }
  };

  const latestRender = workspace.renders[0];

  return (
    <div className="split-two-col">
      {/* Left: Stage 5 Production / Draft Render Engine */}
      <section className="panel-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <Clapperboard size={15} style={{ color: 'var(--accent)' }} />
            {lang === 'zh-CN' ? 'H.264 成片渲染导出 (Remotion)' : 'H.264 MP4 Renderer (Remotion)'}
          </h2>
          <button
            id="btn-render-mp4"
            type="button"
            className="btn btn-sm btn-primary"
            disabled={rendering}
            onClick={() => void handleRender()}
          >
            {rendering ? <RefreshCw size={13} /> : <Clapperboard size={13} />}
            {rendering ? (lang === 'zh-CN' ? '渲染中...' : 'Rendering...') : t(lang, 'renderNow')}
          </button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Render Preset Selector */}
          <div className="form-grid-2">
            <button
              type="button"
              onClick={() => {
                setPreset('production');
                setCrf(18);
              }}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1.5px solid ${preset === 'production' ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: preset === 'production' ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>成品交付模式 (Production)</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                1920×1080 · 60fps · H.264 yuv420p
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setPreset('draft');
                setCrf(24);
              }}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1.5px solid ${preset === 'draft' ? 'var(--cyan)' : 'var(--border-subtle)'}`,
                background: preset === 'draft' ? 'var(--cyan-soft)' : 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>快速草稿模式 (Draft)</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                1280×720 · 30fps · 极速审片验证
              </div>
            </button>
          </div>

          <div className="form-grid-2">
            <div>
              <label className="field-label">自定义输出文件名（留空自动命名）</label>
              <input
                className="input mono"
                placeholder={`${workspace.summary.slug}-${preset === 'draft' ? 'draft-720p' : '1080p60'}.mp4`}
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">画质 CRF ({crf}，越小越清晰)</label>
              <input
                type="number"
                className="input mono"
                min={14}
                max={30}
                value={crf}
                onChange={(e) => setCrf(Number(e.target.value))}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={autoSnapshot}
              onChange={(e) => setAutoSnapshot(e.target.checked)}
            />
            渲染导出前自动打 Git 时间戳快照（保障每次出片版本可精确溯源）
          </label>

          {/* Latest Rendered MP4 Player */}
          {latestRender ? (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} style={{ color: 'var(--emerald)' }} />
                    {latestRender.name}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {(latestRender.sizeBytes / 1024 / 1024).toFixed(2)} MB · {new Date(latestRender.modifiedAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {window.coodanceDesktop?.isDesktop ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        void window.coodanceDesktop?.revealPath(
                          `${workspace.summary.path}/${latestRender.relativePath}`,
                        )
                      }
                    >
                      <FolderOpen size={12} /> 定位文件
                    </button>
                  ) : null}
                  <a
                    className="btn btn-sm btn-primary"
                    href={projectFileUrl(workspace.summary.slug, latestRender.relativePath, true)}
                    download
                  >
                    <Download size={12} /> 下载 MP4
                  </a>
                </div>
              </div>

              <video
                controls
                preload="metadata"
                style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 240 }}
                src={projectFileUrl(workspace.summary.slug, latestRender.relativePath)}
              />
            </div>
          ) : null}

          {/* All Rendered Outputs List */}
          {workspace.renders.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="field-label">历史渲染产物 (out/)</span>
              {workspace.renders.slice(1).map((r) => (
                <div
                  key={r.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 10px',
                    borderRadius: 7,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span className="mono" style={{ fontSize: 11.5 }}>{r.name}</span>
                  <a
                    className="btn btn-sm"
                    href={projectFileUrl(workspace.summary.slug, r.relativePath, true)}
                    download
                  >
                    <Download size={11} /> {(r.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </a>
                </div>
              ))}
            </div>
          ) : null}

          {/* Live Render Console Stream */}
          {renderLogs.length > 0 ? (
            <div>
              <span className="field-label">实时管线日志</span>
              <pre className="diff-pre" style={{ maxHeight: 150 }}>
                {renderLogs
                  .slice(-14)
                  .map(
                    (l) =>
                      `[${new Date(l.timestamp).toLocaleTimeString()}] [${Math.round(l.progress * 100)}%] ${l.message}`,
                  )
                  .join('\n')}
              </pre>
            </div>
          ) : null}
        </div>
      </section>

      {/* Right: Per-Project Git Snapshots & Single-File / Full Rollback */}
      <section className="panel-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <GitBranch size={15} style={{ color: 'var(--emerald)' }} />
            Git 时间戳快照 ({workspace.snapshots.length})
          </h2>
          <span className="chip mono">SNAPSHOTS.md</span>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Manual Snapshot Bar */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="输入本次改动备注（例如：优化第 3 镜缩放与字幕）..."
              value={snapNote}
              onChange={(e) => setSnapNote(e.target.value)}
            />
            <button
              id="btn-create-snapshot"
              type="button"
              className="btn btn-primary"
              disabled={busySnap}
              onClick={() => void handleCreateSnapshot()}
            >
              <Tag size={13} />
              打快照
            </button>
          </div>

          {/* Snapshot Timeline List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 230, overflowY: 'auto' }}>
            {workspace.snapshots.map((snap) => {
              const isSelected = selectedTag === snap.tag;
              return (
                <div
                  key={snap.tag}
                  style={{
                    padding: '9px 11px',
                    borderRadius: 9,
                    background: isSelected ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                  onClick={() => void handleInspectTag(snap.tag)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <History size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>
                        {snap.tag}
                      </span>
                      <span className="chip mono">{snap.commit}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {snap.message}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busySnap}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleRestore(snap.tag);
                    }}
                  >
                    <RotateCcw size={11} />
                    整库回退
                  </button>
                </div>
              );
            })}
          </div>

          {/* Diff & Single-File Precision Rollback Panel */}
          {selectedTag && diffData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="field-label" style={{ margin: 0 }}>
                  快照 <span className="mono">{selectedTag}</span> 单文件精准恢复：
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(() => {
                  const priority: Record<string, number> = {
                    'edit_plan.json': 0,
                    'script.txt': 1,
                    'build/audio_timeline.json': 2,
                    'build/subtitles.srt': 3,
                    'build/assets_manifest.json': 4,
                    'project.json': 5,
                  };
                  return diffData.files
                    .filter((f) => f !== 'SNAPSHOTS.md' && f !== '.gitignore')
                    .slice()
                    .sort((a, b) => (priority[a] ?? 100) - (priority[b] ?? 100) || a.localeCompare(b))
                    .slice(0, 12)
                    .map((file) => (
                      <button
                        key={file}
                        type="button"
                        className={`btn btn-sm ${file === 'edit_plan.json' || file === 'script.txt' ? 'btn-cyan' : ''}`}
                        disabled={busySnap}
                        onClick={() => void handleRestore(selectedTag, file)}
                      >
                        <FileCode2 size={11} />
                        恢复 {file}
                      </button>
                    ));
                })()}
              </div>

              <div>
                <span className="field-label">与当前工作区差异 (git diff {selectedTag})</span>
                <pre className="diff-pre">
                  {diffData.patch || '当前工作区与该快照完全一致，无未提交差异。'}
                </pre>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              点击任意历史快照，即可查看与当前工作区的 Git Diff 并执行单文件精准回退。
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
