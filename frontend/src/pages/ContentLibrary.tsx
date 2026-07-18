import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { BroadcastLibrary } from '../components/Library/BroadcastLibrary';
import { TranscriptionLibrary } from '../components/Library/TranscriptionLibrary';
import { ClaimResearchWorkbench } from '../components/Research/ClaimResearchWorkbench';

type LibraryTab = 'broadcasts' | 'transcriptions' | 'research';

const LIBRARY_TABS: { value: LibraryTab; label: string; description: string }[] = [
  { value: 'broadcasts', label: '成稿与音频', description: '继续编辑、播放或复用已经完成的内容' },
  { value: 'transcriptions', label: '转录与整理', description: '阅读从音视频提取的文本与播客内容' },
  { value: 'research', label: '观点与项目', description: '跨内容搜索、比较并组织可用观点' },
];

export const ContentLibrary: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: LibraryTab = requestedTab === 'transcriptions' || requestedTab === 'research' ? requestedTab : 'broadcasts';

  const handleTabChange = (tab: LibraryTab) => {
    setSearchParams(tab === 'broadcasts' ? {} : { tab });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="内容库" subtitle="阅读、整理并继续使用已经沉淀的内容资产" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className={`mx-auto w-full min-w-0 space-y-4 ${activeTab === 'research' ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-[20px] font-medium text-ink">按内容阶段查找</h2>
              <p className="mt-1 max-w-2xl font-body text-[13px] leading-relaxed text-ink-soft/75">
                成稿与音频用于发布和复用；转录内容用于继续整理；观点项目用于跨内容研究。
              </p>
            </div>
          </div>
          <nav aria-label="内容库分类" className="grid grid-cols-1 gap-1.5 rounded-card border border-card-border bg-white/55 p-1.5 sm:grid-cols-3">
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

          {activeTab === 'broadcasts' ? <BroadcastLibrary /> : activeTab === 'transcriptions' ? <TranscriptionLibrary /> : <ClaimResearchWorkbench />}
        </div>
      </main>
    </div>
  );
};

export default ContentLibrary;
