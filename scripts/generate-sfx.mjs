#!/usr/bin/env node
import {
  generateProjectSfx,
  loadSettings,
  resolveProjectPaths,
} from '@coodance/core';

const [slug, presetList] = process.argv.slice(2);
if (!slug) {
  console.error('Usage: npm run generate-sfx -- <project-slug> [whoosh,pop,click,...]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
const presets = presetList ? presetList.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
const results = generateProjectSfx(paths, presets);

for (const item of results) {
  console.log(`✔ Generated SFX: ${item.relativePath} (${item.durationSec}s)`);
}
