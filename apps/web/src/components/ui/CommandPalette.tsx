import React from 'react';
import { Command } from 'cmdk';
import { Dialog } from '@base-ui/react/dialog';
import {
  ArrowUpCircle,
  Bot,
  Clapperboard,
  FileText,
  Film,
  FolderKanban,
  Languages,
  Layers,
  Moon,
  Search,
  Settings,
  Sun,
  Tag,
} from 'lucide-react';
import type { ProjectSummaryDto } from '../../api';
import type { UiLang } from '../../i18n';
import type { StageTab } from '../StudioTitleBar';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: UiLang;
  uiTheme: 'dark' | 'light';
  projects: ProjectSummaryDto[];
  activeSlug: string | null;
  onSelectTab: (tab: StageTab) => void;
  onSelectProject: (slug: string) => void;
  onQuickSnapshot: () => void;
  onOpenSettings: () => void;
  onOpenAgentHub: () => void;
  onOpenUpdateModal: () => void;
  onToggleTheme: () => void;
  onToggleLang: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  lang,
  uiTheme,
  projects,
  activeSlug,
  onSelectTab,
  onSelectProject,
  onQuickSnapshot,
  onOpenSettings,
  onOpenAgentHub,
  onOpenUpdateModal,
  onToggleTheme,
  onToggleLang,
}) => {
  const isZh = lang === 'zh-CN';

  const runAndClose = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[130] bg-black/58 backdrop-blur-[2px]" />
        <Dialog.Viewport className="fixed inset-0 z-[135] flex items-start justify-center pt-[14vh] px-4">
          <Dialog.Popup
            id="studio-command-palette"
            className="w-full max-w-[540px] overflow-hidden rounded-[10px] bg-panel border border-border-strong shadow-studio-lg outline-none"
          >
            <Command label="Command Palette">
              <div className="flex items-center gap-2.5 px-3.5 border-b border-border-subtle">
                <Search size={14} className="text-text-muted shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder={
                    isZh
                      ? '搜索阶段、切换工程或执行操作...'
                      : 'Jump to stage, switch project, or run command...'
                  }
                  className="!px-0 !py-3"
                />
                <kbd className="font-mono text-[10px] text-text-muted bg-elevated border border-border-subtle rounded-[4px] px-1.5 py-0.5 shrink-0">
                  ESC
                </kbd>
              </div>

              <Command.List>
                <Command.Empty>
                  {isZh ? '未找到匹配的命令或工程' : 'No matching commands or projects'}
                </Command.Empty>

                <Command.Group heading={isZh ? '工作流阶段' : 'Pipeline Stages'}>
                  <Command.Item
                    value="01 script tts 口播与配音"
                    onSelect={() => runAndClose(() => onSelectTab('script'))}
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText size={13} className="text-text-muted" />
                      <span>{isZh ? '01 口播与配音' : '01 Script & TTS'}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-text-muted">script.txt</span>
                  </Command.Item>

                  <Command.Item
                    value="02 assets inspector 素材与场记"
                    onSelect={() => runAndClose(() => onSelectTab('assets'))}
                  >
                    <span className="flex items-center gap-2.5">
                      <Film size={13} className="text-text-muted" />
                      <span>{isZh ? '02 素材与场记' : '02 Assets & Thumbs'}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-text-muted">assets/</span>
                  </Command.Item>

                  <Command.Item
                    value="03 storyboard preview 分镜与预览"
                    onSelect={() => runAndClose(() => onSelectTab('storyboard'))}
                  >
                    <span className="flex items-center gap-2.5">
                      <Layers size={13} className="text-text-muted" />
                      <span>{isZh ? '03 分镜与预览' : '03 Storyboard & Preview'}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-text-muted">edit_plan.json</span>
                  </Command.Item>

                  <Command.Item
                    value="04 render snapshots 渲染与快照"
                    onSelect={() => runAndClose(() => onSelectTab('render'))}
                  >
                    <span className="flex items-center gap-2.5">
                      <Clapperboard size={13} className="text-text-muted" />
                      <span>{isZh ? '04 渲染与快照' : '04 Render & Snapshots'}</span>
                    </span>
                    <span className="font-mono text-[10.5px] text-text-muted">out/*.mp4</span>
                  </Command.Item>
                </Command.Group>

                {projects.length > 0 ? (
                  <>
                    <Command.Separator />
                    <Command.Group heading={isZh ? '切换视频工程' : 'Switch Project'}>
                      {projects.map((p) => (
                        <Command.Item
                          key={p.slug}
                          value={`project ${p.slug} ${p.title}`}
                          onSelect={() => runAndClose(() => onSelectProject(p.slug))}
                        >
                          <span className="flex items-center gap-2.5 min-w-0">
                            <FolderKanban size={13} className="text-text-muted shrink-0" />
                            <span className="truncate">{p.title}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[10.5px] text-text-muted">{p.slug}</span>
                            {p.slug === activeSlug ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                            ) : null}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                ) : null}

                <Command.Separator />
                <Command.Group heading={isZh ? '快捷操作' : 'Studio Actions'}>
                  {activeSlug ? (
                    <Command.Item
                      value="snapshot git 打快照"
                      onSelect={() => runAndClose(onQuickSnapshot)}
                    >
                      <span className="flex items-center gap-2.5">
                        <Tag size={13} className="text-text-muted" />
                        <span>{isZh ? '生成 Git 时间戳快照' : 'Create Git Snapshot'}</span>
                      </span>
                      <span className="font-mono text-[10.5px] text-text-muted">{activeSlug}</span>
                    </Command.Item>
                  ) : null}

                  <Command.Item
                    value="agent hub mcp skill 外部接入"
                    onSelect={() => runAndClose(onOpenAgentHub)}
                  >
                    <span className="flex items-center gap-2.5">
                      <Bot size={13} className="text-text-muted" />
                      <span>{isZh ? '打开 Agent 接入中心 (MCP & Skill)' : 'Open Agent Hub (MCP & Skill)'}</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    value="settings config preferences 设置"
                    onSelect={() => runAndClose(onOpenSettings)}
                  >
                    <span className="flex items-center gap-2.5">
                      <Settings size={13} className="text-text-muted" />
                      <span>{isZh ? '打开工作台设置' : 'Open Studio Settings'}</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    value="update check version 检查更新"
                    onSelect={() => runAndClose(onOpenUpdateModal)}
                  >
                    <span className="flex items-center gap-2.5">
                      <ArrowUpCircle size={13} className="text-text-muted" />
                      <span>{isZh ? '打开软件更新中心' : 'Open Software Updates'}</span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    value="theme dark light 切换主题"
                    onSelect={() => runAndClose(onToggleTheme)}
                  >
                    <span className="flex items-center gap-2.5">
                      {uiTheme === 'dark' ? (
                        <Sun size={13} className="text-text-muted" />
                      ) : (
                        <Moon size={13} className="text-text-muted" />
                      )}
                      <span>
                        {uiTheme === 'dark'
                          ? isZh
                            ? '切换为浅色主题'
                            : 'Switch to Light Theme'
                          : isZh
                            ? '切换为暗色主题'
                            : 'Switch to Dark Theme'}
                      </span>
                    </span>
                  </Command.Item>

                  <Command.Item
                    value="language english chinese 切换语言"
                    onSelect={() => runAndClose(onToggleLang)}
                  >
                    <span className="flex items-center gap-2.5">
                      <Languages size={13} className="text-text-muted" />
                      <span>{isZh ? 'Switch Interface to English' : '切换界面为简体中文'}</span>
                    </span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
