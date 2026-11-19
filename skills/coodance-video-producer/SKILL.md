---
name: coodance-video-producer
description: End-to-end Code-as-Video 16:9 production workflow for CooDance Studio. Use whenever an AI agent is asked to create, script, voice, source/generate assets for, storyboard (`edit_plan.json`), validate, or render a CooDance video project—whether via CooDance MCP tools (preferred) or local CLI / REST fallback.
---

# CooDance Video Producer — Code-as-Video 16:9 Production Skill

You are directing a **16:9 (`1920×1080 @ 60fps`) Code-as-Video** production inside **CooDance Studio**.
CooDance uses a strict, deterministic disk layout (`script.txt`, `assets/`, `build/`, `edit_plan.json`, `out/`) with live hot-reload into the visual Studio UI.

> **MCP + Skill Division of Labor**
> - Use **CooDance MCP tools** (`coodance_*`) for all deterministic project operations: project CRUD, script updates, TTS synthesis, external asset ingestion, Logo/Lottie/SFX generation, FFprobe inspection, `edit_plan.json` validation & saving, snapshots, and async rendering.
> - Use **your own external agent capabilities** (reasoning, copywriting, image generation, Playwright/browser screen capture, bespoke SVG/diagram authoring, code editing) to create rich visual materials, then ingest them cleanly through `coodance_import_asset`.
> - If MCP tools are unavailable in your environment, fall back to the **CLI / REST Fallback Table** at the bottom of this guide.

---

## Mandatory 5-Stage Production SOP

Follow these stages **in order**. Never guess timestamps before Stage 2 (`audio_timeline.json`) exists, and never save an unvalidated `edit_plan.json`.

### Stage 1 — Initialize Project & Craft Spoken Script (`script.txt`)

1. Inspect existing projects or create a new one:
   - MCP: `coodance_manage_project(action="list" | "get" | "init", slug, title, theme)`
   - Pick a visual theme suited to the topic:
     - `obsidian-studio` — Sleek dark technical / developer product launches (default)
     - `ivory-editorial` — Clean light editorial, explainer, or design case study
     - `cyber-emerald` — High-contrast terminal / AI / infra showcase
2. Write `script.txt` via `coodance_update_script`:
   - **One spoken sentence per line** (12–32 Chinese chars or 8–18 English words per line for crisp subtitle rhythm).
   - Attach an optional visual cue note on any line using `[视觉备注]` at the end or start, e.g.:
     ```text
     [开场标题卡] 欢迎了解 CooDance，一套用纯代码驱动的 16 比 9 自动化视频管线。
     [架构流程图] 只需要写好口播文案，系统就会自动合成配音、裁切气口并输出毫秒级时间轴。

     [录屏局部推镜] 接下来看实际界面演示，所有分镜参数都能在画布上实时双向同步。
     ```
   - Use **blank lines** between logical paragraphs — CooDance automatically inserts longer paragraph pauses (`paragraphPauseMs`, ~560ms) between paragraphs and shorter sentence pauses (~220ms) between lines.
   - Avoid raw URLs, code punctuation (`{}`, `::`, `=>`), or unpronounceable acronyms in spoken prose; write how a human narrator would read them aloud.

### Stage 2 — Synthesize Voiceover & Lock Ground-Truth Timeline

1. Run `coodance_run_tts(slug, provider?, speed?)`:
   - By default CooDance reuses SHA-256 cached sentences (`forceRegenerate: false`) and trims breath/silence via 10ms RMS analysis.
   - Note: Paid Volcengine Doubao 2.0 TTS may be guarded by user settings (`allowPaidTtsFromAgent`). If blocked, use `provider: "edge"` (free high-quality neural voices) or `provider: "local"` (offline preview), or ask the user to enable paid TTS in Studio Settings.
2. Read the returned `audio_timeline.json` summary (`totalDurationSec` and every sentence's exact `id`, `startSec`, `endSec`, `text`, `note`).
3. **Hard Rule**: Every scene's `startSec` / `endSec` in Stage 4 MUST align to these real sentence boundaries and seamlessly span `0` to `totalDurationSec`.

### Stage 3 — Produce, Enrich & Inspect Project Assets (`assets/`)

Inventory existing assets first with `coodance_inspect_assets(slug)`, then fill visual gaps using **both** CooDance's built-in workshop and your external agent tools:

#### A. Built-in CooDance Asset Workshop (`coodance_enrich_assets`)
- **Brand Logos**: `action: "search_logos"` → `action: "fetch_logo"` (SVG logos from Simple Icons / LobeHub Icons or direct SVG/PNG URL → `assets/logos/`).
- **Lottie Motion Accents**: `action: "list_lottie_presets"` → `action: "fetch_lottie"` (`pulse-ring`, `spark-burst`, `check-badge`, `arrow-bounce`, `audio-bars`, `radar-ping`, or direct Lottie JSON URL → `assets/lottie/`).
- **Procedural DSP SFX**: `action: "list_sfx_presets"` → `action: "generate_sfx"` (`whoosh`, `pop`, `click`, `chime`, `riser`, `success` → `assets/sfx/`).

#### B. External Agent Asset Production (Ingest via `coodance_import_asset`)
When the video needs bespoke visuals not yet in `assets/`, **create them yourself** and ingest them with `coodance_import_asset` (which safely writes into `assets/` and auto-runs FFprobe `inspect_assets`):
- **Custom SVG Diagrams / Architecture Illustrations**: Author clean 16:9 (`viewBox="0 0 1920 1080"`) or badge SVGs and call `coodance_import_asset(sourceType="text", filename="arch-diagram.svg", category="media", content="<svg ...>")`.
- **AI-Generated Illustrations / Keyframes**: Generate 16:9 images matching the selected theme (`obsidian-studio` dark slate, `ivory-editorial` warm off-white, etc.), then ingest via `coodance_import_asset(sourceType="localPath" | "base64" | "url", filename="hero-visual.png", category="media")`.
- **Real Web / App Screenshots or Screen Recordings**: Capture at `1920×1080` (e.g. via Playwright / browser automation), then ingest via `coodance_import_asset(sourceType="localPath", filename="app-demo.mp4" | "dashboard.png", category="media")`.
- Read `references/asset-guidelines.md` for exact naming, aspect ratio, and visual craft rules.

### Stage 4 — Direct & Validate the Storyboard (`edit_plan.json`)

Read `references/edit-plan-schema.md` for the full schema and `references/scene-recipes.md` for proven visual patterns.

Follow these **Visual Direction Guardrails**:
1. **Complete, Gapless Coverage**:
   - First scene MUST start at `0` (or `<= 0.05s`).
   - Last scene MUST end at `timeline.totalDurationSec` (within `±0.1s`).
   - Consecutive scenes MUST satisfy `scene[i].endSec === scene[i+1].startSec` (no black-frame gaps, no overlaps).
   - Map `sentenceIds` accurately to each scene.
2. **Rhythmic Visual Variety**:
   - Never use the same `scene.type` more than **2 times consecutively**.
   - Target **3–8 seconds per scene** for technical explainers (combine short adjacent sentences when they share one visual beat; split long explanations across complementary scenes).
   - Mix declarative scenes (`title-card`, `data-ui`, `web-dom`, `split-compare`) with real media scenes (`video` with `zoomRegion` focus pulls, `image` with `kenBurns` motion).
3. **Layered Polish (Overlays, Chapters & SFX)**:
   - Add 3–6 `chapters` covering the full timeline so `ChapterProgressBar` gives viewers clear structural orientation.
   - Use `overlays` sparingly (1–2 active at a time, normalized `x`/`y` in `0.08..0.92`, avoiding the bottom subtitle safe zone `y > 0.80`).
   - Place subtle `sfxEvents` (`volume: 0.22–0.38`) on major scene transitions (`whoosh`), key callouts (`pop`/`chime`), and final achievements (`success`).
4. **Mandatory Validation Gate**:
   - Always call `coodance_validate_edit_plan(slug, editPlan)` before saving, OR let `coodance_save_edit_plan(slug, editPlan)` enforce validation.
   - If validation returns errors (missing asset path, gap/overlap, schema mismatch, out-of-range `trimStartSec` or `zoomRegion`), **read the `suggestion` field and fix every error** until `valid: true`.
   - `coodance_save_edit_plan` automatically creates a Git snapshot before overwriting so human edits are never lost.

### Stage 5 — Snapshot & Async Render Export

1. Create a milestone snapshot via `coodance_manage_snapshot(slug, action="create", note="...")` if needed.
2. Start rendering asynchronously via `coodance_render_video(slug, preset="draft" | "production")`:
   - Start with `preset: "draft"` (`1280×720 @ 30fps`) for rapid turnaround when iterating.
   - Use `preset: "production"` (`1920×1080 @ 60fps`) for final delivery.
3. Poll `coodance_get_render_status(jobId)` until `status === "succeeded"` (or `"failed"`), then report the output MP4 path (`out/*.mp4`), resolution, duration, and file size to the user.

---

## MCP-First & CLI / REST Fallback Matrix

If CooDance MCP tools are **not** mounted in your current agent session (e.g., running directly inside the repo workspace with shell access), use these equivalent CLI scripts:

| Stage | Preferred MCP Tool | Local CLI Fallback (`npm run ...`) |
|---|---|---|
| Project init / demo | `coodance_manage_project` | `npm run init-project -- <slug> --title "..."` (`--demo`) |
| Edit script | `coodance_update_script` | Write `<workspace>/<slug>/script.txt` directly |
| TTS + timeline | `coodance_run_tts` | `npm run tts -- <slug> --provider edge --speed 1.05` |
| Inspect assets | `coodance_inspect_assets` | `npm run inspect-assets -- <slug> --thumbs 6` |
| Logo / Lottie / SFX | `coodance_enrich_assets` | `npm run fetch-logo`, `npm run fetch-tg-emoji`, `npm run generate-sfx` |
| Ingest custom asset | `coodance_import_asset` | Copy/write to `<workspace>/<slug>/assets/...` then run `inspect-assets` |
| Validate `edit_plan` | `coodance_validate_edit_plan` | `npm run validate-plan -- <slug>` |
| Save `edit_plan` | `coodance_save_edit_plan` | Snapshot first, write `<workspace>/<slug>/edit_plan.json`, run `validate-plan` |
| Render MP4 | `coodance_render_video` + `coodance_get_render_status` | `npm run render-project -- <slug> --preset draft` |
| Git snapshots | `coodance_manage_snapshot` | `npm run snapshot -- <slug> "<note>"` (`--list`, `--restore <tag>`) |

## Progressive Reference Files

Load these references only when needed:
- `references/edit-plan-schema.md` — Exact `EditPlan` JSON schema, all 6 scene types, 7 overlay types, transitions, and validation rules.
- `references/scene-recipes.md` — High-craft JSON storyboard recipes and pacing blueprints.
- `references/asset-guidelines.md` — External asset creation guidelines (16:9 SVG, AI image prompts, Playwright recording, naming, and `import_asset`).
