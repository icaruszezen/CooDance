#!/usr/bin/env node
import {
  createProjectSnapshot,
  listProjectSnapshots,
  loadSettings,
  resolveProjectPaths,
  restoreProjectSnapshot,
} from '@coodance/core';

const args = process.argv.slice(2);
const positional = [];
let restoreTag;
let singleFile;
let listOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--restore' && i + 1 < args.length) restoreTag = args[++i];
  else if (args[i] === '--file' && i + 1 < args.length) singleFile = args[++i];
  else if (args[i] === '--list') listOnly = true;
  else if (!args[i].startsWith('--')) positional.push(args[i]);
}

const [slug, note] = positional;
if (!slug) {
  console.error('Usage: npm run snapshot -- <project-slug> ["snapshot note"] [--list] [--restore <tag>] [--file <path>]');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);

if (listOnly) {
  const snaps = await listProjectSnapshots(paths);
  for (const s of snaps) {
    console.log(`${s.tag}  ${s.commit}  ${s.date}  ${s.message}`);
  }
  process.exit(0);
}

if (restoreTag) {
  const res = await restoreProjectSnapshot(paths, restoreTag, singleFile);
  console.log(`✔ Restored ${res.filePath || 'full project'} from ${res.restoredTag} (backup tag: ${res.backupTag})`);
  process.exit(0);
}

const entry = await createProjectSnapshot(paths, note || 'CLI snapshot');
console.log(`✔ Created snapshot ${entry.tag} (${entry.commit}): ${entry.message}`);
