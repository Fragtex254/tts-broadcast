import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { BroadcastLibrary } from '../components/Library/BroadcastLibrary';
import { TranscriptionLibrary } from '../components/Library/TranscriptionLibrary';

type LibraryTab = 'broadcasts' | 'transcriptions';

const LIBRARY_TABS: { value: LibraryTab; label: string; description: string }[] = [
  { value: 'broadcasts', label: '播报', description: '已保存的稿件与音频' },
  { value: 'transcriptions', label: '转录稿', description: '音视频转成的可编辑文本' },
];

export const ContentLibrary: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: LibraryTab = searchParams.get('tab') === 'transcriptions' ? 'transcriptions' : 'broadcasts';

  const handleTabChange = (tab: LibraryTab) => {
    setSearchParams(tab === 'broadcasts' ? {} : { tab });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="内容库" subtitle="统一管理播报成品与转录文稿" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <nav aria-label="内容库分类" className="grid grid-cols-1 gap-2 rounded-card border border-card-border bg-white/55 p-2 shadow-card sm:grid-cols-2">
            {LIBRARY_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleTabChange(tab.value)}
                aria-current={activeTab === tab.value ? 'page' : undefined}
                className={`rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${
                  activeTab === tab.value
                    ? 'border-ink/15 bg-white/90 shadow-card'
                    : 'border-transparent bg-transparent hover:border-card-border hover:bg-white/45'
                }`}
              >
                <span className="block font-display text-[17px] font-medium text-ink">{tab.label}</span>
                <span className="mt-1 block font-body text-[11px] text-ink-soft/60">{tab.description}</span>
              </button>
            ))}
          </nav>

          {activeTab === 'broadcasts' ? <BroadcastLibrary /> : <TranscriptionLibrary />}
        </div>
      </main>
    </div>
  );
};

export default ContentLibrary;
