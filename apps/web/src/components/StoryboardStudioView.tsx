import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
  VideoComposition,
  resolveTimeline,
  formatTimecode,
  VIDEO_THEMES,
  type EditPlan,
  type SceneItem,
  type OverlayItem,
  type ChapterItem,
  type SfxEvent,
  type VideoThemeId,
  type ZoomRegion,
} from '@coodance/remotion';
import {
  Play,
  Pause,
  Save,
  Sparkles,
  Copy,
  Crop,
  Plus,
  Trash2,
  Code2,
  SlidersHorizontal,
  ExternalLink,
  Check,
  SkipBack,
} from 'lucide-react';
import { ProjectWorkspaceDto, apiRequest } from '../api';
import { UiLang, t } from '../i18n';

interface StoryboardStudioViewProps {
  lang: UiLang;
  workspace: ProjectWorkspaceDto;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
  pendingTrimPick?: { assetPath: string; trimStartSec: number } | null;
  onConsumedTrimPick?: () => void;
}

type SelectionTarget =
  | { kind: 'scene'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'chapter'; id: string }
  | { kind: 'sfx'; id: string }
  | null;

const SCENE_TYPE_LABELS: Record<SceneItem['type'], string> = {
  'title-card': '标题卡 Title',
  video: '录屏视频 Video',
  image: '图片展示 Image',
  'split-compare': '分屏对比 Split',
  'data-ui': '数据/终端 UI',
  'web-dom': '网页 DOM 演示',
};

const OVERLAY_TYPE_LABELS: Record<OverlayItem['type'], string> = {
  callout: '说明标注 Callout',
  badge: '悬浮徽章 Badge',
  'highlight-box': '高亮框 Box',
  arrow: '指示箭头 Arrow',
  lottie: 'Lottie 动效',
  logo: '品牌 Logo',
  'text-card': '文字卡片 Text',
};

export const StoryboardStudioView: React.FC<StoryboardStudioViewProps> = ({
  lang,
  workspace,
  onRefresh,
  onNotify,
  pendingTrimPick,
  onConsumedTrimPick,
}) => {
  const playerRef = useRef<PlayerRef>(null);
  const frameBoxRef = useRef<HTMLDivElement>(null);

  const [plan, setPlan] = useState<EditPlan | null>(workspace.editPlan);
  const [rawJson, setRawJson] = useState(workspace.editPlanRaw);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [inspectorTab, setInspectorTab] = useState<'form' | 'json'>('form');
  const [selection, setSelection] = useState<SelectionTarget>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Interactive Zoom Box Picker state
  const [zoomPickMode, setZoomPickMode] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragBox, setDragBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // AI / Studio actions
  const [busyAi, setBusyAi] = useState(false);
  const [copiedAgent, setCopiedAgent] = useState(false);

  useEffect(() => {
    setPlan(workspace.editPlan);
    setRawJson(workspace.editPlanRaw);
    setJsonError(null);
    setDirty(false);
    if (workspace.editPlan?.scenes?.length) {
      setSelection((prev) => prev || { kind: 'scene', id: workspace.editPlan!.scenes[0].id });
    }
  }, [workspace.summary.slug, workspace.editPlanRaw]);

  // Apply trimStartSec picked from AssetInspectorView thumbnails!
  useEffect(() => {
    if (!pendingTrimPick || !plan) return;
    const existingVideoScene = plan.scenes.find(
      (s) => s.type === 'video' && String(s.props.assetPath || '') === pendingTrimPick.assetPath,
    );
    if (existingVideoScene) {
      const updated: EditPlan = {
        ...plan,
        scenes: plan.scenes.map((sc) =>
          sc.id === existingVideoScene.id
            ? { ...sc, props: { ...sc.props, trimStartSec: pendingTrimPick.trimStartSec } }
            : sc,
        ),
      };
      commitLocalPlan(updated);
      setSelection({ kind: 'scene', id: existingVideoScene.id });
      seekToSec(existingVideoScene.startSec + 0.6);
      onNotify(
        `已更新分镜「${existingVideoScene.label}」裁剪起点 trimStartSec = ${pendingTrimPick.trimStartSec}s`,
        'success',
      );
    } else {
      const startSec = Number((currentFrame / (plan.videoMeta?.fps || 60)).toFixed(2));
      const newScene: SceneItem = {
        id: `scene-vid-${Date.now()}`,
        type: 'video',
        label: `录屏片段 · ${pendingTrimPick.assetPath.split('/').pop()}`,
        startSec,
        endSec: Number((startSec + 5).toFixed(2)),
        transition: 'fade',
        props: {
          assetPath: pendingTrimPick.assetPath,
          trimStartSec: pendingTrimPick.trimStartSec,
          playbackRate: 1,
          muted: true,
          showDeviceFrame: true,
          zoomRegion: { enabled: false, x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
        },
      };
      const updated: EditPlan = { ...plan, scenes: [...plan.scenes, newScene] };
      commitLocalPlan(updated);
      setSelection({ kind: 'scene', id: newScene.id });
      onNotify(`已新建视频分镜并设定 trimStartSec = ${pendingTrimPick.trimStartSec}s`, 'success');
    }
    onConsumedTrimPick?.();
  }, [pendingTrimPick]);

  const fps = plan?.videoMeta?.fps || 60;
  const resolved = useMemo(() => {
    if (!plan) return null;
    return resolveTimeline(plan, workspace.timeline, fps);
  }, [plan, workspace.timeline, fps]);

  // Listen to Remotion Player frame & play state
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [plan?.videoMeta?.fps, resolved?.durationInFrames]);

  const commitLocalPlan = (next: EditPlan) => {
    setPlan(next);
    setRawJson(JSON.stringify(next, null, 2));
    setJsonError(null);
    setDirty(true);
  };

  const seekToSec = (sec: number) => {
    const targetFrame = Math.max(0, Math.round(sec * fps));
    setCurrentFrame(targetFrame);
    playerRef.current?.seekTo(targetFrame);
  };

  const handleSavePlan = async (overridePlan?: EditPlan) => {
    const toSave = overridePlan || plan;
    if (!toSave) return;
    setSaving(true);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/edit-plan`, {
        method: 'PUT',
        body: JSON.stringify({ editPlan: toSave }),
      });
      setDirty(false);
      onNotify(lang === 'zh-CN' ? '已保存 edit_plan.json 到磁盘' : 'Saved edit_plan.json', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJson) as EditPlan;
      if (!Array.isArray(parsed.scenes)) {
        throw new Error('JSON must contain a `scenes` array.');
      }
      setPlan(parsed);
      setJsonError(null);
      setDirty(true);
      void handleSavePlan(parsed);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAiStoryboard = async () => {
    setBusyAi(true);
    try {
      const res = await apiRequest<{ editPlan: EditPlan; note: string }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/ai/storyboard`,
        {
          method: 'POST',
          body: JSON.stringify({ theme: plan?.theme || 'obsidian-studio' }),
        },
      );
      await onRefresh();
      onNotify(res.note, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyAi(false);
    }
  };

  const handleCopyAgentContext = async () => {
    try {
      const res = await apiRequest<{ prompt: string }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/ai/agent-context`,
      );
      await navigator.clipboard.writeText(res.prompt);
      setCopiedAgent(true);
      setTimeout(() => setCopiedAgent(false), 2200);
      onNotify(
        lang === 'zh-CN'
          ? '已复制完整项目上下文 Prompt，可直接粘贴到外部 AI 编程助手修改分镜'
          : 'Copied external AI Agent context prompt to clipboard',
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleSyncRemotionStudio = async () => {
    try {
      if (dirty && plan) {
        await handleSavePlan(plan);
      }
      const res = await apiRequest<{ studioUrl?: string }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/sync-studio`,
        {
          method: 'POST',
          body: JSON.stringify({ launch: false }),
        },
      );
      onNotify(
        res.studioUrl
          ? `已同步到 Remotion Studio: ${res.studioUrl}`
          : '✔ 已同步到 packages/remotion，可运行 npm run studio 打开官方逐帧调试器',
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  if (!plan || !resolved) {
    return (
      <div className="empty-stage">
        <div>edit_plan.json 未初始化或格式有误，可点击 AI 自动编排生成。</div>
        <button type="button" className="btn btn-primary" onClick={() => void handleAiStoryboard()}>
          <Sparkles size={14} />
          {t(lang, 'aiGenerate')}
        </button>
      </div>
    );
  }

  const currentSec = currentFrame / fps;
  const totalSec = resolved.totalDurationSec;
  const playheadPct = Math.min(100, Math.max(0, (currentSec / Math.max(0.01, totalSec)) * 100));

  const selectedScene =
    selection?.kind === 'scene' ? plan.scenes.find((s) => s.id === selection.id) || null : null;
  const selectedOverlay =
    selection?.kind === 'overlay' ? plan.overlays.find((o) => o.id === selection.id) || null : null;
  const selectedChapter =
    selection?.kind === 'chapter' ? plan.chapters.find((c) => c.id === selection.id) || null : null;
  const selectedSfx =
    selection?.kind === 'sfx' ? plan.sfxEvents.find((s) => s.id === selection.id) || null : null;

  const assets = workspace.manifest?.assets || [];
  const videoAssets = assets.filter((a) => a.kind === 'video');
  const imageAssets = assets.filter((a) => a.kind === 'image' || a.kind === 'logo');
  const audioAssets = assets.filter((a) => a.kind === 'audio');
  const lottieAssets = assets.filter((a) => a.kind === 'lottie');

  const updateScene = (id: string, patch: Partial<SceneItem>) => {
    commitLocalPlan({
      ...plan,
      scenes: plan.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
    });
  };

  const updateSceneProp = (id: string, key: string, value: unknown) => {
    commitLocalPlan({
      ...plan,
      scenes: plan.scenes.map((sc) =>
        sc.id === id ? { ...sc, props: { ...sc.props, [key]: value } } : sc,
      ),
    });
  };

  const updateOverlay = (id: string, patch: Partial<OverlayItem>) => {
    commitLocalPlan({
      ...plan,
      overlays: plan.overlays.map((ov) => (ov.id === id ? { ...ov, ...patch } : ov)),
    });
  };

  const updateChapter = (id: string, patch: Partial<ChapterItem>) => {
    commitLocalPlan({
      ...plan,
      chapters: plan.chapters.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch)),
    });
  };

  const updateSfx = (id: string, patch: Partial<SfxEvent>) => {
    commitLocalPlan({
      ...plan,
      sfxEvents: plan.sfxEvents.map((sx) => (sx.id === id ? { ...sx, ...patch } : sx)),
    });
  };

  const addScene = () => {
    const startSec = Number(currentSec.toFixed(2));
    const newScene: SceneItem = {
      id: `scene-${Date.now()}`,
      type: 'title-card',
      label: `新分镜 ${plan.scenes.length + 1}`,
      startSec,
      endSec: Number(Math.min(totalSec + 4, startSec + 4).toFixed(2)),
      transition: 'fade',
      props: {
        eyebrow: 'NEW SCENE',
        heading: '在这里输入镜头标题',
        subheading: '可在右侧切换录屏/图片/对比/数据UI/网页DOM 等 6 类组件',
      },
    };
    commitLocalPlan({ ...plan, scenes: [...plan.scenes, newScene] });
    setSelection({ kind: 'scene', id: newScene.id });
  };

  const addOverlay = () => {
    const startSec = Number(currentSec.toFixed(2));
    const newOv: OverlayItem = {
      id: `ov-${Date.now()}`,
      type: 'callout',
      label: `标注 ${plan.overlays.length + 1}`,
      startSec,
      endSec: Number(Math.min(totalSec, startSec + 3).toFixed(2)),
      x: 0.72,
      y: 0.25,
      text: '重点提示说明',
      subtext: '可在右侧修改坐标、颜色或切换 Lottie/Logo',
      color: '#f59e0b',
      animation: 'pop',
    };
    commitLocalPlan({ ...plan, overlays: [...plan.overlays, newOv] });
    setSelection({ kind: 'overlay', id: newOv.id });
  };

  const addSfx = () => {
    const firstSfx = audioAssets[0]?.relativePath || 'assets/sfx/pop.wav';
    const newSfx: SfxEvent = {
      id: `sfx-${Date.now()}`,
      name: `音效 ${plan.sfxEvents.length + 1}`,
      assetPath: firstSfx,
      timeSec: Number(currentSec.toFixed(2)),
      volume: 0.4,
    };
    commitLocalPlan({ ...plan, sfxEvents: [...plan.sfxEvents, newSfx] });
    setSelection({ kind: 'sfx', id: newSfx.id });
  };

  const addChapter = () => {
    const newCh: ChapterItem = {
      id: `ch-${Date.now()}`,
      title: `章节 ${plan.chapters.length + 1}`,
      startSec: Number(currentSec.toFixed(2)),
    };
    commitLocalPlan({ ...plan, chapters: [...plan.chapters, newCh] });
    setSelection({ kind: 'chapter', id: newCh.id });
  };

  // Interactive Zoom Box Picker Handlers on 16:9 Stage
  const handleZoomMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!frameBoxRef.current) return;
    const rect = frameBoxRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragStart({ x, y });
    setDragBox({ x, y, width: 0.05, height: 0.05 });
  };

  const handleZoomMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart || !frameBoxRef.current) return;
    const rect = frameBoxRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragBox({
      x: Math.min(dragStart.x, cx),
      y: Math.min(dragStart.y, cy),
      width: Math.max(0.08, Math.abs(cx - dragStart.x)),
      height: Math.max(0.08, Math.abs(cy - dragStart.y)),
    });
  };

  const handleZoomMouseUp = () => {
    if (dragBox && selectedScene && selectedScene.type === 'video') {
      const region: ZoomRegion = {
        enabled: true,
        x: Number(dragBox.x.toFixed(3)),
        y: Number(dragBox.y.toFixed(3)),
        width: Number(dragBox.width.toFixed(3)),
        height: Number(dragBox.height.toFixed(3)),
        startProgress: 0.2,
        endProgress: 0.82,
      };
      updateSceneProp(selectedScene.id, 'zoomRegion', region);
      onNotify(
        `已框选局部缩放区域 (${Math.round(region.x * 100)}%, ${Math.round(region.y * 100)}%, ${Math.round(region.width * 100)}%×${Math.round(region.height * 100)}%)`,
        'success',
      );
    }
    setDragStart(null);
    setZoomPickMode(false);
  };

  const handleLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToSec(ratio * totalSec);
  };

  const mediaBaseUrl = `/api/projects/${encodeURIComponent(workspace.summary.slug)}/files`;
  const existingZoom = selectedScene?.props?.zoomRegion as ZoomRegion | undefined;

  return (
    <div className="storyboard-layout">
      {/* Upper Area: 16:9 Live Preview Stage + Right Property/JSON Inspector */}
      <div className="storyboard-upper">
        {/* Center Stage */}
        <section className="player-stage-card">
          <div className="panel-header" style={{ padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="chip chip-accent mono">1920×1080 · {fps}fps</span>
              <select
                className="select"
                style={{ width: 152, height: 27, padding: '2px 8px', fontSize: 12 }}
                value={plan.theme}
                onChange={(e) => commitLocalPlan({ ...plan, theme: e.target.value as VideoThemeId })}
              >
                {Object.values(VIDEO_THEMES).map((th) => (
                  <option key={th.id} value={th.id}>
                    {lang === 'zh-CN' ? th.nameZh : th.nameEn}
                  </option>
                ))}
              </select>

              {selectedScene?.type === 'video' ? (
                <button
                  type="button"
                  className={`btn btn-sm ${zoomPickMode ? 'btn-primary' : 'btn-cyan'}`}
                  onClick={() => {
                    setZoomPickMode((v) => !v);
                    setDragBox(
                      existingZoom?.enabled
                        ? {
                            x: existingZoom.x,
                            y: existingZoom.y,
                            width: existingZoom.width,
                            height: existingZoom.height,
                          }
                        : null,
                    );
                  }}
                >
                  <Crop size={12} />
                  {zoomPickMode ? t(lang, 'exitZoomPicker') : t(lang, 'zoomPicker')}
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={busyAi}
                onClick={() => void handleAiStoryboard()}
              >
                <Sparkles size={12} />
                {busyAi ? '...' : t(lang, 'aiGenerate')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void handleCopyAgentContext()}
              >
                {copiedAgent ? <Check size={12} /> : <Copy size={12} />}
                {copiedAgent ? 'OK' : t(lang, 'copyAgentPrompt')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                title={t(lang, 'syncStudio')}
                onClick={() => void handleSyncRemotionStudio()}
              >
                <ExternalLink size={12} />
                Sync
              </button>
              <button
                id="btn-save-editplan"
                type="button"
                className={`btn btn-sm ${dirty ? 'btn-primary' : ''}`}
                disabled={saving || !dirty}
                onClick={() => void handleSavePlan()}
              >
                <Save size={12} />
                {saving ? '...' : dirty ? t(lang, 'save') : t(lang, 'saved')}
              </button>
            </div>
          </div>

          <div className="player-viewport">
            <div ref={frameBoxRef} className="player-frame-box">
              <Player
                ref={playerRef}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                component={VideoComposition as React.FC<any>}
                inputProps={{
                  projectSlug: workspace.summary.slug,
                  mediaBaseUrl,
                  editPlan: plan,
                  timeline: workspace.timeline,
                  isPlayerPreview: true,
                }}
                durationInFrames={resolved.durationInFrames}
                fps={fps}
                compositionWidth={1920}
                compositionHeight={1080}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                clickToPlay={!zoomPickMode}
                acknowledgeRemotionLicense
              />

              {zoomPickMode ? (
                <div
                  className="zoom-picker-overlay"
                  onMouseDown={handleZoomMouseDown}
                  onMouseMove={handleZoomMouseMove}
                  onMouseUp={handleZoomMouseUp}
                >
                  {dragBox ? (
                    <div
                      className="zoom-selection-box"
                      style={{
                        left: `${dragBox.x * 100}%`,
                        top: `${dragBox.y * 100}%`,
                        width: `${dragBox.width * 100}%`,
                        height: `${dragBox.height * 100}%`,
                      }}
                    >
                      <span className="zoom-selection-tag">
                        ZOOM {Math.round(dragBox.width * 100)}%×{Math.round(dragBox.height * 100)}%
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '6px 12px',
                        borderRadius: 8,
                        background: 'var(--accent)',
                        color: 'var(--accent-ink)',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      在画面上按住左键拖拽，框选需要自动放大的目标区域
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Right Inspector: Form Mode + Bidirectional edit_plan.json Raw Code Mode */}
        <section className="panel-card">
          <div className="panel-header" style={{ padding: '8px 12px' }}>
            <div className="segmented-pills">
              <button
                type="button"
                className={`segmented-pill ${inspectorTab === 'form' ? 'active' : ''}`}
                onClick={() => setInspectorTab('form')}
              >
                <SlidersHorizontal size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                {lang === 'zh-CN' ? '属性编排' : 'Inspector'}
              </button>
              <button
                type="button"
                className={`segmented-pill ${inspectorTab === 'json' ? 'active' : ''}`}
                onClick={() => setInspectorTab('json')}
              >
                <Code2 size={11} style={{ marginRight: 4, verticalAlign: '-1px' }} />
                edit_plan.json
              </button>
            </div>
          </div>

          {inspectorTab === 'json' ? (
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jsonError ? (
                <div
                  style={{
                    padding: '7px 10px',
                    borderRadius: 7,
                    background: 'var(--danger-soft)',
                    color: 'var(--danger)',
                    fontSize: 11.5,
                  }}
                >
                  JSON 语法错误: {jsonError}
                </div>
              ) : null}
              <textarea
                className="script-editor-area"
                style={{ flex: 1, minHeight: 220, fontSize: 11.5, lineHeight: 1.55 }}
                value={rawJson}
                spellCheck={false}
                onChange={(e) => setRawJson(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={handleApplyRawJson}>
                <Save size={12} />
                {lang === 'zh-CN' ? '应用并写回 edit_plan.json' : 'Apply & Save JSON'}
              </button>
            </div>
          ) : (
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Scene Inspector */}
              {selectedScene ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="chip chip-cyan">分镜 Scene · {selectedScene.id}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        commitLocalPlan({
                          ...plan,
                          scenes: plan.scenes.filter((s) => s.id !== selectedScene.id),
                        });
                        setSelection(null);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div>
                    <label className="field-label">分镜名称</label>
                    <input
                      className="input"
                      value={selectedScene.label}
                      onChange={(e) => updateScene(selectedScene.id, { label: e.target.value })}
                    />
                  </div>

                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">组件类型</label>
                      <select
                        className="select"
                        value={selectedScene.type}
                        onChange={(e) =>
                          updateScene(selectedScene.id, {
                            type: e.target.value as SceneItem['type'],
                          })
                        }
                      >
                        {Object.entries(SCENE_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">入场转场</label>
                      <select
                        className="select"
                        value={selectedScene.transition || 'fade'}
                        onChange={(e) =>
                          updateScene(selectedScene.id, {
                            transition: e.target.value as SceneItem['transition'],
                          })
                        }
                      >
                        <option value="none">无 None</option>
                        <option value="fade">淡入 Fade</option>
                        <option value="slide-left">左滑 Slide</option>
                        <option value="zoom-in">微推 Zoom</option>
                        <option value="wipe">擦除 Wipe</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">开始秒数 (startSec)</label>
                      <input
                        type="number"
                        step={0.1}
                        className="input mono"
                        value={selectedScene.startSec}
                        onChange={(e) =>
                          updateScene(selectedScene.id, { startSec: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">结束秒数 (endSec)</label>
                      <input
                        type="number"
                        step={0.1}
                        className="input mono"
                        value={selectedScene.endSec}
                        onChange={(e) =>
                          updateScene(selectedScene.id, { endSec: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>

                  {/* Quick align to spoken sentence from audio_timeline.json */}
                  {workspace.timeline?.sentences.length ? (
                    <div>
                      <label className="field-label">快速对齐到口播句子时间戳</label>
                      <select
                        className="select"
                        defaultValue=""
                        onChange={(e) => {
                          const sent = workspace.timeline?.sentences.find(
                            (s) => String(s.id) === e.target.value,
                          );
                          if (sent) {
                            updateScene(selectedScene.id, {
                              startSec: sent.startSec,
                              endSec: sent.endSec,
                              sentenceIds: [sent.id],
                            });
                            seekToSec(sent.startSec);
                          }
                        }}
                      >
                        <option value="">选择一句口播自动对齐起止时间...</option>
                        {workspace.timeline.sentences.map((s) => (
                          <option key={s.id} value={s.id}>
                            #{s.id + 1} [{s.startSec.toFixed(1)}s-{s.endSec.toFixed(1)}s]{' '}
                            {s.text.slice(0, 18)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {/* Type-specific properties */}
                  {selectedScene.type === 'title-card' ? (
                    <>
                      <div>
                        <label className="field-label">主标题 (heading)</label>
                        <input
                          className="input"
                          value={String(selectedScene.props.heading || '')}
                          onChange={(e) => updateSceneProp(selectedScene.id, 'heading', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">副标题 (subheading)</label>
                        <input
                          className="input"
                          value={String(selectedScene.props.subheading || '')}
                          onChange={(e) =>
                            updateSceneProp(selectedScene.id, 'subheading', e.target.value)
                          }
                        />
                      </div>
                      <div className="form-grid-2">
                        <div>
                          <label className="field-label">眉标 (eyebrow)</label>
                          <input
                            className="input mono"
                            value={String(selectedScene.props.eyebrow || '')}
                            onChange={(e) =>
                              updateSceneProp(selectedScene.id, 'eyebrow', e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <label className="field-label">右上徽标 (badge)</label>
                          <input
                            className="input mono"
                            value={String(selectedScene.props.badge || '')}
                            onChange={(e) =>
                              updateSceneProp(selectedScene.id, 'badge', e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : null}

                  {selectedScene.type === 'video' ? (
                    <>
                      <div>
                        <label className="field-label">视频素材 (assetPath)</label>
                        <select
                          className="select mono"
                          value={String(selectedScene.props.assetPath || '')}
                          onChange={(e) =>
                            updateSceneProp(selectedScene.id, 'assetPath', e.target.value)
                          }
                        >
                          <option value="">-- 选择视频素材 --</option>
                          {videoAssets.map((a) => (
                            <option key={a.id} value={a.relativePath}>
                              {a.relativePath}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-grid-2">
                        <div>
                          <label className="field-label">裁剪起点 (trimStartSec)</label>
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            className="input mono"
                            value={Number(selectedScene.props.trimStartSec) || 0}
                            onChange={(e) =>
                              updateSceneProp(
                                selectedScene.id,
                                'trimStartSec',
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>
                        <div>
                          <label className="field-label">倍速 (playbackRate)</label>
                          <input
                            type="number"
                            step={0.1}
                            min={0.25}
                            max={4}
                            className="input mono"
                            value={Number(selectedScene.props.playbackRate) || 1}
                            onChange={(e) =>
                              updateSceneProp(
                                selectedScene.id,
                                'playbackRate',
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">窗口标题说明 (caption)</label>
                        <input
                          className="input"
                          value={String(selectedScene.props.caption || '')}
                          onChange={(e) =>
                            updateSceneProp(selectedScene.id, 'caption', e.target.value)
                          }
                        />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(existingZoom?.enabled)}
                          onChange={(e) =>
                            updateSceneProp(selectedScene.id, 'zoomRegion', {
                              x: existingZoom?.x ?? 0.15,
                              y: existingZoom?.y ?? 0.15,
                              width: existingZoom?.width ?? 0.5,
                              height: existingZoom?.height ?? 0.5,
                              startProgress: existingZoom?.startProgress ?? 0.2,
                              endProgress: existingZoom?.endProgress ?? 0.82,
                              enabled: e.target.checked,
                            })
                          }
                        />
                        启用局部平滑缩放聚焦（可点击预览栏「框选局部缩放」拖拽设定）
                      </label>
                    </>
                  ) : null}

                  {selectedScene.type === 'image' ? (
                    <>
                      <div>
                        <label className="field-label">图片素材 (assetPath)</label>
                        <select
                          className="select mono"
                          value={String(selectedScene.props.assetPath || '')}
                          onChange={(e) =>
                            updateSceneProp(selectedScene.id, 'assetPath', e.target.value)
                          }
                        >
                          <option value="">-- 选择图片素材 --</option>
                          {imageAssets.map((a) => (
                            <option key={a.id} value={a.relativePath}>
                              {a.relativePath}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">运镜动效 (kenBurns)</label>
                        <select
                          className="select"
                          value={String(selectedScene.props.kenBurns || 'zoom-in')}
                          onChange={(e) =>
                            updateSceneProp(selectedScene.id, 'kenBurns', e.target.value)
                          }
                        >
                          <option value="none">静止 None</option>
                          <option value="zoom-in">缓推 Zoom In</option>
                          <option value="zoom-out">缓拉 Zoom Out</option>
                          <option value="pan-left">左移 Pan Left</option>
                          <option value="pan-right">右移 Pan Right</option>
                        </select>
                      </div>
                    </>
                  ) : null}

                  {selectedScene.type === 'data-ui' ||
                  selectedScene.type === 'web-dom' ||
                  selectedScene.type === 'split-compare' ? (
                    <>
                      <div>
                        <label className="field-label">场景标题 / 左栏标题</label>
                        <input
                          className="input"
                          value={String(
                            selectedScene.props.heading || selectedScene.props.leftTitle || '',
                          )}
                          onChange={(e) =>
                            updateSceneProp(
                              selectedScene.id,
                              selectedScene.type === 'split-compare' ? 'leftTitle' : 'heading',
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        提示：更多复杂结构字段（如指标卡片、终端命令行、对比要点）可切换到顶部「edit_plan.json」源码直接精细编辑并秒级预览。
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}

              {/* Overlay Inspector */}
              {selectedOverlay ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="chip chip-emerald">叠加标注 Overlay</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        commitLocalPlan({
                          ...plan,
                          overlays: plan.overlays.filter((o) => o.id !== selectedOverlay.id),
                        });
                        setSelection(null);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">标注类型</label>
                      <select
                        className="select"
                        value={selectedOverlay.type}
                        onChange={(e) =>
                          updateOverlay(selectedOverlay.id, {
                            type: e.target.value as OverlayItem['type'],
                          })
                        }
                      >
                        {Object.entries(OVERLAY_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">主题色</label>
                      <input
                        type="color"
                        className="input"
                        style={{ height: 33, padding: 3 }}
                        value={selectedOverlay.color || '#f59e0b'}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { color: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">开始秒数</label>
                      <input
                        type="number"
                        step={0.1}
                        className="input mono"
                        value={selectedOverlay.startSec}
                        onChange={(e) =>
                          updateOverlay(selectedOverlay.id, { startSec: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">结束秒数</label>
                      <input
                        type="number"
                        step={0.1}
                        className="input mono"
                        value={selectedOverlay.endSec}
                        onChange={(e) =>
                          updateOverlay(selectedOverlay.id, { endSec: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">X 坐标 ({Math.round(selectedOverlay.x * 100)}%)</label>
                      <input
                        type="range"
                        min={0.05}
                        max={0.95}
                        step={0.01}
                        value={selectedOverlay.x}
                        style={{ width: '100%', accentColor: 'var(--emerald)' }}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { x: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="field-label">Y 坐标 ({Math.round(selectedOverlay.y * 100)}%)</label>
                      <input
                        type="range"
                        min={0.05}
                        max={0.9}
                        step={0.01}
                        value={selectedOverlay.y}
                        style={{ width: '100%', accentColor: 'var(--emerald)' }}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { y: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  {selectedOverlay.type === 'lottie' || selectedOverlay.type === 'logo' ? (
                    <div>
                      <label className="field-label">资源路径 (assetPath)</label>
                      <select
                        className="select mono"
                        value={selectedOverlay.assetPath || ''}
                        onChange={(e) =>
                          updateOverlay(selectedOverlay.id, { assetPath: e.target.value })
                        }
                      >
                        <option value="">-- 选择素材 --</option>
                        {(selectedOverlay.type === 'lottie' ? lottieAssets : imageAssets).map((a) => (
                          <option key={a.id} value={a.relativePath}>
                            {a.relativePath}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="field-label">标注主文案 (text)</label>
                        <input
                          className="input"
                          value={selectedOverlay.text || ''}
                          onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="field-label">补充说明 (subtext)</label>
                        <input
                          className="input"
                          value={selectedOverlay.subtext || ''}
                          onChange={(e) =>
                            updateOverlay(selectedOverlay.id, { subtext: e.target.value })
                          }
                        />
                      </div>
                    </>
                  )}
                </>
              ) : null}

              {/* Chapter Inspector */}
              {selectedChapter ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="chip chip-accent">底部章节 Chapter</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        commitLocalPlan({
                          ...plan,
                          chapters: plan.chapters.filter((c) => c.id !== selectedChapter.id),
                        });
                        setSelection(null);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div>
                    <label className="field-label">章节标题</label>
                    <input
                      className="input"
                      value={selectedChapter.title}
                      onChange={(e) => updateChapter(selectedChapter.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">起始秒数 (startSec)</label>
                    <input
                      type="number"
                      step={0.1}
                      className="input mono"
                      value={selectedChapter.startSec}
                      onChange={(e) =>
                        updateChapter(selectedChapter.id, { startSec: Number(e.target.value) })
                      }
                    />
                  </div>
                </>
              ) : null}

              {/* SFX Inspector */}
              {selectedSfx ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="chip" style={{ color: 'var(--danger)' }}>
                      音效事件 SFX
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        commitLocalPlan({
                          ...plan,
                          sfxEvents: plan.sfxEvents.filter((s) => s.id !== selectedSfx.id),
                        });
                        setSelection(null);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div>
                    <label className="field-label">名称</label>
                    <input
                      className="input"
                      value={selectedSfx.name}
                      onChange={(e) => updateSfx(selectedSfx.id, { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">音效文件 (assetPath)</label>
                    <select
                      className="select mono"
                      value={selectedSfx.assetPath}
                      onChange={(e) => updateSfx(selectedSfx.id, { assetPath: e.target.value })}
                    >
                      {audioAssets.map((a) => (
                        <option key={a.id} value={a.relativePath}>
                          {a.relativePath}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-grid-2">
                    <div>
                      <label className="field-label">触发秒数 (timeSec)</label>
                      <input
                        type="number"
                        step={0.05}
                        className="input mono"
                        value={selectedSfx.timeSec}
                        onChange={(e) => updateSfx(selectedSfx.id, { timeSec: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="field-label">音量 ({Math.round((selectedSfx.volume ?? 0.45) * 100)}%)</label>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={selectedSfx.volume ?? 0.45}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                        onChange={(e) => updateSfx(selectedSfx.id, { volume: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {!selectedScene && !selectedOverlay && !selectedChapter && !selectedSfx ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 14 }}>
                  在下方多轨时间轴上点击任意分镜、标注、章节或音效块即可在此编辑属性。
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* Bottom Dock: Synchronized 5-Track Visual Timeline */}
      <section className="timeline-dock">
        <div className="timeline-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-icon"
              title="回到开头"
              onClick={() => seekToSec(0)}
            >
              <SkipBack size={13} />
            </button>
            <button
              id="btn-play-toggle"
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => playerRef.current?.toggle()}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
              {isPlaying ? (lang === 'zh-CN' ? '暂停' : 'Pause') : lang === 'zh-CN' ? '播放' : 'Play'}
            </button>
            <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatTimecode(currentSec)} <span style={{ color: 'var(--text-muted)' }}>/ {formatTimecode(totalSec)}</span>
            </span>
            <span className="chip mono">F{currentFrame}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="btn btn-sm" onClick={addChapter}>
              <Plus size={12} /> {lang === 'zh-CN' ? '章节' : 'Chapter'}
            </button>
            <button type="button" className="btn btn-sm btn-cyan" onClick={addScene}>
              <Plus size={12} /> {lang === 'zh-CN' ? '分镜' : 'Scene'}
            </button>
            <button type="button" className="btn btn-sm" onClick={addOverlay}>
              <Plus size={12} /> {lang === 'zh-CN' ? '标注' : 'Overlay'}
            </button>
            <button type="button" className="btn btn-sm" onClick={addSfx}>
              <Plus size={12} /> {lang === 'zh-CN' ? '音效' : 'SFX'}
            </button>
          </div>
        </div>

        <div className="timeline-tracks-wrap">
          {/* Track 1: Chapters */}
          <div className="timeline-track-row">
            <div className="track-label">{lang === 'zh-CN' ? '章节' : 'Chapters'}</div>
            <div className="track-lane" onClick={handleLaneClick}>
              {resolved.chapters.map((ch) => {
                const left = (ch.startSec / totalSec) * 100;
                const width = Math.max(2, (((ch.endSec || totalSec) - ch.startSec) / totalSec) * 100);
                const isSel = selection?.kind === 'chapter' && selection.id === ch.id;
                return (
                  <div
                    key={ch.id}
                    className={`track-block chapter ${isSel ? 'selected' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: 'chapter', id: ch.id });
                      seekToSec(Math.min(totalSec, ch.startSec + 0.8));
                    }}
                  >
                    {ch.title}
                  </div>
                );
              })}
              <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
            </div>
          </div>

          {/* Track 2: Scenes */}
          <div className="timeline-track-row">
            <div className="track-label">{lang === 'zh-CN' ? '分镜镜头' : 'Scenes'}</div>
            <div className="track-lane tall" onClick={handleLaneClick}>
              {plan.scenes.map((sc) => {
                const left = (sc.startSec / totalSec) * 100;
                const width = Math.max(2, ((sc.endSec - sc.startSec) / totalSec) * 100);
                const isSel = selection?.kind === 'scene' && selection.id === sc.id;
                const previewOffset = Math.min(1.4, Math.max(0.35, (sc.endSec - sc.startSec) * 0.28));
                return (
                  <div
                    key={sc.id}
                    className={`track-block scene ${isSel ? 'selected' : ''}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: 'scene', id: sc.id });
                      seekToSec(sc.startSec + previewOffset);
                    }}
                  >
                    <span style={{ opacity: 0.7, marginRight: 5, fontSize: 10 }}>[{sc.type}]</span>
                    {sc.label}
                  </div>
                );
              })}
              <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
            </div>
          </div>

          {/* Track 3: Overlays (packed into non-overlapping sub-rows) */}
          {(() => {
            const sortedOverlays = [...plan.overlays].sort(
              (a, b) => a.startSec - b.startSec || a.endSec - b.endSec,
            );
            const rowEndTimes: number[] = [];
            const placedOverlays = sortedOverlays.map((ov) => {
              let row = rowEndTimes.findIndex((endT) => ov.startSec >= endT - 0.05);
              if (row === -1) {
                row = rowEndTimes.length;
                rowEndTimes.push(ov.endSec);
              } else {
                rowEndTimes[row] = ov.endSec;
              }
              return { ov, row };
            });
            const rowCount = Math.max(1, rowEndTimes.length);
            const rowHeight = 22;
            const laneHeight = Math.max(28, rowCount * rowHeight + 6);

            return (
              <div className="timeline-track-row">
                <div className="track-label">{lang === 'zh-CN' ? '叠加标注' : 'Overlays'}</div>
                <div
                  className="track-lane"
                  style={{ height: laneHeight }}
                  onClick={handleLaneClick}
                >
                  {placedOverlays.map(({ ov, row }) => {
                    const left = (ov.startSec / totalSec) * 100;
                    const width = Math.max(2, ((ov.endSec - ov.startSec) / totalSec) * 100);
                    const isSel = selection?.kind === 'overlay' && selection.id === ov.id;
                    const ovOffset = Math.min(0.8, Math.max(0.25, (ov.endSec - ov.startSec) * 0.3));
                    return (
                      <div
                        key={ov.id}
                        className={`track-block overlay ${isSel ? 'selected' : ''}`}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          top: row * rowHeight + 3,
                          height: rowHeight - 3,
                          bottom: 'auto',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelection({ kind: 'overlay', id: ov.id });
                          seekToSec(ov.startSec + ovOffset);
                        }}
                      >
                        {ov.label}
                      </div>
                    );
                  })}
                  <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Track 4: SFX Events */}
          <div className="timeline-track-row">
            <div className="track-label">{lang === 'zh-CN' ? '音效 SFX' : 'SFX'}</div>
            <div className="track-lane" onClick={handleLaneClick}>
              {plan.sfxEvents.map((sx) => {
                const left = (sx.timeSec / totalSec) * 100;
                const isSel = selection?.kind === 'sfx' && selection.id === sx.id;
                return (
                  <div
                    key={sx.id}
                    className={`track-block sfx ${isSel ? 'selected' : ''}`}
                    style={{ left: `${left}%`, width: '5.5%' }}
                    title={`${sx.name} @ ${sx.timeSec}s`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: 'sfx', id: sx.id });
                      seekToSec(sx.timeSec);
                    }}
                  >
                    {sx.name}
                  </div>
                );
              })}
              <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
            </div>
          </div>

          {/* Track 5: Voiceover Waveform & Subtitles */}
          <div className="timeline-track-row" style={{ marginBottom: 0 }}>
            <div className="track-label">{lang === 'zh-CN' ? '配音波形' : 'Voice'}</div>
            <div className="track-lane" onClick={handleLaneClick}>
              {workspace.timeline?.waveformPeaks?.length ? (
                <div
                  style={{
                    position: 'absolute',
                    inset: '3px 4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    opacity: 0.65,
                    pointerEvents: 'none',
                  }}
                >
                  {workspace.timeline.waveformPeaks.slice(0, 140).map((pk, idx) => (
                    <span
                      key={idx}
                      style={{
                        flex: 1,
                        height: `${Math.max(10, Math.round(pk * 100))}%`,
                        background: 'var(--accent)',
                        borderRadius: 1,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
