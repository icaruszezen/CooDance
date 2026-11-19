import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Mic,
  Save,
  Play,
  RefreshCw,
  CheckCircle2,
  Clock,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  ProjectWorkspaceDto,
  SettingsDto,
  apiRequest,
  projectFileUrl,
} from '../api';
import { UiLang, t } from '../i18n';

interface ScriptTtsViewProps {
  lang: UiLang;
  workspace: ProjectWorkspaceDto;
  settings: SettingsDto;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
}

const DOUBAO_VOICES = [
  { id: 'zh_female_vv_uranus_bigtts', label: '豆包 2.0 · 温柔女声 (Vivi)' },
  { id: 'zh_male_m191_uranus_bigtts', label: '豆包 2.0 · 沉稳男声 (云舟)' },
  { id: 'zh_female_shuangkuaisisi_moon_bigtts', label: '豆包 2.0 · 爽快思思' },
  { id: 'zh_male_bvlazysheep_moon_bigtts', label: '豆包 2.0 · 轻松解说男声' },
];

const EDGE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: 'Edge · 晓晓 (女声)' },
  { id: 'zh-CN-YunxiNeural', label: 'Edge · 云希 (男声)' },
  { id: 'zh-CN-YunjianNeural', label: 'Edge · 云健 (新闻男声)' },
  { id: 'en-US-JennyNeural', label: 'Edge · Jenny (EN)' },
];

export const ScriptTtsView: React.FC<ScriptTtsViewProps> = ({
  lang,
  workspace,
  settings,
  onRefresh,
  onNotify,
}) => {
  const [scriptText, setScriptText] = useState(workspace.script);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningTts, setRunningTts] = useState(false);
  const [audioNonce, setAudioNonce] = useState(0);

  const [provider, setProvider] = useState<'doubao' | 'edge' | 'local'>(
    settings.tts.defaultProvider || 'doubao',
  );
  const [voice, setVoice] = useState(
    settings.tts.defaultProvider === 'edge'
      ? settings.tts.edge.voice
      : settings.tts.doubao.voiceType,
  );
  const [speed, setSpeed] = useState(settings.tts.defaultSpeed || 1.05);
  const [silenceDb, setSilenceDb] = useState(settings.tts.silenceThresholdDb ?? -38);
  const [maxPauseMs, setMaxPauseMs] = useState(settings.tts.maxInternalPauseMs ?? 240);
  const [forceRegen, setForceRegen] = useState(false);
  const [rightTab, setRightTab] = useState<'timeline' | 'srt'>('timeline');

  useEffect(() => {
    setScriptText(workspace.script);
    setDirty(false);
  }, [workspace.summary.slug, workspace.script]);

  const scriptStats = useMemo(() => {
    const lines = scriptText.replace(/\r\n/g, '\n').split('\n');
    let spoken = 0;
    let notes = 0;
    let chars = 0;
    for (const l of lines) {
      const s = l.trim();
      if (!s) continue;
      if (s.startsWith('#') || s.startsWith('//')) notes++;
      else {
        spoken++;
        chars += s.length;
      }
    }
    return { spoken, notes, chars };
  }, [scriptText]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/script`, {
        method: 'PUT',
        body: JSON.stringify({ script: scriptText }),
      });
      setDirty(false);
      onNotify(lang === 'zh-CN' ? '已保存 script.txt 到磁盘' : 'Saved script.txt', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRunTts = async () => {
    setRunningTts(true);
    try {
      if (dirty) {
        await apiRequest(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/script`, {
          method: 'PUT',
          body: JSON.stringify({ script: scriptText }),
        });
        setDirty(false);
      }
      await apiRequest(`/api/projects/${encodeURIComponent(workspace.summary.slug)}/tts`, {
        method: 'POST',
        body: JSON.stringify({
          provider,
          voice,
          speed,
          silenceThresholdDb: silenceDb,
          maxInternalPauseMs: maxPauseMs,
          forceRegenerate: forceRegen,
        }),
      });
      setAudioNonce((n) => n + 1);
      await onRefresh();
      onNotify(
        lang === 'zh-CN'
          ? '配音合成完成：已更新 voiceover.mp3、audio_timeline.json 与 subtitles.srt'
          : 'TTS completed: updated voiceover.mp3, audio_timeline.json & subtitles.srt',
        'success',
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setRunningTts(false);
    }
  };

  const timeline = workspace.timeline;
  const totalTrimmedMs =
    timeline?.sentences.reduce((acc, s) => acc + (s.trimmedMs || 0), 0) ?? 0;
  const cacheHitCount =
    timeline?.sentences.filter((s) => s.cached).length ?? 0;

  return (
    <div className="split-two-col">
      {/* Left: script.txt Editor */}
      <section className="panel-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <FileText size={15} style={{ color: 'var(--accent)' }} />
            script.txt
            <span className="chip mono">
              {scriptStats.spoken} {lang === 'zh-CN' ? '句口播' : 'lines'} · {scriptStats.notes}{' '}
              {lang === 'zh-CN' ? '条备注' : 'notes'} · {scriptStats.chars}{' '}
              {lang === 'zh-CN' ? '字' : 'chars'}
            </span>
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id="btn-save-script"
              type="button"
              className={`btn btn-sm ${dirty ? 'btn-primary' : ''}`}
              disabled={saving || !dirty}
              onClick={() => void handleSave()}
            >
              <Save size={13} />
              {saving ? '...' : dirty ? t(lang, 'save') : t(lang, 'saved')}
            </button>
          </div>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              padding: '8px 11px',
              borderRadius: 8,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11.5,
              color: 'var(--text-secondary)',
            }}
          >
            {lang === 'zh-CN'
              ? '语法提示：以 # 或 // 开头作为分镜备注（不配音）；空行自动插入段落停顿；句尾加 [pause:600] 可精准指定停顿毫秒数。'
              : 'Tip: Lines starting with # or // are storyboard notes (not spoken). Blank lines insert paragraph pauses; append [pause:600] for custom pause ms.'}
          </div>

          <textarea
            id="script-editor"
            className="script-editor-area"
            value={scriptText}
            spellCheck={false}
            onChange={(e) => {
              setScriptText(e.target.value);
              setDirty(true);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void handleSave();
              }
            }}
          />
        </div>
      </section>

      {/* Right: TTS Engine Controls + Voiceover Player + Audio Timeline */}
      <section className="panel-card">
        <div className="panel-header">
          <h2 className="panel-title">
            <Mic size={15} style={{ color: 'var(--cyan)' }} />
            {lang === 'zh-CN' ? '语音合成与 10ms RMS 气口裁切' : 'TTS & 10ms RMS Breath Trimmer'}
          </h2>
          <button
            id="btn-run-tts"
            type="button"
            className="btn btn-sm btn-primary"
            disabled={runningTts}
            onClick={() => void handleRunTts()}
          >
            {runningTts ? <RefreshCw size={13} /> : <Sparkles size={13} />}
            {runningTts
              ? lang === 'zh-CN'
                ? '合成中...'
                : 'Synthesizing...'
              : t(lang, 'runTts')}
          </button>
        </div>

        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* TTS Settings Grid */}
          <div className="form-grid-2">
            <div>
              <label className="field-label">
                {lang === 'zh-CN' ? '语音合成引擎' : 'TTS Provider'}
              </label>
              <select
                className="select"
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as 'doubao' | 'edge' | 'local';
                  setProvider(next);
                  if (next === 'doubao') setVoice(settings.tts.doubao.voiceType);
                  else if (next === 'edge') setVoice(settings.tts.edge.voice);
                  else setVoice('studio-warm-zh');
                }}
              >
                <option value="doubao">火山引擎豆包 2.0 (seed-tts-2.0)</option>
                <option value="edge">免费 Edge-TTS (免密钥)</option>
                <option value="local">本地演示节奏语音 (完全离线)</option>
              </select>
            </div>

            <div>
              <label className="field-label">
                {lang === 'zh-CN' ? '音色选择' : 'Voice'}
              </label>
              {provider === 'doubao' ? (
                <select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  {DOUBAO_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : provider === 'edge' ? (
                <select className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  {EDGE_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input mono" value={voice} onChange={(e) => setVoice(e.target.value)} />
              )}
            </div>
          </div>

          <div className="form-grid-3">
            <div>
              <label className="field-label">
                {lang === 'zh-CN' ? `语速 (${speed.toFixed(2)}×)` : `Speed (${speed.toFixed(2)}×)`}
              </label>
              <input
                type="range"
                min={0.75}
                max={1.5}
                step={0.05}
                value={speed}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="field-label">
                {lang === 'zh-CN' ? '静音阈值 (dBFS)' : 'Silence Threshold (dB)'}
              </label>
              <input
                type="number"
                className="input mono"
                value={silenceDb}
                min={-55}
                max={-20}
                onChange={(e) => setSilenceDb(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="field-label">
                {lang === 'zh-CN' ? '句中最大气口 (ms)' : 'Max Breath Gap (ms)'}
              </label>
              <input
                type="number"
                className="input mono"
                value={maxPauseMs}
                min={80}
                max={600}
                step={20}
                onChange={(e) => setMaxPauseMs(Number(e.target.value))}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={forceRegen}
              onChange={(e) => setForceRegen(e.target.checked)}
            />
            {lang === 'zh-CN'
              ? '忽略 cache/tts/ 哈希缓存，强制重新合成所有句子'
              : 'Ignore cache/tts/ SHA-256 cache and force regenerate all lines'}
          </label>

          {/* Master Voiceover Player & Waveform */}
          {timeline ? (
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="chip chip-emerald mono">
                    <Clock size={11} /> {timeline.totalDurationSec.toFixed(2)}s
                  </span>
                  <span className="chip chip-accent mono">
                    RMS 切除 {(totalTrimmedMs / 1000).toFixed(2)}s
                  </span>
                  <span className="chip mono">
                    缓存命中 {cacheHitCount}/{timeline.sentences.length}
                  </span>
                  <span className="chip mono">{timeline.provider}</span>
                </div>
                <a
                  className="btn btn-sm"
                  href={projectFileUrl(workspace.summary.slug, 'build/subtitles.srt', true)}
                  download
                >
                  <Download size={12} />
                  SRT
                </a>
              </div>

              {/* Waveform Visualization */}
              {timeline.waveformPeaks && timeline.waveformPeaks.length > 0 ? (
                <div
                  style={{
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: 'var(--bg-code)',
                  }}
                >
                  {timeline.waveformPeaks.slice(0, 120).map((peak, idx) => (
                    <span
                      key={idx}
                      style={{
                        flex: 1,
                        height: `${Math.max(8, Math.round(peak * 100))}%`,
                        borderRadius: 2,
                        background: peak > 0.55 ? 'var(--accent)' : 'var(--cyan)',
                        opacity: 0.85,
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {(() => {
                const voiceoverUrl = projectFileUrl(workspace.summary.slug, timeline.voiceoverFile);
                const voiceoverSrc = `${voiceoverUrl}${voiceoverUrl.includes('?') ? '&' : '?'}v=${audioNonce}`;
                return (
                  <audio
                    key={audioNonce}
                    controls
                    preload="metadata"
                    style={{ width: '100%', height: 34 }}
                    src={voiceoverSrc}
                  />
                );
              })()}
            </div>
          ) : (
            <div
              style={{
                padding: '18px 14px',
                borderRadius: 10,
                background: 'var(--bg-elevated)',
                border: '1px dashed var(--border-strong)',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <Play size={18} style={{ marginBottom: 4, opacity: 0.6 }} />
              <div>
                {lang === 'zh-CN'
                  ? '尚未生成配音时间轴，点击右上角「合成配音并生成时间轴」即可自动处理。'
                  : 'No voiceover yet. Click "Synthesize TTS & Timeline" above to build audio_timeline.json.'}
              </div>
            </div>
          )}

          {/* Sentence Timeline / SRT Tabs */}
          {timeline ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="segmented-pills">
                  <button
                    type="button"
                    className={`segmented-pill ${rightTab === 'timeline' ? 'active' : ''}`}
                    onClick={() => setRightTab('timeline')}
                  >
                    audio_timeline.json ({timeline.sentences.length})
                  </button>
                  <button
                    type="button"
                    className={`segmented-pill ${rightTab === 'srt' ? 'active' : ''}`}
                    onClick={() => setRightTab('srt')}
                  >
                    subtitles.srt ({timeline.subtitles.length})
                  </button>
                </div>
              </div>

              {rightTab === 'timeline' ? (
                <div className="timeline-sentence-list">
                  {timeline.sentences.map((sent) => (
                    <div key={sent.id} className="sentence-row">
                      <div className="sentence-row-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="chip chip-cyan mono">#{sent.id + 1}</span>
                          <span className="mono" style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 700 }}>
                            {sent.startSec.toFixed(2)}s → {sent.endSec.toFixed(2)}s
                          </span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            (-{sent.trimmedMs}ms)
                          </span>
                        </div>
                        <span className={`chip mono ${sent.cached ? 'chip-emerald' : ''}`}>
                          {sent.cached ? (
                            <>
                              <CheckCircle2 size={10} /> CACHE
                            </>
                          ) : (
                            sent.hash.slice(0, 8)
                          )}
                        </span>
                      </div>
                      {sent.note ? (
                        <div style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 600 }}>
                          # {sent.note}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{sent.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="diff-pre" style={{ maxHeight: 320 }}>
                  {workspace.subtitlesSrt}
                </pre>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
};
