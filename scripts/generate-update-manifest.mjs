#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        args[key.slice(2)] = val;
        i++;
      } else {
        args[key.slice(2)] = 'true';
      }
    }
  }
  return args;
}

function inferAssetMetadata(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('-setup.exe') || (lower.includes('win') && lower.endsWith('.exe'))) {
    return {
      platform: 'win32',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'nsis',
    };
  }
  if (lower.includes('win') && lower.endsWith('.zip')) {
    return {
      platform: 'win32',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'portable-zip',
    };
  }
  if (lower.endsWith('.dmg')) {
    return {
      platform: 'darwin',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'dmg',
    };
  }
  if (lower.endsWith('.appimage')) {
    return {
      platform: 'linux',
      arch: lower.includes('arm64') ? 'arm64' : 'x64',
      installKind: 'appimage',
    };
  }
  return {};
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toLowerCase();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(args.dir || 'dist-release');
  const tag = String(args.tag || process.env.TAG || process.env.GITHUB_REF_NAME || '').trim();
  const repo = String(args.repo || process.env.GITHUB_REPOSITORY || 'icaruszezen/CooDance').trim();
  const notesFile = args['notes-file'] ? path.resolve(args['notes-file']) : null;
  const outPath = path.resolve(args.out || path.join(dir, 'update-manifest.json'));

  if (!tag) {
    throw new Error('Missing required --tag (or TAG env var)');
  }
  if (!fs.existsSync(dir)) {
    throw new Error(`Release artifacts directory not found: ${dir}`);
  }

  const version = tag.replace(/^v/i, '');
  const prerelease = version.includes('-');
  const releaseNotes =
    notesFile && fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').trim() : '';

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .filter((name) => name !== 'SHA256SUMS.txt' && name !== 'update-manifest.json')
    .sort();

  const assets = entries.map((name) => {
    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);
    return {
      name,
      size: stat.size,
      sha256: sha256File(fullPath),
      downloadUrl: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`,
      ...inferAssetMetadata(name),
    };
  });

  const manifest = {
    schemaVersion: 1,
    repo,
    version,
    tag,
    name: `CooDance Studio ${tag}`,
    publishedAt: new Date().toISOString(),
    prerelease,
    releaseUrl: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`,
    releaseNotes,
    assets,
  };

  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `[generate-update-manifest] Wrote ${outPath} (version=${version}, prerelease=${prerelease}, assets=${assets.length})`,
  );
}

main();
