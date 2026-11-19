#!/usr/bin/env node
import fs from 'node:fs';
import { loadSettings, resolveProjectPaths, validateEditPlan } from '../packages/core/dist/index.js';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/validate-edit-plan.mjs <project-slug>');
  process.exit(1);
}

const settings = loadSettings();
const paths = resolveProjectPaths(settings.workspaceDir, slug);
if (!fs.existsSync(paths.editPlanFile)) {
  console.error(`edit_plan.json not found at: ${paths.editPlanFile}`);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(paths.editPlanFile, 'utf8'));
const result = validateEditPlan(paths, plan);

console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
