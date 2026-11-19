# CooDance Storyboard Recipes & Visual Pacing Blueprints

Use these proven patterns when directing a CooDance `edit_plan.json` so every generated video feels thoughtfully designed rather than repetitive.

---

## 1. Golden Pacing Arc (60–120s Tech Product / Feature Video)

| Beat | Share of Video | Recommended Scene Types | Visual Goal |
|---|---|---|---|
| **Hook & Promise** | 0% – 12% | `title-card` (with brand `logoAsset`) + `whoosh` SFX | Instant clarity on what the viewer gets |
| **Problem vs Solution** | 12% – 28% | `split-compare` | Contrast old friction vs new workflow |
| **Live Product Proof** | 28% – 55% | `video` (with `zoomRegion` push-in) + `highlight-box` / `arrow` overlays, or `image` (with `kenBurns`) | Show real UI or crisp 16:9 visuals |
| **How It Works (Architecture)** | 55% – 75% | `data-ui` (`pipeline` or `terminal`) or custom SVG `image` | Explain mechanics cleanly |
| **Impact / Proof Points** | 75% – 90% | `data-ui` (`metrics` or `bar-chart`) or `web-dom` | Quantify value with concrete numbers |
| **Closing CTA** | 90% – 100% | `title-card` + `check-badge` Lottie + `success` SFX | Memorable takeaway & next action |

---

## 2. Visual Composition & Safe-Zone Rules

- **Subtitle Safe Zone**: When `subtitleStyle.enabled` is `true` (`position: "bottom"`), keep `overlays` at `y <= 0.78` so callouts never collide with subtitles.
- **Chapter Bar Safe Zone**: Keep top overlays at `y >= 0.12` so they don't overlap `ChapterProgressBar` along the top edge.
- **Zoom Region Discipline**:
  - When zooming into a UI recording (`video` scene), pick a meaningful region (`width: 0.35..0.60`, `height: 0.35..0.60`) rather than extreme tiny crops (`< 0.2`), and set `startProgress: 0.15`, `endProgress: 0.85` for smooth ease-in/hold.
- **Audio & SFX Balance**:
  - Background music (`videoMeta.bgMusicVolume`): `0.08–0.14`
  - Transition SFX (`whoosh`, `riser`): `0.22–0.30`
  - Accent SFX (`pop`, `click`, `chime`, `success`): `0.28–0.38`
  - Space SFX events at least `1.5s` apart to avoid sonic clutter.

---

## 3. Ready-to-Adapt Multi-Scene Transition Pattern

```json
{
  "scenes": [
    {
      "id": "scene-1",
      "type": "title-card",
      "label": "开场主视觉",
      "startSec": 0,
      "endSec": 4.8,
      "sentenceIds": [0],
      "transition": "fade",
      "props": {
        "eyebrow": "AUTOMATED CODE-AS-VIDEO",
        "heading": "用 AI Agent 一键编排 16:9 技术演示视频",
        "subheading": "MCP 确定性工具 + Skill 编导工作流双向协同",
        "badge": "1080p · 60fps",
        "logoAsset": "assets/logos/react.svg"
      }
    },
    {
      "id": "scene-2",
      "type": "data-ui",
      "label": "五阶段管线总览",
      "startSec": 4.8,
      "endSec": 11.2,
      "sentenceIds": [1, 2],
      "transition": "slide-left",
      "props": {
        "variant": "pipeline",
        "heading": "从口播到成片的 5 阶段自动化闭环",
        "subheading": "每一步均可在工作台、CLI 与 MCP 间实时同步",
        "pipelineSteps": [
          { "title": "1. 文案与 TTS", "subtitle": "SHA-256 缓存 + 10ms 气口裁切", "status": "done" },
          { "title": "2. 素材生产入库", "subtitle": "Logo / Lottie / SVG / 录屏探测", "status": "done" },
          { "title": "3. 分镜强校验", "subtitle": "Zod Schema + 时间轴无断层门禁", "status": "active" },
          { "title": "4. 60fps 渲染", "subtitle": "Remotion 无头 H.264 导出 + 快照", "status": "queued" }
        ]
      }
    }
  ],
  "overlays": [
    {
      "id": "ov-1",
      "type": "badge",
      "label": "MCP 实时同步标签",
      "startSec": 5.4,
      "endSec": 10.6,
      "x": 0.82,
      "y": 0.16,
      "text": "MCP + Skill",
      "animation": "pop"
    }
  ],
  "sfxEvents": [
    {
      "id": "sfx-1",
      "name": "切镜过渡音",
      "assetPath": "assets/sfx/whoosh.wav",
      "timeSec": 4.8,
      "volume": 0.26
    }
  ]
}
```
