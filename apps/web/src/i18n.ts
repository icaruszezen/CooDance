export type UiLang = 'zh-CN' | 'en-US';

const DICT = {
  'zh-CN': {
    appSubtitle: 'Code-as-Video 16:9',
    tabScript: '口播与配音',
    tabAssets: '素材与场记',
    tabStoryboard: '分镜与预览',
    tabRender: '渲染与快照',
    projects: '视频工程',
    newProject: '新建工程',
    createDemo: '一键体验完整示例',
    quickSnapshot: '打快照',
    settings: '设置',
    save: '保存',
    saved: '已保存',
    workspace: '工作区目录',
    selectFolder: '切换目录',
    runTts: '合成配音并生成时间轴',
    inspectAssets: 'FFprobe 探测并抽帧',
    renderNow: '开始渲染 MP4',
    syncStudio: '同步到 Remotion Studio',
    aiGenerate: 'AI 自动编排',
    copyAgentPrompt: '复制 Agent 上下文',
    zoomPicker: '框选局部缩放',
    exitZoomPicker: '完成框选',
    emptyTitle: '开启你的纯代码化 16:9 视频工程',
    emptyDesc: '所有工程在磁盘严格保持 script.txt / assets / edit_plan.json / build / out 结构，支持界面编排、CLI 脚本与外部 AI 协同。',
  },
  'en-US': {
    appSubtitle: 'Code-as-Video 16:9',
    tabScript: 'Script & TTS',
    tabAssets: 'Assets & Thumbs',
    tabStoryboard: 'Storyboard & Preview',
    tabRender: 'Render & Snapshots',
    projects: 'Projects',
    newProject: 'New Project',
    createDemo: 'Create Interactive Demo',
    quickSnapshot: 'Snapshot',
    settings: 'Settings',
    save: 'Save',
    saved: 'Saved',
    workspace: 'Workspace',
    selectFolder: 'Choose Dir',
    runTts: 'Synthesize TTS & Timeline',
    inspectAssets: 'Inspect & Extract Thumbs',
    renderNow: 'Render MP4',
    syncStudio: 'Sync Remotion Studio',
    aiGenerate: 'AI Storyboard',
    copyAgentPrompt: 'Copy Agent Context',
    zoomPicker: 'Pick Zoom Box',
    exitZoomPicker: 'Done Picking',
    emptyTitle: 'Start a Code-as-Video 16:9 Project',
    emptyDesc: 'Every episode keeps the exact script.txt / assets / edit_plan.json / build / out layout on disk for Studio UI, CLI scripts, and AI agents.',
  },
} as const;

export type I18nKey = keyof (typeof DICT)['zh-CN'];

export function t(lang: UiLang, key: I18nKey): string {
  return DICT[lang]?.[key] ?? DICT['zh-CN'][key];
}
