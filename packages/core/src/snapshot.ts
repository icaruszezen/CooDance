import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProjectPaths } from './paths.js';
import { SnapshotEntry } from './types.js';

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  return stdout.trim();
}

const PROJECT_GITIGNORE = `# Rendered final videos & heavy media caches (ignored from Git snapshots)
out/
cache/
build/thumbs/
build/voiceover.mp3
*.tmp.wav
.DS_Store
Thumbs.db
`;

export async function ensureProjectGitRepo(paths: ProjectPaths): Promise<void> {
  const gitDir = path.join(paths.root, '.git');
  const ignoreFile = path.join(paths.root, '.gitignore');

  if (!fs.existsSync(ignoreFile)) {
    fs.writeFileSync(ignoreFile, PROJECT_GITIGNORE, 'utf8');
  }

  if (!fs.existsSync(gitDir)) {
    await runGit(paths.root, ['init', '-b', 'main']).catch(async () => {
      await runGit(paths.root, ['init']);
    });
    // Ensure local repo has commit identity even on fresh desktop machines
    try {
      await runGit(paths.root, ['config', 'user.name']);
    } catch {
      await runGit(paths.root, ['config', 'user.name', 'CooDance Studio']);
    }
    try {
      await runGit(paths.root, ['config', 'user.email']);
    } catch {
      await runGit(paths.root, ['config', 'user.email', 'studio@coodance.local']);
    }
  }
}

function formatSnapTag(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `snap-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function appendSnapshotDoc(paths: ProjectPaths, entry: SnapshotEntry): void {
  const header = `# Version Snapshots (${paths.slug})\n\n| Tag | Commit | Date | Note |\n| :--- | :--- | :--- | :--- |\n`;
  if (!fs.existsSync(paths.snapshotsDoc)) {
    fs.writeFileSync(paths.snapshotsDoc, header, 'utf8');
  }
  const safeMsg = entry.message.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const row = `| \`${entry.tag}\` | \`${entry.commit}\` | ${entry.date} | ${safeMsg} |\n`;
  fs.appendFileSync(paths.snapshotsDoc, row, 'utf8');
}

/**
 * Creates a timestamped Git snapshot (`snap-YYYYMMDD-HHMMSS`), commits pending changes,
 * appends the entry to `SNAPSHOTS.md`, and tags HEAD.
 */
export async function createProjectSnapshot(
  paths: ProjectPaths,
  note = 'Manual snapshot',
): Promise<SnapshotEntry> {
  await ensureProjectGitRepo(paths);

  const now = new Date();
  let tag = formatSnapTag(now);

  // Avoid duplicate tag within the same second
  const existingTags = await runGit(paths.root, ['tag', '-l', `${tag}*`]).catch(() => '');
  if (existingTags.split(/\r?\n/).includes(tag)) {
    tag = `${tag}-${String(now.getMilliseconds()).padStart(3, '0')}`;
  }

  // Stage and commit current state (allow empty if only tagging current state)
  await runGit(paths.root, ['add', '-A']);
  const status = await runGit(paths.root, ['status', '--porcelain']);
  const filesChanged = status ? status.split(/\r?\n/).filter(Boolean).length : 0;

  let commitHash = '';
  try {
    await runGit(paths.root, [
      'commit',
      '--allow-empty',
      '-m',
      `[${tag}] ${note}`,
    ]);
    commitHash = await runGit(paths.root, ['rev-parse', '--short', 'HEAD']);
  } catch (err) {
    throw new Error(`Failed to commit snapshot: ${err instanceof Error ? err.message : String(err)}`);
  }

  const entry: SnapshotEntry = {
    tag,
    commit: commitHash,
    date: now.toISOString(),
    message: note,
    filesChanged,
  };

  appendSnapshotDoc(paths, entry);
  await runGit(paths.root, ['add', 'SNAPSHOTS.md']);
  await runGit(paths.root, ['commit', '--amend', '--no-edit']);
  entry.commit = await runGit(paths.root, ['rev-parse', '--short', 'HEAD']);

  await runGit(paths.root, ['tag', '-a', tag, '-m', note]);

  return entry;
}

export async function listProjectSnapshots(paths: ProjectPaths): Promise<SnapshotEntry[]> {
  if (!fs.existsSync(path.join(paths.root, '.git'))) {
    return [];
  }
  try {
    const out = await runGit(paths.root, [
      'for-each-ref',
      '--sort=-creatordate',
      '--format=%(refname:short)|||%(objectname:short)|||%(creatordate:iso-strict)|||%(contents:subject)',
      'refs/tags/snap-*',
    ]);
    if (!out) return [];
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [tag, commit, date, message] = line.split('|||');
        return {
          tag: tag || '',
          commit: commit || '',
          date: date || '',
          message: message || '',
        };
      });
  } catch {
    return [];
  }
}

export async function getSnapshotDiff(
  paths: ProjectPaths,
  tag: string,
): Promise<{ stat: string; patch: string; files: string[] }> {
  await ensureProjectGitRepo(paths);
  const stat = await runGit(paths.root, ['diff', '--stat', tag, '--']).catch(() => '');
  const patch = await runGit(paths.root, ['diff', tag, '--']).catch(() => '');
  const filesRaw = await runGit(paths.root, ['ls-tree', '-r', '--name-only', tag]).catch(() => '');
  const files = filesRaw.split(/\r?\n/).filter(Boolean);
  return {
    stat,
    patch: patch.slice(0, 60000),
    files,
  };
}

/**
 * Restores either the entire project workspace or a single file from a snapshot tag,
 * automatically saving a safety backup snapshot first so rollbacks are always reversible.
 */
export async function restoreProjectSnapshot(
  paths: ProjectPaths,
  tag: string,
  filePath?: string,
): Promise<{ restoredTag: string; filePath?: string; backupTag: string }> {
  await ensureProjectGitRepo(paths);

  // Verify tag exists
  const tagCheck = await runGit(paths.root, ['tag', '-l', tag]);
  if (!tagCheck.split(/\r?\n/).includes(tag)) {
    throw new Error(`Snapshot tag not found: ${tag}`);
  }

  // Save a safety snapshot before rolling back
  const backup = await createProjectSnapshot(
    paths,
    filePath ? `Auto-backup before restoring ${filePath} from ${tag}` : `Auto-backup before full restore to ${tag}`,
  );

  if (filePath) {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    await runGit(paths.root, ['checkout', tag, '--', normalized]);
  } else {
    // Restore all tracked files in the tag without detaching HEAD
    const trackedInTag = (await runGit(paths.root, ['ls-tree', '-r', '--name-only', tag]))
      .split(/\r?\n/)
      .filter((f) => f && f !== 'SNAPSHOTS.md');
    if (trackedInTag.length > 0) {
      await runGit(paths.root, ['checkout', tag, '--', ...trackedInTag]);
    }
  }

  return {
    restoredTag: tag,
    filePath,
    backupTag: backup.tag,
  };
}
