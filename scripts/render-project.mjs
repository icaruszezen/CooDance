#!/usr/bin/env node
import {
  loadSettings,
  renderProjectVideo,
  resolveProjectPaths,
} from '@coodance/core';

const args = process.argv.slice(2);
const positional = [];
let preset = 'production';
let outputName;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--preset' && i + 1 < args.length) preset = args[++i];
  else if (args[i] === '--out' && i + 1 < args.length) outputName = args[++i];
  else if (!args[i].startsWith('--')) positional.push(args[i]);
}

const [slug] = positional;
if (!slug) {
  console.error('Usage: npm run render-project -- <project-slug> [--preset production|draft] [--out video.mp4]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);

const result = await renderProjectVideo(
  paths,
  {
    preset: preset === 'draft' ? 'draft' : 'production',
    outputName,
  },
  (_stage, progress, message) => {
    console.log(`[${String(Math.round(progress * 100)).padStart(3)}%] ${message}`);
  },
);

console.log(`✔ Rendered MP4: ${result.outputPath}`);
console.log(`  Spec: ${result.width}x${result.height} @ ${result.fps}fps (${result.durationSec}s, ${(result.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
