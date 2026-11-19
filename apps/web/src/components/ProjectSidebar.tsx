import React, { useState } from 'react';
import {
  FolderOpen,
  Plus,
  Sparkles,
  Trash2,
  Film,
  X,
} from 'lucide-react';
import { ProjectSummaryDto } from '../api';
import { UiLang, t } from '../i18n';

interface ProjectSidebarProps {
  lang: UiLang;
  workspaceDir: string;
  projects: ProjectSummaryDto[];
  activeSlug: string | null;
  busyDemo: boolean;
  onSelectProject: (slug: string) => void;
  onCreateProject: (payload: { slug: string; title: string; theme: 'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald' }) => Promise<void>;
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
  const [theme, setTheme] = useState<'obsidian-studio' | 'ivory-editorial' | 'cyber-emerald'>('obsidian-studio');
  const [creating, setCreating] = useState(false);

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
    <aside className="project-sidebar">
      <div className="sidebar-section-head">
        <span className="sidebar-label">{t(lang, 'workspace')}</span>
        {window.coodanceDesktop?.isDesktop ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={handlePickFolder}
            title={t(lang, 'selectFolder')}
          >
            <FolderOpen size={13} />
            {t(lang, 'selectFolder')}
          </button>
        ) : null}
      </div>

      <div className="workspace-pill" title={workspaceDir}>
        <FolderOpen size={13} style={{ flexShrink: 0, color: 'var(--accent)' }} />
        <span className="workspace-pill-path">{workspaceDir || '~/CooDanceProjects'}</span>
      </div>

      <div className="sidebar-section-head">
        <span className="sidebar-label">
          {t(lang, 'projects')} ({projects.length})
        </span>
        <button
          id="btn-new-project"
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => setShowNewModal(true)}
        >
          <Plus size={13} />
          {t(lang, 'newProject')}
        </button>
      </div>

      <div className="project-list">
        {projects.length === 0 ? (
          <div
            style={{
              padding: '24px 12px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <Film size={24} style={{ opacity: 0.5, marginBottom: 6 }} />
            <div>{lang === 'zh-CN' ? '暂无视频工程，可点击下方一键体验完整示例。' : 'No projects yet. Create one or seed the interactive demo below.'}</div>
          </div>
        ) : (
          projects.map((proj) => {
            const isActive = proj.slug === activeSlug;
            return (
              <div
                key={proj.slug}
                role="button"
                tabIndex={0}
                className={`project-card ${isActive ? 'active' : ''}`}
                onClick={() => onSelectProject(proj.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectProject(proj.slug);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div className="project-card-title">{proj.title}</div>
                  <button
                    type="button"
                    className="btn btn-sm btn-icon"
                    style={{ width: 22, height: 22, opacity: 0.65 }}
                    title={lang === 'zh-CN' ? '删除工程' : 'Delete Project'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(lang === 'zh-CN' ? `确定删除工程 "${proj.slug}" 吗？` : `Delete project "${proj.slug}"?`)) {
                        void onDeleteProject(proj.slug);
                      }
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                <div className="project-card-meta">
                  <span>{proj.slug}</span>
                  <span>
                    {proj.durationSec > 0 ? `${proj.durationSec.toFixed(1)}s` : '--'} · {proj.sceneCount} {lang === 'zh-CN' ? '镜' : 'sc'}
                  </span>
                </div>

                <div className="pipeline-dots">
                  <span className={`pipe-dot ${proj.hasScript ? 'ready' : ''}`}>
                    {lang === 'zh-CN' ? '文案' : 'Txt'}
                  </span>
                  <span className={`pipe-dot ${proj.hasVoiceover ? 'ready' : ''}`}>
                    {lang === 'zh-CN' ? '配音' : 'TTS'}
                  </span>
                  <span className={`pipe-dot ${proj.hasAssetsManifest ? 'ready' : ''}`}>
                    {lang === 'zh-CN' ? '素材' : 'Ast'}
                  </span>
                  <span className={`pipe-dot ${proj.hasRenderedVideo ? 'ready' : ''}`}>
                    {lang === 'zh-CN' ? '成片' : 'MP4'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-footer">
        <button
          id="btn-seed-demo"
          type="button"
          className="btn btn-cyan"
          style={{ width: '100%' }}
          disabled={busyDemo}
          onClick={() => void onCreateDemo()}
        >
          <Sparkles size={14} />
          {busyDemo
            ? lang === 'zh-CN'
              ? '正在生成 6 镜实机示例...'
              : 'Generating demo episode...'
            : t(lang, 'createDemo')}
        </button>
      </div>

      {showNewModal ? (
        <div className="modal-backdrop" onClick={() => setShowNewModal(false)}>
          <form
            className="modal-window"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateSubmit}
          >
            <div className="modal-header">
              <h3 className="panel-title">
                <Plus size={15} />
                {lang === 'zh-CN' ? '新建 Code-as-Video 视频工程' : 'New Code-as-Video Project'}
              </h3>
              <button type="button" className="btn btn-sm btn-icon" onClick={() => setShowNewModal(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div>
                <label className="field-label">
                  {lang === 'zh-CN' ? '视频标题' : 'Video Title'}
                </label>
                <input
                  className="input"
                  placeholder={lang === 'zh-CN' ? '例如：EP04 Remotion 自动化剪辑实战' : 'e.g. EP04 Automated Video Pipeline'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="field-label">
                  {lang === 'zh-CN' ? '目录标识 (Slug，用于磁盘文件夹命名)' : 'Folder Slug'}
                </label>
                <input
                  className="input mono"
                  placeholder="ep04-remotion-pipeline"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">
                  {lang === 'zh-CN' ? '16:9 初始视觉主题' : 'Initial 16:9 Theme'}
                </label>
                <select
                  className="select"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                >
                  <option value="obsidian-studio">暗影工坊 (Obsidian Studio)</option>
                  <option value="ivory-editorial">极简白昼 (Ivory Editorial)</option>
                  <option value="cyber-emerald">赛博翠光 (Cyber Emerald)</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowNewModal(false)}>
                {lang === 'zh-CN' ? '取消' : 'Cancel'}
              </button>
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating
                  ? lang === 'zh-CN'
                    ? '初始化中...'
                    : 'Initializing...'
                  : lang === 'zh-CN'
                    ? '创建工程目录'
                    : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </aside>
  );
};
