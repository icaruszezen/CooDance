# CooDance `edit_plan.json` Schema Reference

All coordinates for `overlays` and `zoomRegion` are **normalized floats in `[0, 1]`** relative to the `1920×1080` 16:9 canvas.
All asset references (`assetPath`, `logoAsset`, `leftAsset`, `rightAsset`, `bgMusicAsset`) MUST be **project-relative POSIX paths** starting with `assets/` (e.g. `assets/demo-screen.mp4`, `assets/logos/react.svg`, `assets/sfx/whoosh.wav`).

---

## Top-Level Structure

```json
{
  "version": "1.0.0",
  "theme": "obsidian-studio",
  "videoMeta": {
    "title": "Video Title",
    "subtitle": "Optional Subtitle",
    "width": 1920,
    "height": 1080,
    "fps": 60,
    "bgMusicAsset": "assets/bgm.mp3",
    "bgMusicVolume": 0.12
  },
  "subtitleStyle": {
    "enabled": true,
    "position": "bottom",
    "fontSize": 44,
    "maxCharsPerLine": 22,
    "highlightActive": true
  },
  "chapters": [
    { "id": "ch-1", "title": "开场导览", "startSec": 0, "endSec": 8.4 }
  ],
  "scenes": [],
  "overlays": [],
  "sfxEvents": []
}
```

### Valid Enums
- `theme`: `"obsidian-studio"` | `"ivory-editorial"` | `"cyber-emerald"`
- `scene.type`: `"title-card"` | `"video"` | `"image"` | `"split-compare"` | `"data-ui"` | `"web-dom"`
- `scene.transition`: `"none"` | `"fade"` | `"slide-left"` | `"zoom-in"` | `"wipe"`
- `overlay.type`: `"callout"` | `"arrow"` | `"highlight-box"` | `"badge"` | `"lottie"` | `"logo"` | `"text-card"`
- `overlay.animation`: `"pop"` | `"slide-up"` | `"fade"` | `"pulse"`
- `overlay.arrowDirection`: `"up"` | `"down"` | `"left"` | `"right"` | `"top-left"` | `"top-right"` | `"bottom-left"` | `"bottom-right"`
- `subtitleStyle.position`: `"bottom"` | `"lower-third"`

---

## 6 Declarative Scene Types (`scenes[].props`)

### 1. `title-card`
Hero opening, chapter divider, or closing CTA card.
```json
{
  "eyebrow": "CODE-AS-VIDEO · 16:9",
  "heading": "Main Title Here",
  "subheading": "Concise 1-line supporting explanation",
  "badge": "v1.0 RELEASE",
  "logoAsset": "assets/logos/react.svg"
}
```
- Required: `heading` (string).

### 2. `video`
Screen recordings or video clips with trim, playback speed, device bezel, and smooth animated zoom-in (`zoomRegion`).
```json
{
  "assetPath": "assets/demo-recording.mp4",
  "trimStartSec": 2.5,
  "playbackRate": 1.0,
  "muted": true,
  "volume": 0.0,
  "fit": "contain",
  "showDeviceFrame": true,
  "caption": "Optional caption pill above/below frame",
  "zoomRegion": {
    "enabled": true,
    "x": 0.12,
    "y": 0.18,
    "width": 0.45,
    "height": 0.42,
    "startProgress": 0.15,
    "endProgress": 0.85
  }
}
```
- Required: `assetPath` (must exist on disk), `trimStartSec` (>= 0, less than video duration), `playbackRate` (`0.25..4`).
- `zoomRegion`: `x + width <= 1`, `y + height <= 1`, `width > 0.05`, `height > 0.05`.

### 3. `image`
Screenshots, AI-generated artwork, or custom SVG illustrations with Ken Burns camera motion.
```json
{
  "assetPath": "assets/arch-diagram.svg",
  "fit": "contain",
  "kenBurns": "zoom-in",
  "caption": "System Architecture Overview",
  "showFrame": true
}
```
- Required: `assetPath` (must exist on disk).
- `kenBurns`: `"none"` | `"zoom-in"` | `"zoom-out"` | `"pan-left"` | `"pan-right"`.

### 4. `split-compare`
Side-by-side before/after or A-vs-B comparison cards (optionally paired with left/right images).
```json
{
  "leftTitle": "传统剪辑工作流",
  "rightTitle": "CooDance 纯代码管线",
  "badgeLeft": "BEFORE",
  "badgeRight": "AFTER",
  "leftPoints": ["手动对齐字幕与气口", "版本不可 Diff 不可回滚"],
  "rightPoints": ["TTS 毫秒级自动对齐", "Git 快照与 AI 协同热更新"],
  "leftAsset": "assets/before.png",
  "rightAsset": "assets/after.png",
  "splitRatio": 0.5
}
```
- Required: `leftTitle`, `rightTitle`.

### 5. `data-ui`
Procedural animated UI visualizations — zero external media required!
Supports 4 `variant` modes:
- `"metrics"` → requires `metrics: [{ label, value, delta?, accent?: "primary"|"success"|"warning"|"neutral" }]`
- `"terminal"` → requires `terminalLines: ["$ npm run tts -- demo", "✔ Generated 6 sentences"]`
- `"pipeline"` → requires `pipelineSteps: [{ title, subtitle, status: "done"|"active"|"queued" }]`
- `"bar-chart"` → requires `chartData: [{ label, value, unit?, highlight? }]`

```json
{
  "variant": "metrics",
  "heading": "端到端生产效率对比",
  "subheading": "基于 3 分钟技术演示成片实测",
  "metrics": [
    { "label": "配音与字幕耗时", "value": "18s", "delta": "-92%", "accent": "success" },
    { "label": "输出规格", "value": "1080p60", "delta": "H.264", "accent": "primary" }
  ]
}
```

### 6. `web-dom`
Interactive-looking simulated browser frame with highlighted feature cards and animated cursor.
```json
{
  "url": "https://studio.coodance.local/demo",
  "pageTitle": "CooDance Studio",
  "heading": "可视化编排与源码双向同步",
  "description": "修改 edit_plan.json 即时刷新 16:9 画布",
  "highlights": [
    { "title": "MCP + Skill 协同", "badge": "NEW", "description": "支持 Cursor / Claude Code / Claude Desktop", "active": true },
    { "title": "强校验门禁", "badge": "SAFE", "description": "写入前校验时间轴与素材路径" }
  ],
  "ctaLabel": "导出 1080p@60fps MP4",
  "cursorTargetIndex": 0
}
```
- Required: `url`, `pageTitle`, `heading`.

---

## 7 Overlay Types (`overlays[]`)

Each overlay requires `id`, `type`, `label`, `startSec`, `endSec`, `x`, `y` (keep `y <= 0.78` when subtitles are enabled at the bottom!).

| Type | Key Optional Fields | Typical Use |
|---|---|---|
| `callout` | `text`, `subtext`, `color`, `animation` | Explanatory callout card pointing out a feature |
| `arrow` | `text`, `arrowDirection`, `color`, `animation` | Directional pointer onto UI detail |
| `highlight-box` | `width`, `height`, `color`, `label` | Glowing spotlight rectangle over a region |
| `badge` | `text`, `color`, `animation` | Compact floating pill tag (top-right / top-left) |
| `lottie` | `assetPath` OR `lottiePreset`, `width`, `height` | Animated motion accent (`pulse-ring`, `check-badge`, etc.) |
| `logo` | `assetPath`, `width`, `height`, `animation` | Floating brand SVG badge |
| `text-card` | `text`, `subtext`, `width`, `color`, `animation` | Emphasized floating stat or quote box |

---

## SFX Events (`sfxEvents[]`)

```json
{
  "id": "sfx-1",
  "name": "Scene transition whoosh",
  "assetPath": "assets/sfx/whoosh.wav",
  "timeSec": 4.2,
  "volume": 0.28
}
```
- `timeSec` MUST be within `[0, totalDurationSec]`.
- `volume` recommended in `0.20..0.40` so SFX supports rather than drowns narration.

---

## Validation Gate Rules (Enforced by `coodance_validate_edit_plan` / `coodance_save_edit_plan`)

1. Strict Zod validation of top-level fields, scene props per `scene.type`, overlay fields, and SFX fields.
2. `scenes.length >= 1`, every `startSec >= 0`, `endSec > startSec`, chronologically sorted.
3. No gaps (`> 0.1s`) or overlaps (`> 0.1s`) between adjacent scenes.
4. Timeline alignment against `build/audio_timeline.json` (when present): first scene starts near `0` and last scene ends near `totalDurationSec`.
5. Every referenced `assetPath` / `logoAsset` / `leftAsset` / `rightAsset` / `bgMusicAsset` exists on disk inside the project directory (no path traversal).
6. For `video` scenes: `trimStartSec < videoDurationSec` (checked against `assets_manifest.json`) and `zoomRegion` fits within `[0, 1]`.
