import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpDir = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// Resolve esbuild from workspace root or local node_modules
const esbuild = require('esbuild');

await esbuild.build({
  entryPoints: [path.join(mcpDir, 'dist', 'stdio.js')],
  outfile: path.join(mcpDir, 'dist', 'stdio.bundle.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Keep native/heavy optional runtime packages external; core resolves them lazily & falls back to app.asar.unpacked
  external: [
    '@remotion/bundler',
    '@remotion/renderer',
    'ffmpeg-static',
    'ffprobe-static',
    'simple-icons',
    '@lobehub/icons-static-svg',
  ],
  banner: {
    js: "import { createRequire as __coodanceCreateRequire } from 'node:module'; const require = __coodanceCreateRequire(import.meta.url);",
  },
  logLevel: 'info',
});
