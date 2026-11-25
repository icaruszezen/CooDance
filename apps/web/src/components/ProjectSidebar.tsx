import React, { useState } from 'react';
import { FolderOpen, Plus, Trash2, Film, Play } from 'lucide-react';
import { ProjectSummaryDto } from '../api';
import { UiLang, t } from '../i18n';
import {
  Button,
  FieldLabel,
  StudioDialog,
  StudioInput,
  StudioSelect,
  StudioTooltip,
  cn,
} from './ui';

interface ProjectSidebarProps {
  lang: UiLang;
  workspaceDir: string;
  projects: ProjectSummaryDto[];
  activeSlug: string | null;
  busyDemo: boolean;
  onSelectProject: (slug: string) => void;
  onCreateProject: (payload: {
    slug: string;
    title: string;
    theme: 'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald';
  }) => Promise<void>;
  onCreateDemo: () => Promise<void>;
  onDeleteProject: (slug: string) => Promise<void>;
  onChangeWorkspaceDir: (dir: string) => Promise<void>;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  lang,
  workspaceDir,
  projects,
  activeSlug,
  busyDemo,
  onSelectProject,
  onCreateProject,
  onCreateDemo,
  onDeleteProject,
  onChangeWorkspaceDir,
}) => {
  const [showNewModal, setShowNewModal] = useState(false);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState<'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald'>(
    'obsidian-studio',
  );
  const [creating, setCreating] = useState(false);

  const isZh = lang === 'zh-CN';

  const handlePickFolder = async () => {
    if (window.coodanceDesktop?.isDesktop) {
      const chosen = await window.coodanceDesktop.selectDirectory();
      if (chosen) {
        await onChangeWorkspaceDir(chosen);
      }
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() && !title.trim()) return;
    setCreating(true);
    try {
      const targetSlug =
        slug.trim() ||
        title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-');
      await onCreateProject({
        slug: targetSlug,
        title: title.trim() || targetSlug,
        theme,
      });
      setSlug('');
      setTitle('');
      setShowNewModal(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="flex flex-col h-full w-full bg-panel overflow-hidden select-none">
      {/* Workspace Directory Strip */}
      <div className="px-3 py-2.5 border-b border-border-subtle shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            {t(lang, 'workspace')}
          </span>
          {window.coodanceDesktop?.isDesktop ? (
            <Button size="xs" variant="ghost" onClick={handlePickFolder}>
              <FolderOpen size={11} />
              {t(lang, 'selectFolder')}
            </Button>
          ) : null}
        </div>

        <div
          title={workspaceDir}
          className="flex items-center gap-1.5 px-2 py-1 rounded-[5px] bg-canvas border border-border-subtle font-mono text-[11px] text-text-secondary"
        >
          <FolderOpen size={12} className="text-text-muted shrink-0" />
          <span className="truncate flex-1" style={{ direction: 'rtl', textAlign: 'left' }}>
            {workspaceDir || '~/CooDanceProjects'}
          </span>
        </div>
      </div>

      {/* Projects Section Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
          {t(lang, 'projects')} <span className="font-mono">({projects.length})</span>
        </span>
        <Button
          id="btn-new-project"
          size="xs"
          variant="primary"
          onClick={() => setShowNewModal(true)}
        >
          <Plus size={12} />
          {t(lang, 'newProject')}
        </Button>
      </div>

      {/* Edge-to-Edge Project List */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border-subtle">
        {projects.length === 0 ? (
          <div className="px-4 py-10 text-center text-text-muted text-[12px] leading-relaxed flex flex-col items-center gap-2">
            <Film size={20} className="opacity-45" />
            <div>
              {isZh
                ? '暂无视频工程，可新建或点击下方体验完整示例。'
                : 'No projects yet. Create one or seed the interactive demo below.'}
            </div>
          </div>
        ) : (
          projects.map((proj) => {
            const isActive = proj.slug === activeSlug;
            const stages = [
              { ready: proj.hasScript, label: isZh ? '文案' : 'Script' },
              { ready: proj.hasVoiceover, label: isZh ? '配音' : 'TTS' },
              { ready: proj.hasAssetsManifest, label: isZh ? '素材' : 'Assets' },
              { ready: proj.hasRenderedVideo, label: isZh ? '成片' : 'MP4' },
            ];
            return (
              <div
                key={proj.slug}
                role="button"
                tabIndex={0}
                onClick={() => onSelectProject(proj.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectProject(proj.slug);
                  }
                }}
                className={cn(
                  'group relative w-full text-left px-3 py-2.5 cursor-pointer transition-colors duration-100 outline-none',
                  'flex flex-col gap-1.5',
                  isActive
                    ? 'bg-elevated text-text-primary'
                    : 'bg-transparent text-text-secondary hover:bg-hover/70',
                )}
              >
                {/* 2px Satin Gold Active Indicator */}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent"
                  />
                ) : null}

                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={cn(
                      'text-[12.5px] truncate',
                      isActive ? 'font-semibold text-text-primary' : 'font-medium text-text-primary/90',
                    )}
                    title={proj.title}
                  >
                    {proj.title}
                  </span>

                  <button
                    type="button"
                    title={isZh ? '删除工程' : 'Delete Project'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          isZh
                            ? `确定删除工程 "${proj.slug}" 吗？`
                            : `Delete project "${proj.slug}"?`,
                        )
                      ) {
                        void onDeleteProject(proj.slug);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded-[4px] text-text-muted hover:text-danger hover:bg-danger-soft transition-all cursor-pointer shrink-0"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 font-mono text-[10.5px] text-text-muted tabular-nums">
                  <span className="truncate">{proj.slug}</span>
                  <span className="shrink-0">
                    {proj.durationSec > 0 ? `${proj.durationSec.toFixed(1)}s` : '--'} · {proj.sceneCount}{' '}
                    {isZh ? '镜' : 'sc'}
                  </span>
                </div>

                {/* Minimalist 5px Pipeline Progress Dots */}
                <div className="flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5">
                    {stages.map((st) => (
                      <StudioTooltip
                        key={st.label}
                        side="top"
                        content={`${st.label}: ${st.ready ? (isZh ? '就绪' : 'Ready') : isZh ? '未生成' : 'Pending'}`}
                      >
                        <span
                          className={cn(
                            'inline-block w-[5px] h-[5px] rounded-full transition-colors',
                            st.ready ? 'bg-emerald' : 'bg-border-strong',
                          )}
                        />
                      </StudioTooltip>
                    ))}
                  </div>
                  <span className="font-mono text-[10px] text-text-muted">
                    {stages.filter((s) => s.ready).length}/4
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Demo Seeder */}
      <div className="p-2.5 border-t border-border-subtle shrink-0">
        <Button
          id="btn-seed-demo"
          size="sm"
          variant="default"
          disabled={busyDemo}
          onClick={() => void onCreateDemo()}
          className="w-full"
        >
          <Play size={12} className="text-accent" />
          {busyDemo
            ? isZh
              ? '正在生成 6 镜实机示例...'
              : 'Generating demo episode...'
            : t(lang, 'createDemo')}
        </Button>
      </div>

      {/* New Project Base UI Dialog */}
      <StudioDialog
        open={showNewModal}
        onOpenChange={setShowNewModal}
        size="sm"
        title={isZh ? '新建 Code-as-Video 视频工程' : 'New Code-as-Video Project'}
        description={
          isZh
            ? '自动初始化标准 script.txt / assets / edit_plan.json / out 目录结构'
            : 'Scaffolds script.txt, assets/, edit_plan.json, and Git repository'
        }
        onSubmit={handleCreateSubmit}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNewModal(false)}>
              {isZh ? '取消' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating
                ? isZh
                  ? '初始化中...'
                  : 'Initializing...'
                : isZh
                  ? '创建工程目录'
                  : 'Create Project'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div>
            <FieldLabel>{isZh ? '视频标题' : 'Video Title'}</FieldLabel>
            <StudioInput
              placeholder={
                isZh
                  ? '例如：EP04 Remotion 自动化剪辑实战'
                  : 'e.g. EP04 Automated Video Pipeline'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <FieldLabel hint="folder-name">
              {isZh ? '目录标识 (Slug)' : 'Folder Slug'}
            </FieldLabel>
            <StudioInput
              mono
              placeholder="ep04-remotion-pipeline"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>

          <div>
            <FieldLabel>{isZh ? '16:9 初始视觉主题' : 'Initial 16:9 Theme'}</FieldLabel>
            <StudioSelect
              value={theme}
              onValueChange={(v) => setTheme(v as typeof theme)}
              options={[
                { value: 'obsidian-studio', label: '暗影工坊', hint: 'Obsidian' },
                { value: 'ivory-editorial', label: '极简白昼', hint: 'Ivory' },
                { value: 'cyber-emerald', label: '深林翠灰', hint: 'Deep Pine' },
              ]}
            />
          </div>
        </div>
      </StudioDialog>
    </aside>
  );
};
