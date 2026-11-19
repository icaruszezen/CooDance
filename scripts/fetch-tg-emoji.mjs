#!/usr/bin/env node
import {
  fetchAndSaveLottie,
  loadSettings,
  resolveProjectPaths,
} from '@coodance/core';

const args = process.argv.slice(2);
const positional = [];
let preferredName;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--name' && i + 1 < args.length) {
    preferredName = args[++i];
  } else if (!args[i].startsWith('--')) {
    positional.push(args[i]);
  }
}

const [slug, presetOrUrl] = positional;

if (!slug || !presetOrUrl) {
  console.error('Usage: npm run fetch-tg-emoji -- <project-slug> <preset-id-or-lottie-url> [--name alias]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
const result = await fetchAndSaveLottie(paths, presetOrUrl, preferredName);
console.log(`✔ Lottie saved (${result.source}): ${result.relativePath}`);
