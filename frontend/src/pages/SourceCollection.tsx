import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { ModalShell } from '../components/ModalShell';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import { ActionButton } from '../components/ui/ActionButton';
import { WorkbenchCard } from '../components/ui/WorkbenchCard';
import { ProjectList } from '../components/Projects/ProjectList';
import useStore from '../store';
import { getProjectEditorUrl } from './projectEditorContext';

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();
  const todayItems = useStore((state) => state.todayItems);
  const script = useStore((state) => state.script);
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const projectEditorContext = useStore((state) => state.projectEditorContext);
  const isRewriting = useStore((state) => state.isRewriting);
  const contentProjects = useStore((state) => state.contentProjects);
  const isLoadingContentProjects = useStore((state) => state.isLoadingContentProjects);
  const fetchContentProjects = useStore((state) => state.fetchContentProjects);
  const createContentProject = useStore((state) => state.createContentProject);
  const settings = useStore((state) => state.settings);
  const newsIntakeRef = useRef<HTMLDivElement>(null);
  const projectTitleRef = useRef<HTMLInputElement>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState({ title: '', topic: '', audience: '' });
  const activeProjectEditorContext = projectEditorContext
    && script === projectEditorContext.revision.content
    ? projectEditorContext
    : null;
  const isConfigurationIncomplete = !settings.mimo_api_key.is_set || !settings.mimo_tts_api_key.is_set;

  const handleRewriteComplete = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  const handleStartNewsIntake = useCallback(() => {
    const newsIntake = newsIntakeRef.current;
    if (!newsIntake) return;
    newsIntake.scrollIntoView?.({ block: 'start' });
    newsIntake.querySelector<HTMLSelectElement>('select')?.focus();
  }, []);

  const refreshProjects = useCallback(async () => {
    setProjectsError(null);
    try {
      await fetchContentProjects();
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : '获取最近项目失败');
    }
  }, [fetchContentProjects]);

  useEffect(() => {
    let isCurrent = true;
    void fetchContentProjects()
      .then(() => { if (isCurrent) setProjectsError(null); })
      .catch((error: unknown) => {
        if (isCurrent) setProjectsError(error instanceof Error ? error.message : '获取最近项目失败');
      });
    return () => { isCurrent = false; };
  }, [fetchContentProjects]);

  const handleCreateProject = useCallback(async () => {
    const title = projectDraft.title.trim();
    if (!title) {
      setCreateError('请先填写项目名称');
      return;
    }
    setIsCreatingProject(true);
    setCreateError(null);
    try {
      const project = await createContentProject({
        title,
        topic: projectDraft.topic.trim(),
        audience: projectDraft.audience.trim(),
        targetPlatform: 'general',
      });
      setProjectDraft({ title: '', topic: '', audience: '' });
      setIsCreateProjectOpen(false);
      navigate(`/projects/${project.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '新建内容项目失败');
    } finally {
      setIsCreatingProject(false);
    }
  }, [createContentProject, navigate, projectDraft]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="内容工作台" subtitle="从来源到证据，再到带引用成稿；口播和音频是可选输出" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          {isConfigurationIncomplete && (
            <section role="status" className="flex flex-col gap-3 rounded-card border border-lemon/45 bg-lemon/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="ui-section-title text-ink">完成 LLM/TTS 配置后解锁全部能力</p>
                <p className="ui-body mt-1 text-ink-soft/75">密钥只保存在服务端；工作台不会在页面或接口中回显明文。</p>
              </div>
              <Link to="/settings" className="ui-pressable inline-flex min-h-10 items-center justify-center rounded-full bg-lemon px-4 py-2 ui-control-label text-ink shadow-btn">
                前往设置 →
              </Link>
            </section>
          )}

          <WorkbenchCard className="p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-lemon" />
                  <h2 className="font-display text-[17px] font-medium text-ink">从来源到带引用成稿</h2>
                </div>
                <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft/75">
                  第一步先建立项目并加入来源，再核验和选择证据，最终形成能回到原文的成稿。音频只是可选输出。
                </p>
              </div>
              <ol aria-label="内容创作流程" className="flex flex-wrap items-center gap-2 font-body text-[11px] text-ink-soft/70">
                <li className="rounded-full bg-lemon/25 px-2.5 py-1">1 加入来源</li>
                <li aria-hidden="true">→</li>
                <li className="rounded-full bg-lilac/25 px-2.5 py-1">2 核验并选择证据</li>
                <li aria-hidden="true">→</li>
                <li className="rounded-full bg-sage/25 px-2.5 py-1">3 带引用成稿</li>
              </ol>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <button
                type="button"
                aria-label="新建内容项目并填写 Brief"
                disabled={isCreatingProject}
                onClick={() => {
                  setCreateError(null);
                  setIsCreateProjectOpen(true);
                }}
                className="ui-pressable group rounded-card border border-sage/60 bg-sage/15 p-5 text-left hover:bg-sage/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-body text-[11px] font-medium text-ink-soft/70">从一个清晰问题开始</span>
                <span className="mt-2 block font-display text-[21px] font-medium leading-tight text-ink">新建内容项目</span>
                <span className="mt-2 block max-w-md font-body text-[13px] leading-relaxed text-ink-soft/75">
                  先定义受众、目标和创作角度，再加入来源、选择证据并形成带引用的版本化稿件。
                </span>
                <span className="mt-4 inline-flex font-body text-[12px] font-medium text-ink">{isCreatingProject ? '正在建立项目…' : '进入项目 Brief →'}</span>
              </button>
              <button
                type="button"
                onClick={handleStartNewsIntake}
                className="ui-pressable group rounded-card border border-lemon/50 bg-lemon/15 p-5 text-left hover:bg-lemon/25"
              >
                <span className="font-body text-[11px] font-medium text-ink-soft/70">AI 今日资讯</span>
                <span className="mt-2 block font-display text-[21px] font-medium leading-tight text-ink">采集资讯并写成稿</span>
                <span className="mt-2 block max-w-md font-body text-[13px] leading-relaxed text-ink-soft/75">
                  从 AI HOT 收集结构化资讯并快速试写；当前不会自动进入内容项目，适合先验证选题。
                </span>
                <span className="mt-4 inline-flex font-body text-[12px] font-medium text-ink">收集资讯并筛选 →</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/transcribe')}
                className="ui-pressable group rounded-card border border-lilac/55 bg-lilac/15 p-5 text-left hover:bg-lilac/25"
              >
                <span className="font-body text-[11px] font-medium text-ink-soft/70">已有音视频素材</span>
                <span className="mt-2 block font-display text-[21px] font-medium leading-tight text-ink">转录并整理内容</span>
                <span className="mt-2 block max-w-md font-body text-[13px] leading-relaxed text-ink-soft/75">
                  把录音、视频或播客转成可阅读文本，再继续校对、总结或导入写作。
                </span>
                <span className="mt-4 inline-flex font-body text-[12px] font-medium text-ink">上传素材并整理 →</span>
              </button>
            </div>
          </WorkbenchCard>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
            <div ref={newsIntakeRef} id="news-intake" className="scroll-mt-5">
              <QuickGenerate onRewriteComplete={handleRewriteComplete} />
            </div>

            <aside className="space-y-4">
              <WorkbenchCard className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sage" />
                    <h2 className="ui-section-title">最近项目</h2>
                  </div>
                  {contentProjects.length > 0 && <span className="ui-metadata text-ink-soft/65">继续上次创作</span>}
                </div>
                <ProjectList
                  projects={contentProjects.slice(0, 3)}
                  isLoading={isLoadingContentProjects}
                  error={projectsError}
                  emptyDescription="第一步：新建内容项目并填写最小 Brief。之后加入来源、选择证据并生成带引用成稿。"
                  onOpen={(projectId) => navigate(`/projects/${projectId}`)}
                  onRetry={() => void refreshProjects()}
                  onCreate={() => {
                    setCreateError(null);
                    setIsCreateProjectOpen(true);
                  }}
                />
              </WorkbenchCard>

              <WorkbenchCard className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sage" />
                    <h2 className="font-display text-[16px] font-medium text-ink">当前创作</h2>
                  </div>
                  {(isRewriting || script || currentBroadcast) && (
                    <span className={`rounded-full px-2.5 py-1 font-body text-[11px] font-medium text-ink ${isRewriting ? 'bg-lilac/30' : 'bg-sage/30'}`}>
                      {isRewriting
                        ? '正在提炼'
                        : activeProjectEditorContext
                          ? `项目口播稿 · 第 ${activeProjectEditorContext.revision.revision_number} 版`
                          : '临时口播草稿'}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border border-card-border bg-white/60 p-4">
                  <p className="font-display text-[17px] font-medium leading-snug text-ink">
                    {currentBroadcast?.title || (script ? '未命名稿件' : '还没有进行中的稿件')}
                  </p>
                  {(todayItems.length > 0 || script) && (
                    <p className="mt-2 font-body text-[11px] text-ink-soft/70">
                      {todayItems.length} 条素材 · {script.length} 字草稿
                    </p>
                  )}
                  <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft/75">
                    {isRewriting
                      ? '正在把已选资讯提炼为内容草稿，完成后会自动进入编辑器。'
                      : activeProjectEditorContext
                      ? '这是内容项目中已保存的确切口播版本；继续编辑时会保留版本来源，进入 TTS 后仍可追溯。'
                      : script
                      ? '这是未关联内容项目的临时草稿；可继续调整结构和表达，但不会自动拥有来源与版本记录。'
                      : '从上方选择一种素材来源；需要长期保存时，请新建内容项目。'}
                  </p>
                  {script && (
                    <ActionButton
                      tone="edit"
                      onClick={() => navigate(activeProjectEditorContext
                        ? getProjectEditorUrl(activeProjectEditorContext)
                        : '/editor')}
                      className="mt-3 w-full"
                    >
                      {activeProjectEditorContext ? '继续项目口播稿' : '继续提炼与写作'}
                    </ActionButton>
                  )}
                </div>
              </WorkbenchCard>

              <button
                type="button"
                onClick={() => navigate('/history')}
                className="ui-pressable w-full rounded-card border border-card-border bg-white/55 p-4 text-left hover:bg-white/75"
              >
                <span className="font-display text-[16px] font-medium text-ink">进入内容库</span>
                <span className="mt-1 block font-body text-[12px] leading-relaxed text-ink-soft/70">
                  阅读、整理或复用已经沉淀的成稿、音频与转录内容 →
                </span>
              </button>
            </aside>
          </div>
        </div>
      </main>

      <ModalShell
        isOpen={isCreateProjectOpen}
        title="新建内容项目"
        subtitle="先写下最小 Brief，确认值得做，再建立可持续积累的项目。"
        accent="sage"
        size="md"
        closeOnEscape={!isCreatingProject}
        initialFocusRef={projectTitleRef}
        onClose={() => {
          if (!isCreatingProject) setIsCreateProjectOpen(false);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateProject();
          }}
        >
          {createError && <p role="alert" className="rounded-xl border border-pink/25 bg-pink/10 p-3 ui-body text-ink">{createError}</p>}
          <label htmlFor="new-project-title" className="ui-control-label block text-ink-soft">
            项目名称
            <input
              ref={projectTitleRef}
              id="new-project-title"
              value={projectDraft.title}
              onChange={(event) => {
                setProjectDraft((current) => ({ ...current, title: event.target.value }));
                setCreateError(null);
              }}
              placeholder="例如：AI 如何改变独立创作？"
              className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-3 font-body text-[13px] text-ink outline-none focus:border-ink/20"
            />
          </label>
          <label htmlFor="new-project-topic" className="ui-control-label block text-ink-soft">
            核心问题
            <textarea
              id="new-project-topic"
              rows={3}
              value={projectDraft.topic}
              onChange={(event) => setProjectDraft((current) => ({ ...current, topic: event.target.value }))}
              placeholder="这次创作真正要回答什么？"
              className="mt-1 w-full resize-y rounded-xl border border-card-border bg-white/70 px-3.5 py-3 font-body text-[13px] leading-relaxed text-ink outline-none focus:border-ink/20"
            />
          </label>
          <label htmlFor="new-project-audience" className="ui-control-label block text-ink-soft">
            目标读者（可选）
            <input
              id="new-project-audience"
              value={projectDraft.audience}
              onChange={(event) => setProjectDraft((current) => ({ ...current, audience: event.target.value }))}
              placeholder="谁会因为这篇内容受益？"
              className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-3 font-body text-[13px] text-ink outline-none focus:border-ink/20"
            />
          </label>
          <button
            type="submit"
            disabled={isCreatingProject || !projectDraft.title.trim()}
            className="ui-transition w-full rounded-full bg-sage px-5 py-3 font-body text-[12px] font-medium text-ink shadow-btn hover:brightness-105 disabled:opacity-40"
          >
            {isCreatingProject ? '正在建立项目…' : '创建并进入项目'}
          </button>
        </form>
      </ModalShell>
    </div>
  );
};

export default SourceCollection;
