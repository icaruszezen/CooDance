import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as simpleIcons from 'simple-icons';
import { ProjectPaths, ensureProjectDirs, toPosixPath } from './paths.js';

const require = createRequire(import.meta.url);

export interface LogoCatalogEntry {
  id: string;
  name: string;
  slug: string;
  source: 'simple-icons' | 'lobehub';
  hex?: string;
}

export interface FetchLogoResult {
  name: string;
  relativePath: string;
  absolutePath: string;
  source: 'simple-icons' | 'lobehub' | 'web-url' | 'generated-badge';
  mimeType: string;
}

interface SimpleIconLike {
  title: string;
  slug: string;
  hex: string;
  svg: string;
}

let cachedLobeDir: string | null = null;
function getLobeIconsDir(): string | null {
  if (cachedLobeDir !== null) return cachedLobeDir || null;
  try {
    const pkgPath = require.resolve('@lobehub/icons-static-svg/package.json');
    const iconsDir = path.join(path.dirname(pkgPath), 'icons');
    if (fs.existsSync(iconsDir)) {
      cachedLobeDir = iconsDir;
      return iconsDir;
    }
  } catch {
    // ignore
  }
  cachedLobeDir = '';
  return null;
}

function getAllSimpleIcons(): SimpleIconLike[] {
  const list: SimpleIconLike[] = [];
  for (const val of Object.values(simpleIcons)) {
    if (val && typeof val === 'object' && 'slug' in val && 'svg' in val && 'title' in val) {
      list.push(val as SimpleIconLike);
    }
  }
  return list;
}

let cachedSimpleIcons: SimpleIconLike[] | null = null;

export function searchLocalLogos(query: string, limit = 30): LogoCatalogEntry[] {
  const q = query.trim().toLowerCase();
  const results: LogoCatalogEntry[] = [];

  // 1. Search @lobehub/icons-static-svg (AI & developer ecosystem brand logos)
  const lobeDir = getLobeIconsDir();
  if (lobeDir) {
    const files = fs.readdirSync(lobeDir).filter((f) => f.endsWith('.svg'));
    for (const file of files) {
      const slug = file.replace(/\.svg$/i, '');
      if (!q || slug.toLowerCase().includes(q)) {
        results.push({
          id: `lobehub:${slug}`,
          name: slug,
          slug,
          source: 'lobehub',
        });
        if (results.length >= Math.floor(limit / 2) && q) break;
      }
    }
  }

  // 2. Search simple-icons (3000+ software/brand official SVGs)
  if (!cachedSimpleIcons) {
    cachedSimpleIcons = getAllSimpleIcons();
  }
  for (const icon of cachedSimpleIcons) {
    if (
      !q ||
      icon.slug.toLowerCase().includes(q) ||
      icon.title.toLowerCase().includes(q)
    ) {
      results.push({
        id: `simple-icons:${icon.slug}`,
        name: icon.title,
        slug: icon.slug,
        source: 'simple-icons',
        hex: icon.hex,
      });
      if (results.length >= limit) break;
    }
  }

  return results.slice(0, limit);
}

function safeFileSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'brand-logo'
  );
}

function colorizeSimpleIconSvg(icon: SimpleIconLike): string {
  const fill = `#${icon.hex || 'ffffff'}`;
  if (icon.svg.includes('fill=')) return icon.svg;
  return icon.svg.replace('<svg ', `<svg fill="${fill}" `);
}

/**
 * Fetches a brand/software logo by local catalog name (`simple-icons` / `@lobehub/icons-static-svg`)
 * or by website/App Store URL, and saves it into `assets/logos/`.
 */
export async function fetchAndSaveLogo(
  paths: ProjectPaths,
  queryOrUrl: string,
  preferredName?: string,
): Promise<FetchLogoResult> {
  ensureProjectDirs(paths);
  const trimmed = queryOrUrl.trim();
  if (!trimmed) {
    throw new Error('Logo name or URL is required.');
  }

  const outBaseName = safeFileSlug(preferredName || trimmed);

  // Explicit source prefix e.g. `lobehub:openai` or `simple-icons:react`
  const isUrl = /^https?:\/\//i.test(trimmed);

  if (!isUrl) {
    const cleanQuery = trimmed.replace(/^(lobehub|simple-icons):/i, '').toLowerCase();
    const forceSource = trimmed.startsWith('lobehub:')
      ? 'lobehub'
      : trimmed.startsWith('simple-icons:')
        ? 'simple-icons'
        : null;

    // Try LobeHub SVG first if forced or matched
    const lobeDir = getLobeIconsDir();
    if (lobeDir && (!forceSource || forceSource === 'lobehub')) {
      const exactCandidates = [
        `${cleanQuery}-color.svg`,
        `${cleanQuery}.svg`,
      ];
      for (const cand of exactCandidates) {
        const full = path.join(lobeDir, cand);
        if (fs.existsSync(full)) {
          const dest = path.join(paths.logosDir, `${outBaseName}.svg`);
          fs.copyFileSync(full, dest);
          return {
            name: cleanQuery,
            absolutePath: dest,
            relativePath: toPosixPath(path.relative(paths.root, dest)),
            source: 'lobehub',
            mimeType: 'image/svg+xml',
          };
        }
      }
    }

    // Try simple-icons
    if (!forceSource || forceSource === 'simple-icons') {
      if (!cachedSimpleIcons) cachedSimpleIcons = getAllSimpleIcons();
      const match =
        cachedSimpleIcons.find(
          (ic) => ic.slug.toLowerCase() === cleanQuery || ic.title.toLowerCase() === cleanQuery,
        ) ||
        cachedSimpleIcons.find(
          (ic) => ic.slug.toLowerCase().includes(cleanQuery) || ic.title.toLowerCase().includes(cleanQuery),
        );
      if (match) {
        const dest = path.join(paths.logosDir, `${outBaseName}.svg`);
        fs.writeFileSync(dest, colorizeSimpleIconSvg(match), 'utf8');
        return {
          name: match.title,
          absolutePath: dest,
          relativePath: toPosixPath(path.relative(paths.root, dest)),
          source: 'simple-icons',
          mimeType: 'image/svg+xml',
        };
      }
    }
  }

  // Try fetching from URL (website favicon / apple-touch-icon / og:image / direct image)
  if (isUrl) {
    try {
      const parsedUrl = new URL(trimmed);
      const res = await fetch(trimmed, {
        headers: { 'User-Agent': 'CooDance-LogoFetcher/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const contentType = res.headers.get('content-type') || '';

      if (res.ok && contentType.startsWith('image/')) {
        const ext = contentType.includes('svg')
          ? '.svg'
          : contentType.includes('jpeg') || contentType.includes('jpg')
            ? '.jpg'
            : contentType.includes('webp')
              ? '.webp'
              : '.png';
        const buf = Buffer.from(await res.arrayBuffer());
        const dest = path.join(paths.logosDir, `${outBaseName}${ext}`);
        fs.writeFileSync(dest, buf);
        return {
          name: preferredName || parsedUrl.hostname,
          absolutePath: dest,
          relativePath: toPosixPath(path.relative(paths.root, dest)),
          source: 'web-url',
          mimeType: contentType,
        };
      }

      if (res.ok && contentType.includes('text/html')) {
        const html = await res.text();
        const iconMatches = [
          ...html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/gi),
          ...html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi),
        ];
        const candidateHref = iconMatches[0]?.[1] || '/favicon.ico';
        const resolved = new URL(candidateHref, parsedUrl.origin).toString();
        const imgRes = await fetch(resolved, { signal: AbortSignal.timeout(8000) });
        if (imgRes.ok) {
          const imgCt = imgRes.headers.get('content-type') || 'image/png';
          const ext = imgCt.includes('svg')
            ? '.svg'
            : imgCt.includes('jpeg')
              ? '.jpg'
              : imgCt.includes('webp')
                ? '.webp'
                : '.png';
          const dest = path.join(paths.logosDir, `${outBaseName}${ext}`);
          fs.writeFileSync(dest, Buffer.from(await imgRes.arrayBuffer()));
          return {
            name: preferredName || parsedUrl.hostname,
            absolutePath: dest,
            relativePath: toPosixPath(path.relative(paths.root, dest)),
            source: 'web-url',
            mimeType: imgCt,
          };
        }
      }
    } catch {
      // Fall through to crisp generated monogram SVG badge so workflow never blocks
    }
  }

  // Fallback: generate a clean vector SVG monogram emblem
  const label = (preferredName || trimmed).replace(/^https?:\/\//, '').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <rect width="128" height="128" rx="28" fill="#181b22" stroke="#f59e0b" stroke-width="4"/>
  <text x="64" y="76" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="48" font-weight="700" fill="#f8fafc">${label}</text>
</svg>`;
  const dest = path.join(paths.logosDir, `${outBaseName}.svg`);
  fs.writeFileSync(dest, svg, 'utf8');
  return {
    name: preferredName || trimmed,
    absolutePath: dest,
    relativePath: toPosixPath(path.relative(paths.root, dest)),
    source: 'generated-badge',
    mimeType: 'image/svg+xml',
  };
}
