import React, { useCallback, useEffect, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';
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
import {
  Button,
  CodeEditor,
  FieldLabel,
  NumberScrubInput,
  ResizeHandle,
  StudioInput,
  StudioSwitch,
  cn,
} from './ui';

interface RenderSnapshotsViewProps {
  lang: UiLang;
  uiTheme: 'dark' | 'light';
  workspace: ProjectWorkspaceDto;
  renderLogs: ProgressEventDto[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
}

export const RenderSnapshotsView: React.FC<RenderSnapshotsViewProps> = ({
  lang,
  uiTheme,
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

  const isZh = lang === 'zh-CN';

  const handleInspectTag = useCallback(
    async (tag: string, silent = false) => {
      setSelectedTag(tag);
      try {
        const diff = await apiRequest<{ stat: string; patch: string; files: string[] }>(
          `/api/projects/${encodeURIComponent(workspace.summary.slug)}/snapshots/${encodeURIComponent(tag)}/diff`,
        );
        setDiffData(diff);
      } catch (err) {
        if (!silent) {
          onNotify(err instanceof Error ? err.message : String(err), 'error');
        }
      }
    },
    [workspace.summary.slug, onNotify],
  );

  // Automatically load the latest snapshot diff when opening view or switching projects
  useEffect(() => {
    const firstTag = workspace.snapshots[0]?.tag || null;
    if (firstTag) {
      void handleInspectTag(firstTag, true);
    } else {
      setSelectedTag(null);
      setDiffData(null);
    }
  }, [workspace.summary.slug, workspace.snapshots[0]?.tag, handleInspectTag]);

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
      await handleInspectTag(res.snapshot.tag, true);
      onNotify(`✔ 已打时间戳快照: ${res.snapshot.tag}`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusySnap(false);
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
    <div className="flex-1 min-h-0 w-full flex overflow-hidden bg-canvas">
      <Group orientation="horizontal" className="flex-1 min-h-0">
        {/* Left: H.264 MP4 Renderer */}
        <Panel defaultSize="50%" minSize="36%">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Clapperboard size={14} className="text-text-muted shrink-0" />
                <span className="text-[12.5px] font-semibold text-text-primary truncate">
                  {isZh ? 'H.264 成片渲染导出 (Remotion)' : 'H.264 MP4 Renderer (Remotion)'}
                </span>
              </div>

              <Button
                id="btn-render-mp4"
                size="xs"
                variant="primary"
                disabled={rendering}
                onClick={() => void handleRender()}
              >
                {rendering ? <RefreshCw size={12} className="spin-icon" /> : <Clapperboard size={12} />}
                <span>
                  {rendering ? (isZh ? '渲染中...' : 'Rendering...') : t(lang, 'renderNow')}
                </span>
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 flex flex-col gap-4">
              {/* Preset Selector Cards (1px Satin Gold Active State) */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPreset('production');
                    setCrf(18);
                  }}
                  className={cn(
                    'text-left px-3.5 py-2.5 rounded-[8px] border transition-colors cursor-pointer',
                    preset === 'production'
                      ? 'border-accent bg-accent-soft/70 text-text-primary'
                      : 'border-border-subtle bg-elevated/50 text-text-secondary hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-text-primary">
                      {isZh ? '成品交付模式 (Production)' : 'Production Delivery'}
                    </span>
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        preset === 'production' ? 'bg-accent' : 'bg-border-strong',
                      )}
                    />
                  </div>
                  <div className="font-mono text-[11px] text-text-muted mt-1">
                    1920×1080 · 60fps · H.264 yuv420p
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreset('draft');
                    setCrf(24);
                  }}
                  className={cn(
                    'text-left px-3.5 py-2.5 rounded-[8px] border transition-colors cursor-pointer',
                    preset === 'draft'
                      ? 'border-accent bg-accent-soft/70 text-text-primary'
                      : 'border-border-subtle bg-elevated/50 text-text-secondary hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-text-primary">
                      {isZh ? '快速草稿模式 (Draft)' : 'Fast Draft Preview'}
                    </span>
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        preset === 'draft' ? 'bg-accent' : 'bg-border-strong',
                      )}
                    />
                  </div>
                  <div className="font-mono text-[11px] text-text-muted mt-1">
                    1280×720 · 30fps · {isZh ? '极速审片验证' : 'Fast review'}
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
                <div>
                  <FieldLabel>
                    {isZh ? '自定义输出文件名（留空自动命名）' : 'Output Filename (Optional)'}
                  </FieldLabel>
                  <StudioInput
                    compact
                    mono
                    placeholder={`${workspace.summary.slug}-${preset === 'draft' ? 'draft-720p' : '1080p60'}.mp4`}
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel hint={isZh ? '越小越清' : 'Lower=HQ'}>
                    {isZh ? '画质 CRF' : 'CRF'}
                  </FieldLabel>
                  <NumberScrubInput
                    compact
                    prefix="CRF"
                    min={14}
                    max={30}
                    step={1}
                    value={crf}
                    onValueChange={(v) => setCrf(Math.round(v))}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 py-2 border-y border-border-subtle">
                <span className="text-[12px] text-text-secondary">
                  {isZh
                    ? '渲染导出前自动打 Git 时间戳快照（保障每次出片版本可精确溯源）'
                    : 'Auto-create Git timestamp snapshot before exporting MP4'}
                </span>
                <StudioSwitch checked={autoSnapshot} onCheckedChange={setAutoSnapshot} />
              </div>

              {/* Latest Rendered MP4 Player */}
              {latestRender ? (
                <div className="rounded-[8px] border border-border-subtle bg-elevated/45 p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary truncate">
                        <CheckCircle2 size={13} className="text-emerald shrink-0" />
                        <span className="truncate font-mono">{latestRender.name}</span>
                      </div>
                      <div className="font-mono text-[10.5px] text-text-muted mt-0.5 tabular-nums">
                        {(latestRender.sizeBytes / 1024 / 1024).toFixed(2)} MB ·{' '}
                        {new Date(latestRender.modifiedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {window.coodanceDesktop?.isDesktop ? (
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() =>
                            void window.coodanceDesktop?.revealPath(
                              `${workspace.summary.path}/${latestRender.relativePath}`,
                            )
                          }
                        >
                          <FolderOpen size={11} />
                          <span>{isZh ? '定位' : 'Reveal'}</span>
                        </Button>
                      ) : null}
                      <a
                        href={projectFileUrl(workspace.summary.slug, latestRender.relativePath, true)}
                        download
                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded-[5px] bg-primary text-primary-ink hover:bg-primary-hover text-[11px] font-semibold no-underline transition-colors"
                      >
                        <Download size={11} />
                        <span>{isZh ? '下载 MP4' : 'Download'}</span>
                      </a>
                    </div>
                  </div>

                  <video
                    controls
                    preload="metadata"
                    className="w-full rounded-[6px] bg-black border border-border-subtle max-h-[250px]"
                    src={projectFileUrl(workspace.summary.slug, latestRender.relativePath)}
                  />
                </div>
              ) : null}

              {/* Historical Renders */}
              {workspace.renders.length > 1 ? (
                <div className="flex flex-col gap-1.5">
                  <FieldLabel className="mb-0.5">
                    {isZh ? '历史渲染产物 (out/)' : 'Previous Renders (out/)'}
                  </FieldLabel>
                  <div className="border border-border-subtle rounded-[8px] overflow-hidden divide-y divide-border-subtle bg-elevated/40">
                    {workspace.renders.slice(1).map((r) => (
                      <div
                        key={r.name}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="font-mono text-[11.5px] text-text-secondary truncate">
                          {r.name}
                        </span>
                        <a
                          href={projectFileUrl(workspace.summary.slug, r.relativePath, true)}
                          download
                          className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] bg-elevated border border-border-subtle hover:bg-hover text-[11px] font-mono text-text-primary no-underline shrink-0"
                        >
                          <Download size={10} />
                          {(r.sizeBytes / 1024 / 1024).toFixed(1)} MB
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Live Render Logs */}
              {renderLogs.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <FieldLabel className="mb-0">{isZh ? '实时管线日志' : 'Pipeline Logs'}</FieldLabel>
                  <pre className="m-0 p-2.5 rounded-[6px] bg-code border border-border-subtle font-mono text-[11px] leading-relaxed text-text-secondary overflow-auto max-h-[140px]">
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
        </Panel>

        <ResizeHandle />

        {/* Right: Git Snapshots + CodeMirror 6 Diff View */}
        <Panel minSize="36%">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch size={14} className="text-text-muted shrink-0" />
                <span className="text-[12.5px] font-semibold text-text-primary">
                  {isZh ? 'Git 时间戳快照' : 'Git Snapshots'}
                </span>
                <span className="font-mono text-[11px] text-text-muted">
                  ({workspace.snapshots.length})
                </span>
              </div>
              <span className="font-mono text-[10.5px] text-text-muted px-1.5 py-0.5 rounded-[4px] bg-elevated border border-border-subtle">
                SNAPSHOTS.md
              </span>
            </div>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 py-3.5 gap-3">
              {/* Manual Snapshot Bar */}
              <div className="flex gap-2 shrink-0">
                <StudioInput
                  compact
                  placeholder={
                    isZh
                      ? '输入本次改动备注（例如：优化第 3 镜缩放与字幕）...'
                      : 'Snapshot note (e.g. Refine scene 3 zoom & subtitles)...'
                  }
                  value={snapNote}
                  onChange={(e) => setSnapNote(e.target.value)}
                />
                <Button
                  id="btn-create-snapshot"
                  size="sm"
                  variant="primary"
                  disabled={busySnap}
                  onClick={() => void handleCreateSnapshot()}
                >
                  <Tag size={12} />
                  <span>{isZh ? '打快照' : 'Snapshot'}</span>
                </Button>
              </div>

              {/* Flat Snapshot List with 2px Satin Gold Active Indicator */}
              <div className="border border-border-subtle rounded-[8px] overflow-y-auto max-h-[208px] divide-y divide-border-subtle bg-elevated/35 shrink-0">
                {workspace.snapshots.map((snap) => {
                  const isSelected = selectedTag === snap.tag;
                  return (
                    <div
                      key={snap.tag}
                      onClick={() => void handleInspectTag(snap.tag)}
                      className={cn(
                        'relative px-3 py-2 flex items-center justify-between gap-2.5 cursor-pointer transition-colors',
                        isSelected ? 'bg-elevated' : 'hover:bg-hover/65',
                      )}
                    >
                      {isSelected ? (
                        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <History
                            size={11}
                            className={cn(
                              'shrink-0',
                              isSelected ? 'text-accent' : 'text-text-muted',
                            )}
                          />
                          <span className="font-mono text-[11.5px] font-semibold text-text-primary truncate">
                            {snap.tag}
                          </span>
                          <span className="font-mono text-[10px] text-text-muted px-1 py-px rounded-[3px] bg-canvas border border-border-subtle shrink-0">
                            {snap.commit}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-text-secondary truncate mt-0.5 pl-[19px]">
                          {snap.message}
                        </div>
                      </div>

                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busySnap}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRestore(snap.tag);
                        }}
                      >
                        <RotateCcw size={11} />
                        <span>{isZh ? '整库回退' : 'Restore'}</span>
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Diff & Single-File Precision Rollback */}
              {selectedTag && diffData ? (
                <div className="flex-1 min-h-0 flex flex-col gap-2.5 pt-2.5 border-t border-border-subtle overflow-hidden">
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <div className="flex items-center justify-between text-[11.5px] text-text-secondary">
                      <span>
                        {isZh ? '快照 ' : 'Snapshot '}
                        <code className="font-mono text-text-primary font-semibold">{selectedTag}</code>
                        {isZh ? ' 单文件精准恢复' : ' single-file restore'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
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
                          .sort(
                            (a, b) =>
                              (priority[a] ?? 100) - (priority[b] ?? 100) || a.localeCompare(b),
                          )
                          .slice(0, 10)
                          .map((file) => (
                            <Button
                              key={file}
                              size="xs"
                              variant="default"
                              disabled={busySnap}
                              onClick={() => void handleRestore(selectedTag, file)}
                              className="font-mono text-[10.5px]"
                            >
                              <FileCode2 size={10} className="text-text-muted" />
                              <span>{file}</span>
                            </Button>
                          ));
                      })()}
                    </div>
                  </div>

                  {/* CodeMirror 6 Diff Viewer */}
                  <div className="flex-1 min-h-[160px] flex flex-col gap-1 overflow-hidden">
                    <div className="flex items-center justify-between font-mono text-[11px] text-text-muted shrink-0">
                      <span>git diff {selectedTag}</span>
                      <span>
                        {diffData.patch
                          ? `${diffData.patch.split('\n').length} lines`
                          : isZh
                            ? '无差异'
                            : 'Clean'}
                      </span>
                    </div>
                    <div className="flex-1 min-h-0 rounded-[8px] border border-border-subtle overflow-hidden">
                      <CodeEditor
                        value={
                          diffData.patch ||
                          (isZh
                            ? '# 当前工作区与该快照完全一致，无未提交差异。'
                            : '# Working tree matches this snapshot cleanly.')
                        }
                        language="diff"
                        theme={uiTheme}
                        readOnly
                        lineNumbers
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-text-muted pt-2">
                  {isZh
                    ? '点击任意历史快照，即可查看与当前工作区的 Git Diff 并执行单文件精准回退。'
                    : 'Select any snapshot above to view Git diff and restore individual files.'}
                </div>
              )}
            </div>
          </section>
        </Panel>
      </Group>
    </div>
  );
};
