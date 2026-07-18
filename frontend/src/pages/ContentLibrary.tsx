import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { BroadcastLibrary } from '../components/Library/BroadcastLibrary';
import { TranscriptionLibrary } from '../components/Library/TranscriptionLibrary';
import { ClaimResearchWorkbench } from '../components/Research/ClaimResearchWorkbench';
import { ProjectList } from '../components/Projects/ProjectList';
import { WorkbenchCard } from '../components/ui/WorkbenchCard';
import useStore from '../store';

type LibraryTab = 'projects' | 'broadcasts' | 'transcriptions' | 'research';

const LIBRARY_TABS: { value: LibraryTab; label: string; description: string }[] = [
  { value: 'projects', label: '内容项目', description: '按项目继续 Brief、来源、写作与版本' },
  { value: 'broadcasts', label: '成稿与音频', description: '继续编辑、播放或复用已经完成的内容' },
  { value: 'transcriptions', label: '转录与整理', description: '阅读从音视频提取的文本与播客内容' },
  { value: 'research', label: '观点研究', description: '跨内容搜索、比较并组织可用观点' },
];

export const ContentLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const contentProjects = useStore((state) => state.contentProjects);
  const isLoadingContentProjects = useStore((state) => state.isLoadingContentProjects);
  const fetchContentProjects = useStore((state) => state.fetchContentProjects);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const requestedTab = searchParams.get('tab');
  const activeTab: LibraryTab = requestedTab === 'broadcasts' || requestedTab === 'transcriptions' || requestedTab === 'research' ? requestedTab : 'projects';

  const handleTabChange = (tab: LibraryTab) => {
    setSearchParams(tab === 'projects' ? {} : { tab });
  };

  const refreshProjects = useCallback(async () => {
    setProjectsError(null);
    try {
      await fetchContentProjects();
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : '获取内容项目失败');
    }
  }, [fetchContentProjects]);

  useEffect(() => {
    if (activeTab !== 'projects') return;
    let isCurrent = true;
    void fetchContentProjects()
      .then(() => { if (isCurrent) setProjectsError(null); })
      .catch((error: unknown) => {
        if (isCurrent) setProjectsError(error instanceof Error ? error.message : '获取内容项目失败');
      });
    return () => { isCurrent = false; };
  }, [activeTab, fetchContentProjects]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="内容库" subtitle="阅读、整理并继续使用已经沉淀的内容资产" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className={`mx-auto w-full min-w-0 space-y-4 ${activeTab === 'research' ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-[20px] font-medium text-ink">按内容阶段查找</h2>
              <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft/75">
                内容项目是主线；成稿音频、转录和观点继续作为可复用资产保留。
              </p>
            </div>
          </div>
          <nav aria-label="内容库分类" className="grid grid-cols-1 gap-1.5 rounded-card border border-card-border bg-white/55 p-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {LIBRARY_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleTabChange(tab.value)}
                aria-current={activeTab === tab.value ? 'page' : undefined}
                className={`ui-pressable rounded-2xl border px-4 py-3 text-left ${
                  activeTab === tab.value
                    ? 'border-ink/15 bg-white/90 shadow-sm'
                    : 'border-transparent bg-transparent hover:border-card-border hover:bg-white/45'
                }`}
              >
                <span className="block font-display text-[17px] font-medium leading-tight text-ink">{tab.label}</span>
                <span className="mt-1.5 block font-body text-[12px] leading-relaxed text-ink-soft/70">{tab.description}</span>
              </button>
            ))}
          </nav>

          {activeTab === 'projects' ? (
            <WorkbenchCard className="p-5">
              <div className="mb-4">
                <h2 className="ui-section-title">所有内容项目</h2>
                <p className="ui-body mt-1 text-ink-soft/70">打开项目后，会回到它的 Brief、来源和最新主稿版本。</p>
              </div>
              <ProjectList
                projects={contentProjects}
                isLoading={isLoadingContentProjects}
                error={projectsError}
                emptyDescription="先从工作台新建一个内容项目，再把来源和稿件逐步沉淀进来。"
                onOpen={(projectId) => navigate(`/projects/${projectId}`)}
                onRetry={() => void refreshProjects()}
              />
            </WorkbenchCard>
          ) : activeTab === 'broadcasts' ? <BroadcastLibrary /> : activeTab === 'transcriptions' ? <TranscriptionLibrary /> : <ClaimResearchWorkbench />}
        </div>
      </main>
    </div>
  );
};

export default ContentLibrary;
