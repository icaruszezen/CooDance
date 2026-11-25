import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';
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
  Wand2,
  Copy,
  Crop,
  Plus,
  Trash2,
  Code2,
  SlidersHorizontal,
  ExternalLink,
  Check,
  SkipBack,
  ShieldCheck,
  AlignLeft,
} from 'lucide-react';
import { EditPlanValidationResultDto, ProjectWorkspaceDto, apiRequest } from '../api';
import { UiLang, t } from '../i18n';
import {
  Button,
  CodeEditor,
  FieldLabel,
  NumberScrubInput,
  ResizeHandle,
  SegmentedTabs,
  StudioInput,
  StudioSelect,
  StudioSlider,
  StudioSwitch,
  StudioTooltip,
  cn,
} from './ui';

interface StoryboardStudioViewProps {
  lang: UiLang;
  uiTheme: 'dark' | 'light';
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

const SCENE_TYPE_OPTIONS: Array<{ value: SceneItem['type']; label: string; hint: string }> = [
  { value: 'title-card', label: '标题卡', hint: 'title-card' },
  { value: 'video', label: '录屏视频', hint: 'video' },
  { value: 'image', label: '图片展示', hint: 'image' },
  { value: 'split-compare', label: '分屏对比', hint: 'split-compare' },
  { value: 'data-ui', label: '数据/终端 UI', hint: 'data-ui' },
  { value: 'web-dom', label: '网页 DOM 演示', hint: 'web-dom' },
];

const TRANSITION_OPTIONS: Array<{ value: NonNullable<SceneItem['transition']>; label: string; hint: string }> = [
  { value: 'none', label: '无转场', hint: 'none' },
  { value: 'fade', label: '淡入', hint: 'fade' },
  { value: 'slide-left', label: '左滑', hint: 'slide-left' },
  { value: 'zoom-in', label: '微推', hint: 'zoom-in' },
  { value: 'wipe', label: '擦除', hint: 'wipe' },
];

const OVERLAY_TYPE_OPTIONS: Array<{ value: OverlayItem['type']; label: string; hint: string }> = [
  { value: 'callout', label: '说明标注', hint: 'callout' },
  { value: 'badge', label: '悬浮徽章', hint: 'badge' },
  { value: 'highlight-box', label: '高亮框', hint: 'highlight-box' },
  { value: 'arrow', label: '指示箭头', hint: 'arrow' },
  { value: 'lottie', label: 'Lottie 动效', hint: 'lottie' },
  { value: 'logo', label: '品牌 Logo', hint: 'logo' },
  { value: 'text-card', label: '文字卡片', hint: 'text-card' },
];

const KEN_BURNS_OPTIONS = [
  { value: 'none', label: '静止', hint: 'none' },
  { value: 'zoom-in', label: '缓推', hint: 'zoom-in' },
  { value: 'zoom-out', label: '缓拉', hint: 'zoom-out' },
  { value: 'pan-left', label: '左移', hint: 'pan-left' },
  { value: 'pan-right', label: '右移', hint: 'pan-right' },
];

export const StoryboardStudioView: React.FC<StoryboardStudioViewProps> = ({
  lang,
  uiTheme,
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

  const [busyAi, setBusyAi] = useState(false);
  const [copiedAgent, setCopiedAgent] = useState(false);
  const [alignSelectVal, setAlignSelectVal] = useState('');

  const isZh = lang === 'zh-CN';

  useEffect(() => {
    setPlan(workspace.editPlan);
    setRawJson(workspace.editPlanRaw);
    setJsonError(null);
    setDirty(false);
    if (workspace.editPlan?.scenes?.length) {
      setSelection((prev) => prev || { kind: 'scene', id: workspace.editPlan!.scenes[0].id });
    }
  }, [workspace.summary.slug, workspace.editPlanRaw]);

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
      onNotify(isZh ? '已保存 edit_plan.json 到磁盘' : 'Saved edit_plan.json', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFormatRawJson = () => {
    try {
      const parsed = JSON.parse(rawJson);
      setRawJson(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
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
        isZh
          ? '已复制完整项目上下文 Prompt，可直接粘贴到外部 AI 编程助手修改分镜'
          : 'Copied external AI Agent context prompt to clipboard',
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleValidatePlan = async () => {
    if (!plan) return;
    try {
      const res = await apiRequest<EditPlanValidationResultDto>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/edit-plan/validate`,
        {
          method: 'POST',
          body: JSON.stringify({ editPlan: plan }),
        },
      );
      if (res.valid) {
        onNotify(
          isZh
            ? `✔ 分镜校验通过（${res.summary.sceneCount} 镜 / ${res.summary.planDurationSec}s，${res.warnings.length} 条提示）`
            : `✔ EditPlan valid (${res.summary.sceneCount} scenes / ${res.summary.planDurationSec}s, ${res.warnings.length} warnings)`,
          'success',
        );
      } else {
        const first = res.errors[0];
        onNotify(
          isZh
            ? `✘ 分镜存在 ${res.errors.length} 处错误：${first?.message || ''}`
            : `✘ Validation failed (${res.errors.length} errors): ${first?.message || ''}`,
          'error',
        );
      }
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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-text-secondary">
        <div className="text-[13px]">
          {isZh ? 'edit_plan.json 未初始化或格式有误，可点击自动编排生成。' : 'edit_plan.json is missing or invalid.'}
        </div>
        <Button variant="primary" onClick={() => void handleAiStoryboard()}>
          <Wand2 size={13} />
          {t(lang, 'aiGenerate')}
        </Button>
      </div>
    );
  }

  const currentSec = currentFrame / fps;
  const totalSec = resolved.totalDurationSec;
  const playheadPct = Math.min(100, Math.max(0, (currentSec / Math.max(0.01, totalSec)) * 100));

  const rulerTicks = useMemo(() => {
    const count = 6;
    return Array.from({ length: count + 1 }, (_, i) => {
      const ratio = i / count;
      return {
        ratio,
        sec: ratio * totalSec,
        label: formatTimecode(ratio * totalSec),
      };
    });
  }, [totalSec]);

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
      color: '#d99b26',
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

  const themeOptions = Object.values(VIDEO_THEMES).map((th) => ({
    value: th.id,
    label: isZh ? th.nameZh : th.nameEn,
    hint: th.id === 'obsidian-studio' ? 'Dark' : th.id === 'ivory-editorial' ? 'Light' : 'Pine',
  }));

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden bg-canvas">
      <Group orientation="vertical" className="flex-1 min-h-0">
        {/* Upper Region: Preview Canvas + Right Inspector */}
        <Panel minSize="42%">
          <Group orientation="horizontal" className="h-full w-full">
            {/* Center 16:9 Live Preview Stage */}
            <Panel minSize="42%">
              <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
                {/* Stage Toolbar */}
                <div className="flex items-center justify-between gap-2 px-3 h-10 border-b border-border-subtle shrink-0 bg-panel">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-text-muted px-1.5 py-0.5 rounded-[4px] bg-elevated border border-border-subtle shrink-0">
                      1920×1080 · {fps}fps
                    </span>

                    <div className="w-[152px] shrink-0">
                      <StudioSelect
                        compact
                        value={plan.theme}
                        onValueChange={(v) => commitLocalPlan({ ...plan, theme: v as VideoThemeId })}
                        options={themeOptions}
                      />
                    </div>

                    {selectedScene?.type === 'video' ? (
                      <Button
                        size="xs"
                        variant={zoomPickMode ? 'accent' : 'default'}
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
                        <Crop size={11} />
                        {zoomPickMode ? t(lang, 'exitZoomPicker') : t(lang, 'zoomPicker')}
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busyAi}
                      onClick={() => void handleAiStoryboard()}
                    >
                      <Wand2 size={12} />
                      <span>{busyAi ? '...' : t(lang, 'aiGenerate')}</span>
                    </Button>

                    <StudioTooltip content={t(lang, 'copyAgentPrompt')}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void handleCopyAgentContext()}
                      >
                        {copiedAgent ? <Check size={12} className="text-emerald" /> : <Copy size={12} />}
                        <span className="hidden 2xl:inline">
                          {copiedAgent ? 'OK' : t(lang, 'copyAgentPrompt')}
                        </span>
                      </Button>
                    </StudioTooltip>

                    <Button
                      id="btn-validate-editplan"
                      size="xs"
                      variant="ghost"
                      onClick={() => void handleValidatePlan()}
                    >
                      <ShieldCheck size={12} />
                      <span>{t(lang, 'validatePlan')}</span>
                    </Button>

                    <StudioTooltip content={t(lang, 'syncStudio')}>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void handleSyncRemotionStudio()}
                      >
                        <ExternalLink size={12} />
                        <span>Sync</span>
                      </Button>
                    </StudioTooltip>

                    <Button
                      id="btn-save-editplan"
                      size="xs"
                      variant={dirty ? 'primary' : 'default'}
                      disabled={saving || !dirty}
                      onClick={() => void handleSavePlan()}
                    >
                      <Save size={12} />
                      <span>{saving ? '...' : dirty ? t(lang, 'save') : t(lang, 'saved')}</span>
                    </Button>
                  </div>
                </div>

                {/* 16:9 Canvas Viewport */}
                <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-code relative overflow-hidden">
                  <div
                    ref={frameBoxRef}
                    className="relative w-full max-w-[880px] aspect-video max-h-full rounded-[6px] overflow-hidden border border-border-strong shadow-studio-lg bg-black"
                  >
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
                      numberOfSharedAudioTags={12}
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
                          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-[6px] bg-accent text-accent-ink font-semibold text-[11.5px] shadow-studio-md">
                            {isZh
                              ? '在画面上按住左键拖拽，框选需要自动放大的目标区域'
                              : 'Drag across canvas to define auto-zoom target area'}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </Panel>

            <ResizeHandle />

            {/* Right Inspector Panel (Form + CodeMirror 6 edit_plan.json) */}
            <Panel defaultSize="348px" minSize="280px" maxSize="540px">
              <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 h-10 border-b border-border-subtle shrink-0">
                  <SegmentedTabs
                    value={inspectorTab}
                    onValueChange={setInspectorTab}
                    size="xs"
                    items={[
                      {
                        value: 'form',
                        label: (
                          <>
                            <SlidersHorizontal size={11} />
                            <span>{isZh ? '属性编排' : 'Inspector'}</span>
                          </>
                        ),
                      },
                      {
                        value: 'json',
                        label: (
                          <>
                            <Code2 size={11} />
                            <span>edit_plan.json</span>
                          </>
                        ),
                      },
                    ]}
                  />

                  {inspectorTab === 'json' ? (
                    <div className="flex items-center gap-1">
                      <StudioTooltip content={isZh ? '格式化 JSON' : 'Format JSON'}>
                        <Button size="xs" variant="ghost" onClick={handleFormatRawJson}>
                          <AlignLeft size={12} />
                        </Button>
                      </StudioTooltip>
                      <Button size="xs" variant="primary" onClick={handleApplyRawJson}>
                        <Save size={11} />
                        <span>{isZh ? '应用' : 'Apply'}</span>
                      </Button>
                    </div>
                  ) : null}
                </div>

                {inspectorTab === 'json' ? (
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {jsonError ? (
                      <div className="px-3 py-2 bg-danger-soft text-danger border-b border-danger/20 text-[11.5px] font-mono shrink-0">
                        JSON Error: {jsonError}
                      </div>
                    ) : null}
                    <div className="flex-1 min-h-0">
                      <CodeEditor
                        value={rawJson}
                        onChange={(v) => setRawJson(v)}
                        onSave={handleApplyRawJson}
                        language="json"
                        theme={uiTheme}
                        lineNumbers
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-3.5">
                    {/* Scene Inspector */}
                    {selectedScene ? (
                      <>
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan shrink-0" />
                            <span className="text-[11.5px] font-medium text-text-secondary">
                              {isZh ? '分镜 Scene' : 'Scene'}
                            </span>
                            <span className="font-mono text-[11px] text-text-muted truncate">
                              {selectedScene.id}
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-text-muted hover:text-danger hover:bg-danger-soft"
                            onClick={() => {
                              commitLocalPlan({
                                ...plan,
                                scenes: plan.scenes.filter((s) => s.id !== selectedScene.id),
                              });
                              setSelection(null);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>

                        <div>
                          <FieldLabel>{isZh ? '分镜名称' : 'Scene Label'}</FieldLabel>
                          <StudioInput
                            compact
                            value={selectedScene.label}
                            onChange={(e) => updateScene(selectedScene.id, { label: e.target.value })}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <FieldLabel>{isZh ? '组件类型' : 'Component'}</FieldLabel>
                            <StudioSelect
                              compact
                              value={selectedScene.type}
                              onValueChange={(v) =>
                                updateScene(selectedScene.id, { type: v as SceneItem['type'] })
                              }
                              options={SCENE_TYPE_OPTIONS}
                            />
                          </div>
                          <div>
                            <FieldLabel>{isZh ? '入场转场' : 'Transition'}</FieldLabel>
                            <StudioSelect
                              compact
                              value={selectedScene.transition || 'fade'}
                              onValueChange={(v) =>
                                updateScene(selectedScene.id, {
                                  transition: v as SceneItem['transition'],
                                })
                              }
                              options={TRANSITION_OPTIONS}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <FieldLabel>{isZh ? '开始秒数' : 'Start'}</FieldLabel>
                            <NumberScrubInput
                              compact
                              prefix="S"
                              suffix="s"
                              min={0}
                              step={0.1}
                              value={selectedScene.startSec}
                              onValueChange={(val) =>
                                updateScene(selectedScene.id, { startSec: Number(val.toFixed(3)) })
                              }
                            />
                          </div>
                          <div>
                            <FieldLabel>{isZh ? '结束秒数' : 'End'}</FieldLabel>
                            <NumberScrubInput
                              compact
                              prefix="E"
                              suffix="s"
                              min={0}
                              step={0.1}
                              value={selectedScene.endSec}
                              onValueChange={(val) =>
                                updateScene(selectedScene.id, { endSec: Number(val.toFixed(3)) })
                              }
                            />
                          </div>
                        </div>

                        {workspace.timeline?.sentences.length ? (
                          <div>
                            <FieldLabel>{isZh ? '快速对齐到口播句子时间戳' : 'Snap to Spoken Sentence'}</FieldLabel>
                            <StudioSelect
                              compact
                              value={alignSelectVal}
                              placeholder={isZh ? '选择一句口播自动对齐起止时间...' : 'Select spoken sentence...'}
                              onValueChange={(val) => {
                                setAlignSelectVal('');
                                const sent = workspace.timeline?.sentences.find(
                                  (s) => String(s.id) === val,
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
                              options={workspace.timeline.sentences.map((s) => ({
                                value: String(s.id),
                                label: `#${s.id + 1} ${s.text.slice(0, 18)}`,
                                hint: `${s.startSec.toFixed(1)}–${s.endSec.toFixed(1)}s`,
                              }))}
                            />
                          </div>
                        ) : null}

                        {/* Type-specific properties */}
                        {selectedScene.type === 'title-card' ? (
                          <div className="flex flex-col gap-3 pt-2 border-t border-border-subtle">
                            <div>
                              <FieldLabel hint="heading">{isZh ? '主标题' : 'Heading'}</FieldLabel>
                              <StudioInput
                                compact
                                value={String(selectedScene.props.heading || '')}
                                onChange={(e) =>
                                  updateSceneProp(selectedScene.id, 'heading', e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <FieldLabel hint="subheading">{isZh ? '副标题' : 'Subheading'}</FieldLabel>
                              <StudioInput
                                compact
                                value={String(selectedScene.props.subheading || '')}
                                onChange={(e) =>
                                  updateSceneProp(selectedScene.id, 'subheading', e.target.value)
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <FieldLabel hint="eyebrow">{isZh ? '眉标' : 'Eyebrow'}</FieldLabel>
                                <StudioInput
                                  compact
                                  mono
                                  value={String(selectedScene.props.eyebrow || '')}
                                  onChange={(e) =>
                                    updateSceneProp(selectedScene.id, 'eyebrow', e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <FieldLabel hint="badge">{isZh ? '右上徽标' : 'Badge'}</FieldLabel>
                                <StudioInput
                                  compact
                                  mono
                                  value={String(selectedScene.props.badge || '')}
                                  onChange={(e) =>
                                    updateSceneProp(selectedScene.id, 'badge', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedScene.type === 'video' ? (
                          <div className="flex flex-col gap-3 pt-2 border-t border-border-subtle">
                            <div>
                              <FieldLabel hint="assetPath">{isZh ? '视频素材' : 'Video Asset'}</FieldLabel>
                              <StudioSelect
                                compact
                                mono
                                value={String(selectedScene.props.assetPath || '')}
                                placeholder={isZh ? '选择视频素材...' : 'Select video...'}
                                onValueChange={(v) =>
                                  updateSceneProp(selectedScene.id, 'assetPath', v)
                                }
                                options={videoAssets.map((a) => ({
                                  value: a.relativePath,
                                  label: a.name,
                                  hint: a.durationSec ? `${a.durationSec.toFixed(1)}s` : undefined,
                                }))}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              <div>
                                <FieldLabel>{isZh ? '裁剪起点' : 'Trim Start'}</FieldLabel>
                                <NumberScrubInput
                                  compact
                                  prefix="T"
                                  suffix="s"
                                  min={0}
                                  step={0.1}
                                  value={Number(selectedScene.props.trimStartSec) || 0}
                                  onValueChange={(v) =>
                                    updateSceneProp(selectedScene.id, 'trimStartSec', Number(v.toFixed(2)))
                                  }
                                />
                              </div>
                              <div>
                                <FieldLabel>{isZh ? '播放倍速' : 'Speed'}</FieldLabel>
                                <NumberScrubInput
                                  compact
                                  prefix="×"
                                  min={0.25}
                                  max={4}
                                  step={0.05}
                                  value={Number(selectedScene.props.playbackRate) || 1}
                                  onValueChange={(v) =>
                                    updateSceneProp(selectedScene.id, 'playbackRate', Number(v.toFixed(2)))
                                  }
                                />
                              </div>
                            </div>
                            <div>
                              <FieldLabel hint="caption">{isZh ? '窗口标题说明' : 'Caption'}</FieldLabel>
                              <StudioInput
                                compact
                                value={String(selectedScene.props.caption || '')}
                                onChange={(e) =>
                                  updateSceneProp(selectedScene.id, 'caption', e.target.value)
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3 py-2 border-t border-border-subtle">
                              <div className="text-[12px] text-text-secondary leading-snug">
                                {isZh ? '启用局部平滑缩放聚焦' : 'Enable Auto Zoom Region'}
                              </div>
                              <StudioSwitch
                                checked={Boolean(existingZoom?.enabled)}
                                onCheckedChange={(checked) =>
                                  updateSceneProp(selectedScene.id, 'zoomRegion', {
                                    x: existingZoom?.x ?? 0.15,
                                    y: existingZoom?.y ?? 0.15,
                                    width: existingZoom?.width ?? 0.5,
                                    height: existingZoom?.height ?? 0.5,
                                    startProgress: existingZoom?.startProgress ?? 0.2,
                                    endProgress: existingZoom?.endProgress ?? 0.82,
                                    enabled: checked,
                                  })
                                }
                              />
                            </div>
                          </div>
                        ) : null}

                        {selectedScene.type === 'image' ? (
                          <div className="flex flex-col gap-3 pt-2 border-t border-border-subtle">
                            <div>
                              <FieldLabel hint="assetPath">{isZh ? '图片素材' : 'Image Asset'}</FieldLabel>
                              <StudioSelect
                                compact
                                mono
                                value={String(selectedScene.props.assetPath || '')}
                                placeholder={isZh ? '选择图片素材...' : 'Select image...'}
                                onValueChange={(v) =>
                                  updateSceneProp(selectedScene.id, 'assetPath', v)
                                }
                                options={imageAssets.map((a) => ({
                                  value: a.relativePath,
                                  label: a.name,
                                }))}
                              />
                            </div>
                            <div>
                              <FieldLabel hint="kenBurns">{isZh ? '运镜动效' : 'Ken Burns'}</FieldLabel>
                              <StudioSelect
                                compact
                                value={String(selectedScene.props.kenBurns || 'zoom-in')}
                                onValueChange={(v) =>
                                  updateSceneProp(selectedScene.id, 'kenBurns', v)
                                }
                                options={KEN_BURNS_OPTIONS}
                              />
                            </div>
                          </div>
                        ) : null}

                        {selectedScene.type === 'data-ui' ||
                        selectedScene.type === 'web-dom' ||
                        selectedScene.type === 'split-compare' ? (
                          <div className="flex flex-col gap-2.5 pt-2 border-t border-border-subtle">
                            <div>
                              <FieldLabel>{isZh ? '场景标题 / 左栏标题' : 'Heading / Left Title'}</FieldLabel>
                              <StudioInput
                                compact
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
                            <p className="m-0 text-[11.5px] leading-relaxed text-text-muted">
                              {isZh
                                ? '提示：指标数组、终端命令行、分屏要点等结构化字段可切换到「edit_plan.json」源码直接精细编辑并秒级预览。'
                                : 'Tip: Edit complex arrays (metrics, terminal lines, comparison points) directly in edit_plan.json.'}
                            </p>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {/* Overlay Inspector */}
                    {selectedOverlay ? (
                      <>
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald shrink-0" />
                            <span className="text-[11.5px] font-medium text-text-secondary">
                              {isZh ? '叠加标注 Overlay' : 'Overlay'}
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-text-muted hover:text-danger hover:bg-danger-soft"
                            onClick={() => {
                              commitLocalPlan({
                                ...plan,
                                overlays: plan.overlays.filter((o) => o.id !== selectedOverlay.id),
                              });
                              setSelection(null);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <FieldLabel>{isZh ? '标注类型' : 'Type'}</FieldLabel>
                            <StudioSelect
                              compact
                              value={selectedOverlay.type}
                              onValueChange={(v) =>
                                updateOverlay(selectedOverlay.id, { type: v as OverlayItem['type'] })
                              }
                              options={OVERLAY_TYPE_OPTIONS}
                            />
                          </div>
                          <div>
                            <FieldLabel>{isZh ? '主题色' : 'Color'}</FieldLabel>
                            <div className="flex items-center gap-1.5 h-7 px-2 rounded-[6px] bg-input border border-border-subtle">
                              <input
                                type="color"
                                value={selectedOverlay.color || '#d99b26'}
                                onChange={(e) =>
                                  updateOverlay(selectedOverlay.id, { color: e.target.value })
                                }
                                className="w-4 h-4 rounded-[3px] border-0 bg-transparent cursor-pointer p-0"
                              />
                              <span className="font-mono text-[11px] text-text-secondary uppercase">
                                {selectedOverlay.color || '#d99b26'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <FieldLabel>{isZh ? '开始秒数' : 'Start'}</FieldLabel>
                            <NumberScrubInput
                              compact
                              prefix="S"
                              suffix="s"
                              min={0}
                              step={0.1}
                              value={selectedOverlay.startSec}
                              onValueChange={(v) =>
                                updateOverlay(selectedOverlay.id, { startSec: Number(v.toFixed(2)) })
                              }
                            />
                          </div>
                          <div>
                            <FieldLabel>{isZh ? '结束秒数' : 'End'}</FieldLabel>
                            <NumberScrubInput
                              compact
                              prefix="E"
                              suffix="s"
                              min={0}
                              step={0.1}
                              value={selectedOverlay.endSec}
                              onValueChange={(v) =>
                                updateOverlay(selectedOverlay.id, { endSec: Number(v.toFixed(2)) })
                              }
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <FieldLabel hint={`${Math.round(selectedOverlay.x * 100)}%`}>
                              X 坐标
                            </FieldLabel>
                            <StudioSlider
                              min={0.05}
                              max={0.95}
                              step={0.01}
                              value={selectedOverlay.x}
                              onValueChange={(v) =>
                                updateOverlay(selectedOverlay.id, { x: Number(v.toFixed(2)) })
                              }
                            />
                          </div>
                          <div>
                            <FieldLabel hint={`${Math.round(selectedOverlay.y * 100)}%`}>
                              Y 坐标
                            </FieldLabel>
                            <StudioSlider
                              min={0.05}
                              max={0.9}
                              step={0.01}
                              value={selectedOverlay.y}
                              onValueChange={(v) =>
                                updateOverlay(selectedOverlay.id, { y: Number(v.toFixed(2)) })
                              }
                            />
                          </div>
                        </div>

                        {selectedOverlay.type === 'lottie' || selectedOverlay.type === 'logo' ? (
                          <div>
                            <FieldLabel hint="assetPath">{isZh ? '资源路径' : 'Asset Path'}</FieldLabel>
                            <StudioSelect
                              compact
                              mono
                              value={selectedOverlay.assetPath || ''}
                              placeholder={isZh ? '选择素材...' : 'Select asset...'}
                              onValueChange={(v) =>
                                updateOverlay(selectedOverlay.id, { assetPath: v })
                              }
                              options={(selectedOverlay.type === 'lottie' ? lottieAssets : imageAssets).map(
                                (a) => ({
                                  value: a.relativePath,
                                  label: a.name,
                                }),
                              )}
                            />
                          </div>
                        ) : (
                          <>
                            <div>
                              <FieldLabel hint="text">{isZh ? '标注主文案' : 'Text'}</FieldLabel>
                              <StudioInput
                                compact
                                value={selectedOverlay.text || ''}
                                onChange={(e) =>
                                  updateOverlay(selectedOverlay.id, { text: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <FieldLabel hint="subtext">{isZh ? '补充说明' : 'Subtext'}</FieldLabel>
                              <StudioInput
                                compact
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
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                            <span className="text-[11.5px] font-medium text-text-secondary">
                              {isZh ? '底部章节 Chapter' : 'Chapter'}
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-text-muted hover:text-danger hover:bg-danger-soft"
                            onClick={() => {
                              commitLocalPlan({
                                ...plan,
                                chapters: plan.chapters.filter((c) => c.id !== selectedChapter.id),
                              });
                              setSelection(null);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                        <div>
                          <FieldLabel>{isZh ? '章节标题' : 'Chapter Title'}</FieldLabel>
                          <StudioInput
                            compact
                            value={selectedChapter.title}
                            onChange={(e) =>
                              updateChapter(selectedChapter.id, { title: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <FieldLabel>{isZh ? '起始秒数' : 'Start Sec'}</FieldLabel>
                          <NumberScrubInput
                            compact
                            prefix="S"
                            suffix="s"
                            min={0}
                            step={0.1}
                            value={selectedChapter.startSec}
                            onValueChange={(v) =>
                              updateChapter(selectedChapter.id, { startSec: Number(v.toFixed(2)) })
                            }
                          />
                        </div>
                      </>
                    ) : null}

                    {/* SFX Inspector */}
                    {selectedSfx ? (
                      <>
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border-subtle">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
                            <span className="text-[11.5px] font-medium text-text-secondary">
                              {isZh ? '音效事件 SFX' : 'SFX Event'}
                            </span>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-text-muted hover:text-danger hover:bg-danger-soft"
                            onClick={() => {
                              commitLocalPlan({
                                ...plan,
                                sfxEvents: plan.sfxEvents.filter((s) => s.id !== selectedSfx.id),
                              });
                              setSelection(null);
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                        <div>
                          <FieldLabel>{isZh ? '名称' : 'Name'}</FieldLabel>
                          <StudioInput
                            compact
                            value={selectedSfx.name}
                            onChange={(e) => updateSfx(selectedSfx.id, { name: e.target.value })}
                          />
                        </div>
                        <div>
                          <FieldLabel hint="assetPath">{isZh ? '音效文件' : 'Audio File'}</FieldLabel>
                          <StudioSelect
                            compact
                            mono
                            value={selectedSfx.assetPath}
                            onValueChange={(v) => updateSfx(selectedSfx.id, { assetPath: v })}
                            options={audioAssets.map((a) => ({
                              value: a.relativePath,
                              label: a.name,
                            }))}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <FieldLabel>{isZh ? '触发秒数' : 'Time'}</FieldLabel>
                            <NumberScrubInput
                              compact
                              prefix="T"
                              suffix="s"
                              min={0}
                              step={0.05}
                              value={selectedSfx.timeSec}
                              onValueChange={(v) =>
                                updateSfx(selectedSfx.id, { timeSec: Number(v.toFixed(2)) })
                              }
                            />
                          </div>
                          <div>
                            <FieldLabel hint={`${Math.round((selectedSfx.volume ?? 0.45) * 100)}%`}>
                              {isZh ? '音量' : 'Volume'}
                            </FieldLabel>
                            <StudioSlider
                              min={0.05}
                              max={1}
                              step={0.05}
                              value={selectedSfx.volume ?? 0.45}
                              onValueChange={(v) =>
                                updateSfx(selectedSfx.id, { volume: Number(v.toFixed(2)) })
                              }
                            />
                          </div>
                        </div>
                      </>
                    ) : null}

                    {!selectedScene && !selectedOverlay && !selectedChapter && !selectedSfx ? (
                      <div className="text-[12px] text-text-muted pt-4 text-center">
                        {isZh
                          ? '点击下方时间轴任意分镜、标注、章节或音效块以编辑属性。'
                          : 'Select any block on the timeline below to inspect its properties.'}
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            </Panel>
          </Group>
        </Panel>

        <ResizeHandle />

        {/* Bottom Dock: Synchronized 5-Track Visual Timeline with Ruler */}
        <Panel defaultSize="256px" minSize="176px" maxSize="420px">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            {/* Timeline Transport Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 h-9 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2">
                <StudioTooltip content={isZh ? '回到开头' : 'Jump to Start'} side="top">
                  <Button size="xs" variant="ghost" onClick={() => seekToSec(0)} className="px-1.5">
                    <SkipBack size={12} />
                  </Button>
                </StudioTooltip>

                <Button
                  id="btn-play-toggle"
                  size="xs"
                  variant="primary"
                  onClick={() => playerRef.current?.toggle()}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  <span>
                    {isPlaying ? (isZh ? '暂停' : 'Pause') : isZh ? '播放' : 'Play'}
                  </span>
                </Button>

                <span className="font-mono text-[12px] font-semibold tabular-nums text-text-primary ml-1">
                  {formatTimecode(currentSec)}
                  <span className="text-text-muted font-normal"> / {formatTimecode(totalSec)}</span>
                </span>

                <span className="font-mono text-[10.5px] text-text-muted px-1.5 py-0.5 rounded-[4px] bg-canvas border border-border-subtle tabular-nums">
                  F{currentFrame}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button size="xs" variant="ghost" onClick={addChapter}>
                  <Plus size={11} /> {isZh ? '章节' : 'Chapter'}
                </Button>
                <Button size="xs" variant="default" onClick={addScene}>
                  <Plus size={11} /> {isZh ? '分镜' : 'Scene'}
                </Button>
                <Button size="xs" variant="ghost" onClick={addOverlay}>
                  <Plus size={11} /> {isZh ? '标注' : 'Overlay'}
                </Button>
                <Button size="xs" variant="ghost" onClick={addSfx}>
                  <Plus size={11} /> {isZh ? '音效' : 'SFX'}
                </Button>
              </div>
            </div>

            {/* Ruler + 5 Tracks */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 select-none">
              {/* Time Ruler Row (00:00 left-aligned so it never collides with TIMELINE label) */}
              <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5 h-5 shrink-0">
                <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.08em] text-text-muted text-right pr-1">
                  TIMELINE
                </div>
                <div
                  className="relative h-full border-b border-border-subtle cursor-pointer"
                  onClick={handleLaneClick}
                >
                  {rulerTicks.map((tick, idx) => {
                    const isFirst = idx === 0;
                    const isLast = idx === rulerTicks.length - 1;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'absolute bottom-0 flex flex-col',
                          isFirst ? 'items-start' : isLast ? 'items-end' : 'items-center -translate-x-1/2',
                        )}
                        style={{
                          left: isLast ? undefined : `${tick.ratio * 100}%`,
                          right: isLast ? 0 : undefined,
                        }}
                      >
                        <span className="font-mono text-[9.5px] text-text-muted leading-none mb-0.5 tabular-nums">
                          {tick.label}
                        </span>
                        <span className="w-px h-1.5 bg-border-strong" />
                      </div>
                    );
                  })}

                  {/* Playhead Cap Marker */}
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-30"
                    style={{ left: `${playheadPct}%` }}
                  >
                    <div className="w-[7px] h-[7px] -translate-x-[3px] bg-accent rounded-[1px] rotate-45 translate-y-[2px]" />
                    <div className="absolute top-2 bottom-0 w-[1.5px] bg-accent" />
                  </div>
                </div>
              </div>

              {/* Track 1: Chapters */}
              <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5">
                <div className="text-[11px] font-medium text-text-muted text-right pr-1">
                  {isZh ? '章节' : 'Chapters'}
                </div>
                <div
                  className="relative h-[26px] rounded-[5px] bg-code border border-border-subtle overflow-hidden cursor-pointer"
                  onClick={handleLaneClick}
                >
                  {resolved.chapters.map((ch) => {
                    const left = (ch.startSec / totalSec) * 100;
                    const width = Math.max(2, (((ch.endSec || totalSec) - ch.startSec) / totalSec) * 100);
                    const isSel = selection?.kind === 'chapter' && selection.id === ch.id;
                    return (
                      <div
                        key={ch.id}
                        className={cn('track-block chapter', isSel && 'selected')}
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
              <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5">
                <div className="text-[11px] font-medium text-text-muted text-right pr-1">
                  {isZh ? '分镜镜头' : 'Scenes'}
                </div>
                <div
                  className="relative h-[34px] rounded-[5px] bg-code border border-border-subtle overflow-hidden cursor-pointer"
                  onClick={handleLaneClick}
                >
                  {plan.scenes.map((sc) => {
                    const left = (sc.startSec / totalSec) * 100;
                    const width = Math.max(2, ((sc.endSec - sc.startSec) / totalSec) * 100);
                    const isSel = selection?.kind === 'scene' && selection.id === sc.id;
                    const previewOffset = Math.min(1.4, Math.max(0.35, (sc.endSec - sc.startSec) * 0.28));
                    return (
                      <div
                        key={sc.id}
                        className={cn('track-block scene', isSel && 'selected')}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelection({ kind: 'scene', id: sc.id });
                          seekToSec(sc.startSec + previewOffset);
                        }}
                      >
                        <span className="font-mono text-[9.5px] opacity-65 mr-1.5">[{sc.type}]</span>
                        <span className="truncate">{sc.label}</span>
                      </div>
                    );
                  })}
                  <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
                </div>
              </div>

              {/* Track 3: Overlays (non-overlapping sub-rows) */}
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
                const laneHeight = Math.max(26, rowCount * rowHeight + 4);

                return (
                  <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5">
                    <div className="text-[11px] font-medium text-text-muted text-right pr-1">
                      {isZh ? '叠加标注' : 'Overlays'}
                    </div>
                    <div
                      className="relative rounded-[5px] bg-code border border-border-subtle overflow-hidden cursor-pointer"
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
                            className={cn('track-block overlay', isSel && 'selected')}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              top: row * rowHeight + 2,
                              height: rowHeight - 2,
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
              <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5">
                <div className="text-[11px] font-medium text-text-muted text-right pr-1">
                  {isZh ? '音效 SFX' : 'SFX'}
                </div>
                <div
                  className="relative h-[26px] rounded-[5px] bg-code border border-border-subtle overflow-hidden cursor-pointer"
                  onClick={handleLaneClick}
                >
                  {plan.sfxEvents.map((sx) => {
                    const left = (sx.timeSec / totalSec) * 100;
                    const isSel = selection?.kind === 'sfx' && selection.id === sx.id;
                    return (
                      <div
                        key={sx.id}
                        className={cn('track-block sfx', isSel && 'selected')}
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

              {/* Track 5: Voiceover Waveform */}
              <div className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2.5">
                <div className="text-[11px] font-medium text-text-muted text-right pr-1">
                  {isZh ? '配音波形' : 'Voice'}
                </div>
                <div
                  className="relative h-[28px] rounded-[5px] bg-code border border-border-subtle overflow-hidden cursor-pointer"
                  onClick={handleLaneClick}
                >
                  {workspace.timeline?.waveformPeaks?.length ? (
                    <div className="pointer-events-none absolute inset-[3px_4px] flex items-center gap-[1px]">
                      {workspace.timeline.waveformPeaks.slice(0, 140).map((pk, idx, arr) => {
                        const barRatio = idx / Math.max(1, arr.length);
                        const isPlayed = barRatio <= playheadPct / 100;
                        return (
                          <span
                            key={idx}
                            className={cn(
                              'flex-1 rounded-[1px]',
                              isPlayed ? 'bg-accent/85' : 'bg-text-muted/40',
                            )}
                            style={{ height: `${Math.max(10, Math.round(pk * 100))}%` }}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="playhead-line" style={{ left: `${playheadPct}%` }} />
                </div>
              </div>
            </div>
          </section>
        </Panel>
      </Group>
    </div>
  );
};
