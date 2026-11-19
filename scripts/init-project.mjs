#!/usr/bin/env node
import {
  initProject,
  loadSettings,
  seedDemoProject,
} from '@coodance/core';

const args = process.argv.slice(2);
const isDemo = args.includes('--demo');
const titleIdx = args.indexOf('--title');
const title = titleIdx >= 0 ? args[titleIdx + 1] : undefined;
const slug = args.find((a) => !a.startsWith('--') && a !== title) || (isDemo ? 'demo-coodance-launch' : '');

if (!slug) {
  console.error('Usage: npm run init-project -- <project-slug> [--title "Video Title"] [--demo]');
  process.exit(1);
}

const settings = loadSettings();
const paths = isDemo
  ? await seedDemoProject(settings.workspaceDir, slug, settings.ffmpeg)
  : await initProject(settings.workspaceDir, slug, { title });

console.log(`✔ Project initialized at: ${paths.root}`);
console.log(`  - script.txt:     ${paths.scriptFile}`);
console.log(`  - edit_plan.json: ${paths.editPlanFile}`);
console.log(`  - assets/:        ${paths.assetsDir}`);
