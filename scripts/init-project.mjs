#!/usr/bin/env node
import {
  initProject,
  loadSettings,
  seedDemoProject,
} from '@coodance/core';

const args = process.argv.slice(2);
const isDemo = args.includes('--demo');
const readFlag = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
};
const title = readFlag('--title');
const providerArg = readFlag('--provider');
const voiceArg = readFlag('--voice');
const speedArg = readFlag('--speed');
const flagValues = new Set([title, providerArg, voiceArg, speedArg].filter(Boolean));
const slug =
  args.find((a) => !a.startsWith('--') && !flagValues.has(a)) ||
  (isDemo ? 'demo-coodance-launch' : '');

if (!slug) {
  console.error(
    'Usage: npm run init-project -- <project-slug> [--title "Video Title"] [--demo] [--provider doubao|edge|local] [--voice <voice>] [--speed 1.08]',
  );
  process.exit(1);
}

const settings = loadSettings();
const hasDoubaoCreds = Boolean(settings.tts.doubao.appId && settings.tts.doubao.accessToken);
const effectiveDemoProvider =
  providerArg || (settings.tts.defaultProvider === 'doubao' && hasDoubaoCreds ? 'doubao' : undefined);

const paths = isDemo
  ? await seedDemoProject(settings.workspaceDir, slug, settings.ffmpeg, {
      tts: effectiveDemoProvider
        ? {
            provider: effectiveDemoProvider,
            voice: voiceArg,
            speed: speedArg ? Number(speedArg) : undefined,
            silenceThresholdDb: settings.tts.silenceThresholdDb,
            maxInternalPauseMs: settings.tts.maxInternalPauseMs,
            paragraphPauseMs: settings.tts.paragraphPauseMs,
            sentencePauseMs: settings.tts.sentencePauseMs,
            doubaoAppId: settings.tts.doubao.appId,
            doubaoAccessToken: settings.tts.doubao.accessToken,
            doubaoResourceId: settings.tts.doubao.resourceId,
            doubaoEndpoint: settings.tts.doubao.endpoint,
          }
        : undefined,
      onProgress: (_stage, progress, message) => {
        console.log(`[${String(Math.round(progress * 100)).padStart(3)}%] ${message}`);
      },
    })
  : await initProject(settings.workspaceDir, slug, { title });

console.log(`✔ Project initialized at: ${paths.root}`);
console.log(`  - script.txt:     ${paths.scriptFile}`);
console.log(`  - edit_plan.json: ${paths.editPlanFile}`);
console.log(`  - assets/:        ${paths.assetsDir}`);
