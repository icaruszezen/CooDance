# CooDance External Asset Production & Ingestion Guidelines

CooDance projects store all media inside `<project>/assets/`. When an external AI agent creates or gathers new visual/audio assets, follow these standards and always ingest via `coodance_import_asset` (or copy + `inspect-assets` in CLI fallback).

---

## 1. Folder Conventions (`category` Parameter in `coodance_import_asset`)

| `category` | Target Directory | Best For |
|---|---|---|
| `media` | `assets/` | 16:9 screen recordings (`.mp4`/`.webm`), screenshots (`.png`/`.jpg`/`.webp`), bespoke SVG architecture diagrams (`.svg`), background music (`.mp3`/`.wav`) |
| `logos` | `assets/logos/` | Brand/tool icon SVGs or transparent PNGs for `title-card.logoAsset` or `logo` overlays |
| `lottie` | `assets/lottie/` | Vector motion JSON files (`.json`) for `lottie` overlays |
| `sfx` | `assets/sfx/` | Short sound effects (`.wav`/`.mp3`) for `sfxEvents` |
| `auto` | Auto-routed | `.json` → `assets/lottie/`, otherwise `assets/` |

---

## 2. How External Agents Should Create Bespoke Assets

### A. Custom SVG Architecture / Flow Diagrams (Fastest, Infinitely Sharp)
When explaining system architecture, workflows, or concepts without a screen recording:
- Design a clean SVG with `viewBox="0 0 1920 1080"` (exact 16:9), crisp typography (`font-family="Inter, PingFang SC, Microsoft YaHei, sans-serif"`), generous margins (`>= 100px`), and colors matching the active CooDance theme:
  - `obsidian-studio`: background `#0b0e16`, cards `#141927`, accent `#6366f1` / `#22d3ee`, text `#f8fafc`
  - `ivory-editorial`: background `#faf8f4`, cards `#ffffff`, accent `#2563eb` / `#0f766e`, text `#111827`
  - `cyber-emerald`: background `#050b09`, cards `#0d1915`, accent `#10b981` / `#34d399`, text `#ecfdf5`
- Ingest directly via MCP without touching disk manually:
  ```json
  {
    "slug": "my-video",
    "sourceType": "text",
    "filename": "architecture-overview.svg",
    "category": "media",
    "content": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1920 1080\">...</svg>"
  }
  ```
- Pair it with an `image` scene (`fit: "contain"`, `kenBurns: "zoom-in"` or `"none"`).

### B. AI-Generated Hero Visuals & Illustrations
- Request **16:9 aspect ratio** (`1920×1080` or `1344×768`) with **no embedded garbled text** (let CooDance render crisp typography in Remotion scenes/overlays instead!).
- Keep composition clean near the bottom 20% so subtitles remain effortlessly readable.
- Ingest with `sourceType: "localPath"` (for local agents) or `sourceType: "base64"` / `"url"` (for remote/cloud agents).

### C. Automated Web Screenshots & Screen Recordings (Playwright / Browser Tools)
- Set browser viewport to **`1920×1080`** (or `1440×810` at `2x` DPR — strictly `16:9`) so there are zero awkward black bars when rendered in `video` or `image` scenes.
- Wait for web fonts and animations to settle before capturing.
- Ingest via `coodance_import_asset(sourceType="localPath", filename="product-demo.mp4", category="media")`.
- Because `coodance_import_asset` automatically triggers `inspect_assets`, the response immediately tells you exact `durationSec`, `width`, `height`, `fps`, and extracted thumbnail timestamps (`thumbs[]`) so you can pick the exact `trimStartSec`!

### D. Naming Rules
- Use clean lowercase kebab-case ASCII or concise Chinese names: `hero-cover.png`, `arch-pipeline.svg`, `demo-dashboard.mp4`.
- Avoid spaces, `#`, `?`, or `%` in filenames.
- Never overwrite existing human-curated assets unexpectedly; use `overwrite: false` (or a new versioned filename like `arch-v2.svg`) unless intentionally replacing your own draft.
