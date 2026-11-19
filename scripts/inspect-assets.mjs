#!/usr/bin/env node
import {
  inspectProjectAssets,
  loadSettings,
  resolveProjectPaths,
} from '@coodance/core';

const args = process.argv.slice(2);
const thumbsIdx = args.indexOf('--thumbs');
const thumbsPerVideo = thumbsIdx >= 0 ? Number(args[thumbsIdx + 1]) : 6;
const slug = args.find((a) => !a.startsWith('--') && a !== String(thumbsPerVideo));

if (!slug) {
  console.error('Usage: npm run inspect-assets -- <project-slug> [--thumbs 6]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
const manifest = await inspectProjectAssets(
  paths,
  { thumbsPerVideo },
  settings.ffmpeg,
  (progress, message) => {
    console.log(`[${String(Math.round(progress * 100)).padStart(3)}%] ${message}`);
  },
);

console.log(`✔ Manifest written: ${paths.assetsManifestFile} (${manifest.assets.length} assets)`);
