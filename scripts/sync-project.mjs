#!/usr/bin/env node
import {
  loadSettings,
  resolveProjectPaths,
  syncProjectForRemotionStudio,
} from '@coodance/core';

const [slug] = process.argv.slice(2);
if (!slug) {
  console.error('Usage: npm run sync -- <project-slug>');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
const result = syncProjectForRemotionStudio(paths);
console.log(`✔ Synced "${slug}" to Remotion Studio.`);
console.log(`  Run: npm run studio`);
console.log(`  Synced manifest: ${result.syncedJsonPath}`);
