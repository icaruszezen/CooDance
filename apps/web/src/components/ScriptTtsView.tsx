import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';
import {
  FileText,
  Mic,
  Save,
  Play,
  RefreshCw,
  CheckCircle2,
  Download,
  Volume2,
} from 'lucide-react';
import {
  ProjectWorkspaceDto,
  SettingsDto,
  apiRequest,
  projectFileUrl,
} from '../api';
import { UiLang, t } from '../i18n';
import {
  AudioWaveformPlayer,
  type AudioWaveformPlayerHandle,
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
  cn,
} from './ui';

interface ScriptTtsViewProps {
  lang: UiLang;
  uiTheme: 'dark' | 'light';
  workspace: ProjectWorkspaceDto;
  settings: SettingsDto;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, level?: 'info' | 'success' | 'error') => void;
}

const DOUBAO_VOICES = [
  { value: 'zh_female_vv_uranus_bigtts', label: '豆包 2.0 · 温柔女声 (Vivi)', hint: 'uranus' },
  { value: 'zh_male_m191_uranus_bigtts', label: '豆包 2.0 · 沉稳男声 (云舟)', hint: 'uranus' },
  { value: 'zh_female_shuangkuaisisi_moon_bigtts', label: '豆包 2.0 · 爽快思思', hint: 'moon' },
  { value: 'zh_male_bvlazysheep_moon_bigtts', label: '豆包 2.0 · 轻松解说男声', hint: 'moon' },
];

const EDGE_VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: 'Edge · 晓晓 (女声)', hint: 'zh-CN' },
  { value: 'zh-CN-YunxiNeural', label: 'Edge · 云希 (男声)', hint: 'zh-CN' },
  { value: 'zh-CN-YunjianNeural', label: 'Edge · 云健 (新闻男声)', hint: 'zh-CN' },
  { value: 'en-US-JennyNeural', label: 'Edge · Jenny (EN)', hint: 'en-US' },
];

const PROVIDER_OPTIONS = [
  { value: 'doubao', label: '火山引擎豆包 2.0', hint: 'seed-tts-2.0' },
  { value: 'edge', label: '免费 Edge-TTS', hint: '免密钥' },
  { value: 'local', label: '本地演示节奏语音', hint: '完全离线' },
];

export const ScriptTtsView: React.FC<ScriptTtsViewProps> = ({
  lang,
  uiTheme,
  workspace,
  settings,
  onRefresh,
  onNotify,
}) => {
  const playerRef = useRef<AudioWaveformPlayerHandle>(null);

  const [scriptText, setScriptText] = useState(workspace.script);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningTts, setRunningTts] = useState(false);
  const [audioNonce, setAudioNonce] = useState(0);
  const [activeSentenceId, setActiveSentenceId] = useState<number | null>(null);

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

  const isZh = lang === 'zh-CN';

  useEffect(() => {
    setScriptText(workspace.script);
    setDirty(false);
    setActiveSentenceId(null);
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
      onNotify(isZh ? '已保存 script.txt 到磁盘' : 'Saved script.txt', 'success');
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
        isZh
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
  const cacheHitCount = timeline?.sentences.filter((s) => s.cached).length ?? 0;

  const voiceoverSrc = useMemo(() => {
    if (!timeline?.voiceoverFile) return '';
    const url = projectFileUrl(workspace.summary.slug, timeline.voiceoverFile);
    return `${url}${url.includes('?') ? '&' : '?'}v=${audioNonce}`;
  }, [workspace.summary.slug, timeline?.voiceoverFile, audioNonce]);

  return (
    <div className="flex-1 min-h-0 w-full flex overflow-hidden bg-canvas">
      <Group orientation="horizontal" className="flex-1 min-h-0">
        {/* Left: CodeMirror 6 script.txt Editor */}
        <Panel defaultSize="52%" minSize="32%">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-text-muted shrink-0" />
                <span className="font-mono text-[12.5px] font-semibold text-text-primary">
                  script.txt
                </span>
                <span className="font-mono text-[11px] text-text-muted truncate">
                  {scriptStats.spoken} {isZh ? '句' : 'lines'} · {scriptStats.notes}{' '}
                  {isZh ? '备注' : 'notes'} · {scriptStats.chars} {isZh ? '字' : 'chars'}
                </span>
              </div>

              <Button
                id="btn-save-script"
                size="xs"
                variant={dirty ? 'primary' : 'default'}
                disabled={saving || !dirty}
                onClick={() => void handleSave()}
              >
                <Save size={12} />
                <span>{saving ? '...' : dirty ? t(lang, 'save') : t(lang, 'saved')}</span>
              </Button>
            </div>

            <div className="px-3.5 py-2 border-b border-border-subtle bg-elevated/50 text-[11.5px] text-text-muted shrink-0">
              {isZh ? (
                <>
                  语法：<code className="font-mono text-text-secondary">#</code> /{' '}
                  <code className="font-mono text-text-secondary">//</code> 为分镜备注（不配音）；空行插入段落停顿；句尾加{' '}
                  <code className="font-mono text-accent">[pause:600]</code> 指定停顿毫秒数。
                </>
              ) : (
                <>
                  Syntax: <code className="font-mono text-text-secondary">#</code> /{' '}
                  <code className="font-mono text-text-secondary">//</code> for storyboard notes, blank lines for paragraph pauses,{' '}
                  <code className="font-mono text-accent">[pause:600]</code> for custom pause ms.
                </>
              )}
            </div>

            <div className="flex-1 min-h-0">
              <CodeEditor
                id="script-editor"
                value={scriptText}
                onChange={(next) => {
                  setScriptText(next);
                  setDirty(true);
                }}
                onSave={() => void handleSave()}
                language="script"
                theme={uiTheme}
                wordWrap
                lineNumbers
              />
            </div>
          </section>
        </Panel>

        <ResizeHandle />

        {/* Right: TTS Engine Controls + Retina Waveform Player + Clickable Sentence List / SRT */}
        <Panel minSize="34%">
          <section className="h-full w-full flex flex-col bg-panel overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Mic size={14} className="text-text-muted shrink-0" />
                <span className="text-[12.5px] font-semibold text-text-primary truncate">
                  {isZh ? '语音合成与 10ms RMS 气口裁切' : 'TTS & 10ms RMS Breath Trimmer'}
                </span>
              </div>

              <Button
                id="btn-run-tts"
                size="xs"
                variant="primary"
                disabled={runningTts}
                onClick={() => void handleRunTts()}
              >
                {runningTts ? <RefreshCw size={12} className="spin-icon" /> : <Mic size={12} />}
                <span>
                  {runningTts
                    ? isZh
                      ? '合成中...'
                      : 'Synthesizing...'
                    : t(lang, 'runTts')}
                </span>
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5 flex flex-col gap-4">
              {/* TTS Parameters */}
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>{isZh ? '语音合成引擎' : 'TTS Provider'}</FieldLabel>
                    <StudioSelect
                      compact
                      value={provider}
                      onValueChange={(next) => {
                        const p = next as 'doubao' | 'edge' | 'local';
                        setProvider(p);
                        if (p === 'doubao') setVoice(settings.tts.doubao.voiceType);
                        else if (p === 'edge') setVoice(settings.tts.edge.voice);
                        else setVoice('studio-warm-zh');
                      }}
                      options={PROVIDER_OPTIONS}
                    />
                  </div>

                  <div>
                    <FieldLabel>{isZh ? '音色选择' : 'Voice'}</FieldLabel>
                    {provider === 'doubao' ? (
                      <StudioSelect
                        compact
                        value={voice}
                        onValueChange={setVoice}
                        options={DOUBAO_VOICES}
                      />
                    ) : provider === 'edge' ? (
                      <StudioSelect
                        compact
                        value={voice}
                        onValueChange={setVoice}
                        options={EDGE_VOICES}
                      />
                    ) : (
                      <StudioInput
                        compact
                        mono
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <FieldLabel hint={`${speed.toFixed(2)}×`}>
                      {isZh ? '语速' : 'Speed'}
                    </FieldLabel>
                    <StudioSlider
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      value={speed}
                      onValueChange={(v) => setSpeed(Number(v.toFixed(2)))}
                    />
                  </div>

                  <div>
                    <FieldLabel>{isZh ? '静音阈值' : 'Silence Gate'}</FieldLabel>
                    <NumberScrubInput
                      compact
                      suffix="dB"
                      min={-55}
                      max={-20}
                      step={1}
                      value={silenceDb}
                      onValueChange={(v) => setSilenceDb(Math.round(v))}
                    />
                  </div>

                  <div>
                    <FieldLabel>{isZh ? '最大气口' : 'Max Gap'}</FieldLabel>
                    <NumberScrubInput
                      compact
                      suffix="ms"
                      min={80}
                      max={600}
                      step={20}
                      value={maxPauseMs}
                      onValueChange={(v) => setMaxPauseMs(Math.round(v))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 py-2 border-y border-border-subtle">
                  <span className="text-[12px] text-text-secondary">
                    {isZh
                      ? '忽略 cache/tts/ 哈希缓存，强制重新合成所有句子'
                      : 'Bypass SHA-256 cache and force regenerate all lines'}
                  </span>
                  <StudioSwitch checked={forceRegen} onCheckedChange={setForceRegen} />
                </div>
              </div>

              {/* Retina Interactive Waveform Player */}
              {timeline ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-3 font-mono text-[11px] text-text-secondary tabular-nums">
                      <span className="inline-flex items-center gap-1.5 text-text-primary font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
                        {timeline.totalDurationSec.toFixed(2)}s
                      </span>
                      <span className="text-text-muted">
                        RMS -{(totalTrimmedMs / 1000).toFixed(2)}s
                      </span>
                      <span className="text-text-muted">
                        {isZh ? '缓存' : 'Cache'} {cacheHitCount}/{timeline.sentences.length}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-[4px] bg-elevated border border-border-subtle text-[10px] text-text-muted">
                        {timeline.provider}
                      </span>
                    </div>

                    <a
                      href={projectFileUrl(workspace.summary.slug, 'build/subtitles.srt', true)}
                      download
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] bg-elevated border border-border-subtle hover:bg-hover hover:border-border-strong text-[11px] font-medium text-text-primary no-underline transition-colors"
                    >
                      <Download size={11} />
                      <span>SRT</span>
                    </a>
                  </div>

                  <AudioWaveformPlayer
                    ref={playerRef}
                    src={voiceoverSrc}
                    peaks={timeline.waveformPeaks}
                    durationHintSec={timeline.totalDurationSec}
                    theme={uiTheme}
                  />
                </div>
              ) : (
                <div className="px-4 py-6 rounded-[8px] border border-dashed border-border-strong bg-elevated/40 text-center text-[12px] text-text-muted flex flex-col items-center gap-1.5">
                  <Volume2 size={18} className="opacity-45" />
                  <div>
                    {isZh
                      ? '尚未生成配音时间轴，点击右上角「合成配音并生成时间轴」即可开始。'
                      : 'No voiceover yet. Click "Synthesize TTS & Timeline" above to build audio_timeline.json.'}
                  </div>
                </div>
              )}

              {/* Sentence Timeline / SRT Tabs */}
              {timeline ? (
                <div className="flex-1 min-h-0 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <SegmentedTabs
                      value={rightTab}
                      onValueChange={setRightTab}
                      size="xs"
                      items={[
                        {
                          value: 'timeline',
                          label: 'audio_timeline.json',
                          count: timeline.sentences.length,
                        },
                        {
                          value: 'srt',
                          label: 'subtitles.srt',
                          count: timeline.subtitles.length,
                        },
                      ]}
                    />
                    {rightTab === 'timeline' ? (
                      <span className="text-[11px] text-text-muted">
                        {isZh ? '点击分句直达试听' : 'Click sentence to audition'}
                      </span>
                    ) : null}
                  </div>

                  {rightTab === 'timeline' ? (
                    <div className="border border-border-subtle rounded-[8px] overflow-hidden divide-y divide-border-subtle bg-elevated/35">
                      {timeline.sentences.map((sent) => {
                        const isActive = activeSentenceId === sent.id;
                        return (
                          <button
                            key={sent.id}
                            type="button"
                            onClick={() => {
                              setActiveSentenceId(sent.id);
                              playerRef.current?.seekAndPlay(sent.startSec);
                            }}
                            className={cn(
                              'group relative w-full text-left px-3 py-2.5 flex flex-col gap-1 transition-colors cursor-pointer',
                              isActive ? 'bg-elevated' : 'hover:bg-hover/70',
                            )}
                          >
                            {isActive ? (
                              <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
                            ) : null}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                                <span className="text-text-muted font-semibold">
                                  {String(sent.id + 1).padStart(2, '0')}
                                </span>
                                <span className="text-accent font-medium">
                                  {sent.startSec.toFixed(2)}s → {sent.endSec.toFixed(2)}s
                                </span>
                                <span className="text-text-muted">(-{sent.trimmedMs}ms)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[10.5px] text-text-secondary transition-opacity">
                                  <Play size={10} />
                                </span>
                                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-text-muted">
                                  {sent.cached ? (
                                    <>
                                      <CheckCircle2 size={10} className="text-emerald" />
                                      <span className="text-emerald">CACHE</span>
                                    </>
                                  ) : (
                                    sent.hash.slice(0, 8)
                                  )}
                                </span>
                              </div>
                            </div>
                            {sent.note ? (
                              <div className="text-[11px] text-cyan font-medium">
                                # {sent.note}
                              </div>
                            ) : null}
                            <div className="text-[12.5px] text-text-primary leading-relaxed">
                              {sent.text}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-[320px] rounded-[8px] border border-border-subtle overflow-hidden">
                      <CodeEditor
                        value={workspace.subtitlesSrt}
                        language="srt"
                        theme={uiTheme}
                        readOnly
                        lineNumbers
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        </Panel>
      </Group>
    </div>
  );
};
