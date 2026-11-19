import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  ScanSearch,
  Trash2,
  Image as ImageIcon,
  Film,
  Volume2,
  Sparkles,
  Search,
  Download,
  Play,
  Wand2,
} from 'lucide-react';
import {
  AssetManifestItemDto,
  ProjectWorkspaceDto,
  apiRequest,
  projectFileUrl,
} from '../api';
import { UiLang, t } from '../i18n';

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

  // Right Enrichment Toolbox State
  const [toolTab, setToolTab] = useState<'logo' | 'lottie' | 'sfx'>('logo');
  const [logoQuery, setLogoQuery] = useState('react');
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoResults, setLogoResults] = useState<LogoEntry[]>([]);
  const [lottiePresets, setLottiePresets] = useState<LottiePreset[]>([]);
  const [lottieUrlInput, setLottieUrlInput] = useState('');
  const [sfxPresets, setSfxPresets] = useState<SfxPreset[]>([]);
  const [busyTool, setBusyTool] = useState(false);

  useEffect(() => {
    void apiRequest<{ results: LogoEntry[] }>(`/api/tools/logos/search?q=${encodeURIComponent(logoQuery)}`)
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
        lang === 'zh-CN' ? `已导入 ${files.length} 个素材并完成 FFprobe 扫描` : `Uploaded ${files.length} assets`,
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
      onNotify(lang === 'zh-CN' ? 'FFprobe 清单与均匀抽帧缩略图已更新' : 'Manifest & thumbnails updated', 'success');
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
      onNotify(`${lang === 'zh-CN' ? '已移除素材' : 'Deleted'}: ${asset.name}`, 'info');
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
        lang === 'zh-CN'
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
    <div className="assets-layout">
      {/* Left: Assets Manifest & Keyframe Thumbnails */}
      <section className="panel-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <Film size={15} style={{ color: 'var(--accent)' }} />
            assets_manifest.json ({assets.length})
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="segmented-pills">
              {[
                { id: 'all', label: lang === 'zh-CN' ? '全部' : 'All' },
                { id: 'video', label: lang === 'zh-CN' ? '视频' : 'Video' },
                { id: 'image', label: lang === 'zh-CN' ? '图片' : 'Image' },
                { id: 'audio', label: lang === 'zh-CN' ? '音效' : 'Audio' },
                { id: 'logo', label: 'Logo' },
                { id: 'lottie', label: 'Lottie' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`segmented-pill ${kindFilter === tab.id ? 'active' : ''}`}
                  onClick={() => setKindFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              id="btn-inspect-assets"
              type="button"
              className="btn btn-sm btn-primary"
              disabled={inspecting}
              onClick={() => void handleInspect()}
            >
              <ScanSearch size={13} />
              {inspecting ? '...' : t(lang, 'inspectAssets')}
            </button>
          </div>
        </div>

        <div className="panel-body">
          {/* Drag-and-Drop Upload Bar */}
          <div
            className={`dropzone-bar ${dragging ? 'dragging' : ''}`}
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
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {lang === 'zh-CN' ? '拖拽录屏视频、截图、音频到此导入 assets/' : 'Drop screen recordings, images, or audio into assets/'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {lang === 'zh-CN'
                  ? '导入后自动执行 FFprobe 探测分辨率/帧率，并为视频均匀抽帧供场记裁剪。'
                  : 'Automatically probes metadata via FFprobe and extracts uniform video thumbnails.'}
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => void uploadFiles(e.target.files)}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} />
                {uploading ? '...' : lang === 'zh-CN' ? '选择文件' : 'Browse Files'}
              </button>
            </div>
          </div>

          {/* Asset Cards Grid */}
          {filteredAssets.length === 0 ? (
            <div className="empty-stage" style={{ padding: 36 }}>
              <ImageIcon size={28} style={{ opacity: 0.45 }} />
              <div>
                {lang === 'zh-CN'
                  ? '当前分类暂无素材，可上传本地文件或从右侧工坊一键抓取 Logo / Lottie / 音效。'
                  : 'No assets in this filter. Upload media or fetch Logo/Lottie/SFX on the right.'}
              </div>
            </div>
          ) : (
            <div className="asset-grid">
              {filteredAssets.map((asset) => {
                const fileUrl = projectFileUrl(workspace.summary.slug, asset.relativePath);
                return (
                  <div key={asset.id} className="asset-card">
                    <div className="asset-preview-box">
                      {asset.kind === 'logo' ? (
                        <div className="logo-emblem-pad">
                          <img src={fileUrl} alt={asset.name} />
                        </div>
                      ) : asset.kind === 'image' ? (
                        <img src={fileUrl} alt={asset.name} />
                      ) : asset.kind === 'video' ? (
                        asset.thumbs?.[0] ? (
                          <img
                            src={projectFileUrl(workspace.summary.slug, asset.thumbs[0].relativePath)}
                            alt={asset.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Film size={28} style={{ color: 'var(--cyan)' }} />
                        )
                      ) : asset.kind === 'audio' ? (
                        <button
                          type="button"
                          className="btn btn-cyan"
                          onClick={() => auditionAudio(asset.relativePath)}
                        >
                          <Volume2 size={15} />
                          {lang === 'zh-CN' ? '试听音频' : 'Audition'}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
                          <Sparkles size={24} />
                          <span className="mono" style={{ fontSize: 11 }}>Lottie JSON</span>
                        </div>
                      )}
                      <span
                        className="chip mono"
                        style={{ position: 'absolute', top: 7, left: 7, background: 'rgba(11,14,19,0.78)', color: '#fff' }}
                      >
                        {asset.kind}
                      </span>
                    </div>

                    <div style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <strong
                          style={{
                            fontSize: 12.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={asset.relativePath}
                        >
                          {asset.name}
                        </strong>
                        <button
                          type="button"
                          className="btn btn-sm btn-icon"
                          style={{ width: 24, height: 24 }}
                          onClick={() => void handleDeleteAsset(asset)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

                    {/* Video Uniform Keyframe Thumbnail Strip (Click to bind trimStartSec!) */}
                    {asset.kind === 'video' && asset.thumbs && asset.thumbs.length > 0 ? (
                      <>
                        <div
                          style={{
                            padding: '4px 10px',
                            fontSize: 10.5,
                            color: 'var(--text-muted)',
                            borderTop: '1px solid var(--border-subtle)',
                          }}
                        >
                          {lang === 'zh-CN'
                            ? '点击任意场记关键帧，自动设该时刻为分镜裁剪起点 (trimStartSec)：'
                            : 'Click any keyframe to bind trimStartSec in Storyboard:'}
                        </div>
                        <div className="thumb-strip">
                          {asset.thumbs.map((th, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="thumb-btn"
                              title={`设定裁剪起点 trimStartSec = ${th.timeSec}s`}
                              onClick={() => onPickVideoTrim(asset.relativePath, th.timeSec)}
                            >
                              <img
                                src={projectFileUrl(workspace.summary.slug, th.relativePath)}
                                alt={`${th.timeSec}s`}
                              />
                              <span className="thumb-time">{th.timeSec.toFixed(1)}s</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Right: Asset Enrichment Utilities (fetch-logo / fetch-tg-emoji / generate-sfx) */}
      <section className="panel-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <Wand2 size={15} style={{ color: 'var(--cyan)' }} />
            {lang === 'zh-CN' ? '素材扩展工坊' : 'Asset Enrichment'}
          </h2>
          <div className="segmented-pills">
            <button
              type="button"
              className={`segmented-pill ${toolTab === 'logo' ? 'active' : ''}`}
              onClick={() => setToolTab('logo')}
            >
              Logo
            </button>
            <button
              type="button"
              className={`segmented-pill ${toolTab === 'lottie' ? 'active' : ''}`}
              onClick={() => setToolTab('lottie')}
            >
              Lottie
            </button>
            <button
              type="button"
              className={`segmented-pill ${toolTab === 'sfx' ? 'active' : ''}`}
              onClick={() => setToolTab('sfx')}
            >
              SFX
            </button>
          </div>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {toolTab === 'logo' ? (
            <>
              <div>
                <label className="field-label">
                  {lang === 'zh-CN'
                    ? '检索官方品牌图标 (simple-icons + @lobehub)'
                    : 'Search Brand Icons (simple-icons + @lobehub)'}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    placeholder="react, openai, docker, github, apple..."
                    value={logoQuery}
                    onChange={(e) => setLogoQuery(e.target.value)}
                  />
                  <span className="btn btn-icon" style={{ pointerEvents: 'none' }}>
                    <Search size={14} />
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7, maxHeight: 260, overflowY: 'auto' }}>
                {logoResults.slice(0, 20).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn btn-sm"
                    disabled={busyTool}
                    style={{ justifyContent: 'space-between', height: 34 }}
                    onClick={() => void handleFetchLogo(item.id, item.slug)}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {item.source === 'lobehub' ? 'AI' : 'SI'}
                    </span>
                  </button>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <label className="field-label">
                  {lang === 'zh-CN' ? '或输入应用商店 / 官网 URL 抓取 Logo' : 'Or Fetch from Website / App Store URL'}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    placeholder="https://remotion.dev"
                    value={logoUrlInput}
                    onChange={(e) => setLogoUrlInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busyTool || !logoUrlInput.trim()}
                    onClick={() => {
                      void handleFetchLogo(logoUrlInput.trim());
                      setLogoUrlInput('');
                    }}
                  >
                    <Download size={12} />
                    {lang === 'zh-CN' ? '抓取' : 'Fetch'}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {toolTab === 'lottie' ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {lang === 'zh-CN'
                  ? '一键将内置 Lottie v5 矢量动效添加到 assets/lottie/，或拉取远程 .json / Telegram .tgs 资源：'
                  : 'Add built-in Lottie v5 animations to assets/lottie/ or fetch a remote .json / .tgs URL:'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lottiePresets.map((preset) => (
                  <div
                    key={preset.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 9,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12.5 }}>{preset.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{preset.description}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-cyan"
                      disabled={busyTool}
                      onClick={() => void handleFetchLottie(preset.id, preset.id)}
                    >
                      {lang === 'zh-CN' ? '加入' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                <label className="field-label">
                  {lang === 'zh-CN' ? '远程 Lottie (.json / .tgs) 链接' : 'Remote Lottie (.json / .tgs) URL'}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    placeholder="https://example.com/emoji.tgs"
                    value={lottieUrlInput}
                    onChange={(e) => setLottieUrlInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busyTool || !lottieUrlInput.trim()}
                    onClick={() => {
                      void handleFetchLottie(lottieUrlInput.trim());
                      setLottieUrlInput('');
                    }}
                  >
                    {lang === 'zh-CN' ? '拉取' : 'Fetch'}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {toolTab === 'sfx' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {lang === 'zh-CN' ? '纯 DSP 算法合成无版权转场音效' : 'Programmatic royalty-free SFX'}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busyTool}
                  onClick={() => void handleGenerateSfx()}
                >
                  {lang === 'zh-CN' ? '一键生成全部' : 'Generate All'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {sfxPresets.map((sfx) => {
                  const existing = assets.find((a) => a.relativePath === `assets/sfx/${sfx.id}.wav`);
                  return (
                    <div
                      key={sfx.id}
                      style={{
                        padding: '9px 11px',
                        borderRadius: 9,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                          {sfx.name}{' '}
                          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                            {sfx.durationSec}s
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sfx.description}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        {existing ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-icon"
                            title={lang === 'zh-CN' ? '试听' : 'Play'}
                            onClick={() => auditionAudio(existing.relativePath)}
                          >
                            <Play size={11} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busyTool}
                          onClick={() => void handleGenerateSfx([sfx.id])}
                        >
                          {existing ? (lang === 'zh-CN' ? '重生成' : 'Regen') : lang === 'zh-CN' ? '生成' : 'Gen'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
};
