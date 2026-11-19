#!/usr/bin/env node
import {
  fetchAndSaveLogo,
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

const [slug, queryOrUrl] = positional;

if (!slug || !queryOrUrl) {
  console.error('Usage: npm run fetch-logo -- <project-slug> <brand-name-or-url> [--name alias]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
const result = await fetchAndSaveLogo(paths, queryOrUrl, preferredName);
console.log(`✔ Logo saved (${result.source}): ${result.relativePath}`);
