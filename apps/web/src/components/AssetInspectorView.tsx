import React, { useEffect, useRef, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import {
  Upload,
  ScanSearch,
  Trash2,
  Image as ImageIcon,
  Film,
  Volume2,
  Search,
  Download,
  Play,
  Wand2,
  Layers,
} from 'lucide-react';
import {
  AssetManifestItemDto,
  ProjectWorkspaceDto,
  apiRequest,
  projectFileUrl,
} from '../api';
import { UiLang, t } from '../i18n';
import {
  Button,
  FieldLabel,
  ResizeHandle,
  SegmentedTabs,
  StudioInput,
  cn,
} from './ui';

interface AssetInspectorViewProps {
  lang: UiLang;
  workspace: ProjectWorkspaceDto;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
  onPickVideoTrim: (assetPath: string, trimStartSec: number) => void;
}

interface LogoEntry {
  id: string;
  name: string;
  slug: string;
  source: 'simple-icons' | 'lobehub';
  hex?: string;
}

interface LottiePreset {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface SfxPreset {
  id: string;
  name: string;
  durationSec: number;
  description: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const AssetInspectorView: React.FC<AssetInspectorViewProps> = ({
  lang,
  workspace,
  onRefresh,
  onNotify,
  onPickVideoTrim,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [kindFilter, setKindFilter] = useState<string>('all');

  const [toolTab, setToolTab] = useState<'logo' | 'lottie' | 'sfx'>('logo');
  const [logoQuery, setLogoQuery] = useState('react');
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoResults, setLogoResults] = useState<LogoEntry[]>([]);
  const [lottiePresets, setLottiePresets] = useState<LottiePreset[]>([]);
  const [lottieUrlInput, setLottieUrlInput] = useState('');
  const [sfxPresets, setSfxPresets] = useState<SfxPreset[]>([]);
  const [busyTool, setBusyTool] = useState(false);

  const isZh = lang === 'zh-CN';

  useEffect(() => {
    void apiRequest<{ results: LogoEntry[] }>(
      `/api/tools/logos/search?q=${encodeURIComponent(logoQuery)}`,
    )
      .then((d) => setLogoResults(d.results))
      .catch(() => {});
  }, [logoQuery]);

  useEffect(() => {
    void apiRequest<{ presets: LottiePreset[] }>('/api/tools/lottie/presets')
      .then((d) => setLottiePresets(d.presets))
      .catch(() => {});
    void apiRequest<{ presets: SfxPreset[] }>('/api/tools/sfx/presets')
      .then((d) => setSfxPresets(d.presets))
      .catch(() => {});
  }, []);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) {
        form.append('files', f);
      }
      await apiRequest(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/assets/upload`, {
        method: 'POST',
        body: form,
      });
      await onRefresh();
      onNotify(
        isZh ? `已导入 ${files.length} 个素材并完成 FFprobe 扫描` : `Uploaded ${files.length} assets`,
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleInspect = async () => {
    setInspecting(true);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/assets/inspect`, {
        method: 'POST',
        body: JSON.stringify({ thumbsPerVideo: 6 }),
      });
      await onRefresh();
      onNotify(
        isZh ? 'FFprobe 清单与均匀抽帧缩略图已更新' : 'Manifest & thumbnails updated',
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setInspecting(false);
    }
  };

  const handleDeleteAsset = async (asset: AssetManifestItemDto) => {
    try {
      await apiRequest(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/assets?path=${encodeURIComponent(asset.relativePath)}`,
        { method: 'DELETE' },
      );
      await onRefresh();
      onNotify(`${isZh ? '已移除素材' : 'Deleted'}: ${asset.name}`, 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleFetchLogo = async (queryOrUrl: string, name?: string) => {
    setBusyTool(true);
    try {
      const res = await apiRequest<{ fetched: { relativePath: string } }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/tools/fetch-logo`,
        {
          method: 'POST',
          body: JSON.stringify({ queryOrUrl, name }),
        },
      );
      await onRefresh();
      onNotify(`✔ Logo 已入库: ${res.fetched.relativePath}`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyTool(false);
    }
  };

  const handleFetchLottie = async (presetOrUrl: string, name?: string) => {
    setBusyTool(true);
    try {
      const res = await apiRequest<{ fetched: { relativePath: string } }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/tools/fetch-lottie`,
        {
          method: 'POST',
          body: JSON.stringify({ presetOrUrl, name }),
        },
      );
      await onRefresh();
      onNotify(`✔ Lottie 动效已入库: ${res.fetched.relativePath}`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyTool(false);
    }
  };

  const handleGenerateSfx = async (presets?: string[]) => {
    setBusyTool(true);
    try {
      const res = await apiRequest<{ generated: Array<{ relativePath: string }> }>(
        `/api/projects/${encodeURIComponent(workspace.summary.slug)}/tools/generate-sfx`,
        {
          method: 'POST',
          body: JSON.stringify({ presets }),
        },
      );
      await onRefresh();
      onNotify(
        isZh
          ? `✔ 已生成 ${res.generated.length} 个程序化音效文件到 assets/sfx/`
          : `Generated ${res.generated.length} SFX files`,
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyTool(false);
    }
  };

  const KIND_PRIORITY: Record<string, number> = {
    video: 0,
    image: 1,
    logo: 2,
    lottie: 3,
    audio: 4,
    other: 5,
  };
  const assets = workspace.manifest?.assets || [];
  const filteredAssets = (
    kindFilter === 'all' ? assets : assets.filter((a) => a.kind === kindFilter)
  )
    .slice()
    .sort(
      (a, b) =>
        (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9) ||
        a.name.localeCompare(b.name),
    );

  const auditionAudio = (relativePath: string) => {
    const audio = new Audio(projectFileUrl(workspace.summary.slug, relativePath));
    void audio.play();
  };

  return (
    <div className="flex-1 min-h-0 w-full flex overflow-hidden bg-canvas">
      <Group orientation="horizontal" className="flex-1 min-h-0">
        {/* Left: Assets Library & Keyframe Strip */}
        <Panel minSize="45%">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Film size={14} className="text-text-muted shrink-0" />
                <span className="font-mono text-[12.5px] font-semibold text-text-primary truncate">
                  assets_manifest.json
                </span>
                <span className="font-mono text-[11px] text-text-muted">({assets.length})</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <SegmentedTabs
                  value={kindFilter}
                  onValueChange={setKindFilter}
                  size="xs"
                  items={[
                    { value: 'all', label: isZh ? '全部' : 'All' },
                    { value: 'video', label: isZh ? '视频' : 'Video' },
                    { value: 'image', label: isZh ? '图片' : 'Image' },
                    { value: 'audio', label: isZh ? '音效' : 'Audio' },
                    { value: 'logo', label: 'Logo' },
                    { value: 'lottie', label: 'Lottie' },
                  ]}
                />

                <Button
                  id="btn-inspect-assets"
                  size="xs"
                  variant="primary"
                  disabled={inspecting}
                  onClick={() => void handleInspect()}
                >
                  <ScanSearch size={12} />
                  <span>{inspecting ? '...' : t(lang, 'inspectAssets')}</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3.5">
              {/* Drag-and-Drop Upload Strip */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void uploadFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'px-3.5 py-2.5 rounded-[8px] border border-dashed flex items-center justify-between gap-3 transition-colors',
                  dragging
                    ? 'border-accent bg-accent-soft/60'
                    : 'border-border-strong bg-elevated/45',
                )}
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-text-primary">
                    {isZh
                      ? '拖拽录屏视频、截图、音频到此导入 assets/'
                      : 'Drop screen recordings, images, or audio into assets/'}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {isZh
                      ? '导入后自动执行 FFprobe 探测分辨率/帧率，并为视频均匀抽帧供场记裁剪。'
                      : 'Automatically probes metadata via FFprobe and extracts uniform video keyframes.'}
                  </div>
                </div>
                <div className="shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => void uploadFiles(e.target.files)}
                  />
                  <Button
                    size="xs"
                    variant="default"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={12} />
                    <span>{uploading ? '...' : isZh ? '选择文件' : 'Browse Files'}</span>
                  </Button>
                </div>
              </div>

              {/* Compact Media Grid */}
              {filteredAssets.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 py-14 text-text-muted text-[12px]">
                  <ImageIcon size={24} className="opacity-40" />
                  <div>
                    {isZh
                      ? '当前分类暂无素材，可上传本地文件或从右侧工坊一键抓取 Logo / Lottie / 音效。'
                      : 'No assets in this filter. Upload media or fetch Logo/Lottie/SFX on the right.'}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3">
                  {filteredAssets.map((asset) => {
                    const fileUrl = projectFileUrl(workspace.summary.slug, asset.relativePath);
                    return (
                      <div
                        key={asset.id}
                        className="group rounded-[8px] border border-border-subtle bg-elevated/60 overflow-hidden flex flex-col hover:border-border-strong transition-colors"
                      >
                        <div className="h-[112px] bg-code flex items-center justify-center overflow-hidden relative">
                          {asset.kind === 'logo' ? (
                            <div className="w-[68px] h-[68px] p-3 rounded-[10px] bg-white/95 border border-black/10 flex items-center justify-center shadow-studio-sm">
                              <img
                                src={fileUrl}
                                alt={asset.name}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : asset.kind === 'image' ? (
                            <img
                              src={fileUrl}
                              alt={asset.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : asset.kind === 'video' ? (
                            asset.thumbs?.[0] ? (
                              <img
                                src={projectFileUrl(
                                  workspace.summary.slug,
                                  asset.thumbs[0].relativePath,
                                )}
                                alt={asset.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Film size={24} className="text-text-muted" />
                            )
                          ) : asset.kind === 'audio' ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => auditionAudio(asset.relativePath)}
                            >
                              <Volume2 size={13} className="text-accent" />
                              <span>{isZh ? '试听音频' : 'Audition'}</span>
                            </Button>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 text-text-secondary">
                              <Layers size={20} className="text-accent" />
                              <span className="font-mono text-[10.5px] text-text-muted">
                                Lottie JSON
                              </span>
                            </div>
                          )}

                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-[4px] bg-black/72 text-white/90 font-mono text-[9.5px] uppercase tracking-wider">
                            {asset.kind}
                          </span>
                        </div>

                        <div className="px-2.5 py-2 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              title={asset.relativePath}
                              className="text-[12px] font-medium text-text-primary truncate"
                            >
                              {asset.name}
                            </span>
                            <button
                              type="button"
                              title={isZh ? '删除素材' : 'Delete Asset'}
                              onClick={() => void handleDeleteAsset(asset)}
                              className="opacity-60 hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-text-muted hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>

                          <div className="font-mono text-[10.5px] text-text-muted flex items-center gap-2 flex-wrap tabular-nums">
                            {asset.width && asset.height ? (
                              <span>
                                {asset.width}×{asset.height}
                              </span>
                            ) : null}
                            {asset.fps ? <span>{asset.fps}fps</span> : null}
                            {asset.durationSec ? <span>{asset.durationSec.toFixed(2)}s</span> : null}
                            <span>{formatBytes(asset.sizeBytes)}</span>
                          </div>
                        </div>

                        {/* Video Keyframe Thumbnail Strip */}
                        {asset.kind === 'video' && asset.thumbs && asset.thumbs.length > 0 ? (
                          <div className="border-t border-border-subtle bg-code/70">
                            <div className="px-2.5 pt-1.5 pb-1 text-[10px] text-text-muted">
                              {isZh
                                ? '点击关键帧设分镜裁剪起点 (trimStartSec)：'
                                : 'Click keyframe to set trimStartSec:'}
                            </div>
                            <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                              {asset.thumbs.map((th, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  title={`trimStartSec = ${th.timeSec}s`}
                                  onClick={() => onPickVideoTrim(asset.relativePath, th.timeSec)}
                                  className="relative aspect-video rounded-[4px] overflow-hidden border border-border-subtle hover:border-accent bg-black p-0 cursor-pointer transition-colors"
                                >
                                  <img
                                    src={projectFileUrl(workspace.summary.slug, th.relativePath)}
                                    alt={`${th.timeSec}s`}
                                    className="w-full h-full object-cover block"
                                  />
                                  <span className="absolute right-0.5 bottom-0.5 px-1 rounded-[3px] bg-black/78 text-white font-mono text-[9px] tabular-nums">
                                    {th.timeSec.toFixed(1)}s
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </Panel>

        <ResizeHandle />

        {/* Right: Asset Enrichment Workshop (348px) */}
        <Panel defaultSize="348px" minSize="280px" maxSize="480px">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                <Wand2 size={13} className="text-text-muted" />
                <span>{isZh ? '素材扩展工坊' : 'Enrichment'}</span>
              </div>

              <SegmentedTabs
                value={toolTab}
                onValueChange={setToolTab}
                size="xs"
                items={[
                  { value: 'logo', label: 'Logo' },
                  { value: 'lottie', label: 'Lottie' },
                  { value: 'sfx', label: 'SFX' },
                ]}
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 flex flex-col gap-3.5">
              {toolTab === 'logo' ? (
                <>
                  <div>
                    <FieldLabel>
                      {isZh
                        ? '检索官方品牌图标 (simple-icons + @lobehub)'
                        : 'Search Brand Icons'}
                    </FieldLabel>
                    <div className="relative">
                      <Search
                        size={13}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                      />
                      <StudioInput
                        compact
                        className="pl-7"
                        placeholder="react, openai, docker, github..."
                        value={logoQuery}
                        onChange={(e) => setLogoQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 max-h-[300px] overflow-y-auto pr-0.5">
                    {logoResults.slice(0, 20).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={busyTool}
                        onClick={() => void handleFetchLogo(item.id, item.slug)}
                        className="flex items-center justify-between gap-1.5 h-8 px-2.5 rounded-[6px] bg-elevated border border-border-subtle hover:bg-hover hover:border-border-strong text-[12px] text-text-primary cursor-pointer transition-colors disabled:opacity-45"
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="font-mono text-[9.5px] text-text-muted shrink-0">
                          {item.source === 'lobehub' ? 'AI' : 'SI'}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-border-subtle">
                    <FieldLabel>
                      {isZh ? '或输入应用商店 / 官网 URL 抓取 Logo' : 'Fetch from Website URL'}
                    </FieldLabel>
                    <div className="flex gap-1.5">
                      <StudioInput
                        compact
                        placeholder="https://remotion.dev"
                        value={logoUrlInput}
                        onChange={(e) => setLogoUrlInput(e.target.value)}
                      />
                      <Button
                        size="xs"
                        variant="primary"
                        disabled={busyTool || !logoUrlInput.trim()}
                        onClick={() => {
                          void handleFetchLogo(logoUrlInput.trim());
                          setLogoUrlInput('');
                        }}
                      >
                        <Download size={11} />
                        <span>{isZh ? '抓取' : 'Fetch'}</span>
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {toolTab === 'lottie' ? (
                <>
                  <div className="text-[11.5px] text-text-muted leading-relaxed">
                    {isZh
                      ? '将内置 Lottie v5 矢量动效写入 assets/lottie/，或拉取远程 .json / Telegram .tgs 资源：'
                      : 'Add built-in Lottie v5 presets to assets/lottie/ or fetch a remote .json / .tgs URL:'}
                  </div>

                  <div className="border border-border-subtle rounded-[8px] overflow-hidden divide-y divide-border-subtle bg-elevated/40">
                    {lottiePresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="px-3 py-2.5 flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-text-primary truncate">
                            {preset.name}
                          </div>
                          <div className="text-[11px] text-text-muted truncate">
                            {preset.description}
                          </div>
                        </div>
                        <Button
                          size="xs"
                          variant="default"
                          disabled={busyTool}
                          onClick={() => void handleFetchLottie(preset.id, preset.id)}
                        >
                          {isZh ? '加入' : 'Add'}
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-border-subtle">
                    <FieldLabel>
                      {isZh ? '远程 Lottie (.json / .tgs) 链接' : 'Remote Lottie URL'}
                    </FieldLabel>
                    <div className="flex gap-1.5">
                      <StudioInput
                        compact
                        placeholder="https://example.com/emoji.tgs"
                        value={lottieUrlInput}
                        onChange={(e) => setLottieUrlInput(e.target.value)}
                      />
                      <Button
                        size="xs"
                        variant="primary"
                        disabled={busyTool || !lottieUrlInput.trim()}
                        onClick={() => {
                          void handleFetchLottie(lottieUrlInput.trim());
                          setLottieUrlInput('');
                        }}
                      >
                        {isZh ? '拉取' : 'Fetch'}
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}

              {toolTab === 'sfx' ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] text-text-muted">
                      {isZh ? '纯 DSP 算法合成无版权转场音效' : 'Programmatic royalty-free SFX'}
                    </span>
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={busyTool}
                      onClick={() => void handleGenerateSfx()}
                    >
                      {isZh ? '生成全部' : 'Generate All'}
                    </Button>
                  </div>

                  <div className="border border-border-subtle rounded-[8px] overflow-hidden divide-y divide-border-subtle bg-elevated/40">
                    {sfxPresets.map((sfx) => {
                      const existing = assets.find(
                        (a) => a.relativePath === `assets/sfx/${sfx.id}.wav`,
                      );
                      return (
                        <div
                          key={sfx.id}
                          className="px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-medium text-text-primary">
                                {sfx.name}
                              </span>
                              <span className="font-mono text-[10px] text-text-muted">
                                {sfx.durationSec}s
                              </span>
                            </div>
                            <div className="text-[11px] text-text-muted truncate">
                              {sfx.description}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {existing ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                title={isZh ? '试听' : 'Play'}
                                onClick={() => auditionAudio(existing.relativePath)}
                                className="px-1.5"
                              >
                                <Play size={11} />
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              variant="default"
                              disabled={busyTool}
                              onClick={() => void handleGenerateSfx([sfx.id])}
                            >
                              {existing ? (isZh ? '重生成' : 'Regen') : isZh ? '生成' : 'Gen'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </Panel>
      </Group>
    </div>
  );
};
