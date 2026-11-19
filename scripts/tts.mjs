#!/usr/bin/env node
import {
  loadSettings,
  resolveProjectPaths,
  runTtsPipeline,
} from '@coodance/core';

const args = process.argv.slice(2);
const positional = [];
let provider;
let voice;
let speedRaw;
let forceRegenerate = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--provider' && i + 1 < args.length) provider = args[++i];
  else if (args[i] === '--voice' && i + 1 < args.length) voice = args[++i];
  else if (args[i] === '--speed' && i + 1 < args.length) speedRaw = args[++i];
  else if (args[i] === '--force') forceRegenerate = true;
  else if (!args[i].startsWith('--')) positional.push(args[i]);
}

const [slug] = positional;
if (!slug) {
  console.error('Usage: npm run tts -- <project-slug> [--provider doubao|edge|local] [--voice <voice>] [--speed 1.05] [--force]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
const chosenProvider = provider || settings.tts.defaultProvider;
const defaultVoice =
  chosenProvider === 'edge'
    ? settings.tts.edge.voice
    : chosenProvider === 'local'
      ? 'studio-warm-zh'
      : settings.tts.doubao.voiceType;

const timeline = await runTtsPipeline(
  paths,
  {
    provider: chosenProvider,
    voice: voice || defaultVoice,
    speed: speedRaw ? Number(speedRaw) : settings.tts.defaultSpeed,
    silenceThresholdDb: settings.tts.silenceThresholdDb,
    maxInternalPauseMs: settings.tts.maxInternalPauseMs,
    paragraphPauseMs: settings.tts.paragraphPauseMs,
    sentencePauseMs: settings.tts.sentencePauseMs,
    doubaoAppId: settings.tts.doubao.appId,
    doubaoAccessToken: settings.tts.doubao.accessToken,
    doubaoResourceId: settings.tts.doubao.resourceId,
    doubaoEndpoint: settings.tts.doubao.endpoint,
    forceRegenerate,
  },
  settings.ffmpeg,
  (_stage, progress, message) => {
    console.log(`[${String(Math.round(progress * 100)).padStart(3)}%] ${message}`);
  },
);

console.log(`✔ Voiceover: ${paths.voiceoverFile}`);
console.log(`✔ Timeline:  ${paths.audioTimelineFile} (${timeline.totalDurationSec}s, ${timeline.sentences.length} sentences)`);
console.log(`✔ Subtitles: ${paths.subtitlesFile}`);
