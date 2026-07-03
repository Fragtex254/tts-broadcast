import React, { useEffect, useState } from 'react';
import { Header } from '../components/Layout/Header';
import { CloneTrialPanel } from '../components/Dashboard/CloneTrialPanel';
import { DesignTrialPanel } from '../components/Dashboard/DesignTrialPanel';
import { VoicePresetLibrary } from '../components/Dashboard/VoicePresetLibrary';
import useStore from '../store';

type PresetPageTab = 'saved' | 'design' | 'clone';

const PAGE_TABS: { value: PresetPageTab; label: string }[] = [
  { value: 'saved', label: '已保存' },
  { value: 'design', label: '音色设计' },
  { value: 'clone', label: '声音克隆' },
];

interface RecentPresetPanelProps {
  onOpenSaved: () => void;
}

const RecentPresetPanel: React.FC<RecentPresetPanelProps> = ({ onOpenSaved }) => {
  const presets = useStore((s) => s.presets);
  const recentPresets = presets.slice(0, 4);

  return (
    <aside className="bg-white/70 rounded-card border border-card-border p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[17px] font-medium text-ink">最近预设</h3>
        </div>
        <button
          onClick={onOpenSaved}
          className="text-ink-soft hover:text-ink font-body text-[13px] transition-colors"
        >
          管理
        </button>
      </div>
      {recentPresets.length === 0 ? (
        <div className="py-14 text-center">
          <p className="font-display italic text-[17px] text-ink-soft/60">暂无预设</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recentPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={onOpenSaved}
              className="w-full text-left bg-white/60 hover:bg-white/85 border border-card-border hover:border-ink/15 rounded-card p-4 transition-all duration-150"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-1 rounded-full font-body text-[12px] text-ink ${preset.type === 'design' ? 'bg-lilac/45' : 'bg-blush/55'}`}>
                  {preset.type === 'design' ? '设计' : '克隆'}
                </span>
                {preset.trial_audio_path && (
                  <span className="px-2.5 py-1 rounded-full bg-sage/45 font-body text-[12px] text-ink">可试听</span>
                )}
              </div>
              <h4 className="font-display text-[18px] font-medium text-ink truncate">{preset.name}</h4>
              <p className="mt-2 font-body text-[13px] leading-6 text-ink-soft/75 line-clamp-2">
                {preset.type === 'design'
                  ? preset.design_prompt || preset.style_prompt || '未填写音色描述'
                  : preset.style_prompt || '克隆音色'}
              </p>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
};

export const VoicePresets: React.FC = () => {
  const fetchPresets = useStore((s) => s.fetchPresets);
  const presets = useStore((s) => s.presets);
  const [activeTab, setActiveTab] = useState<PresetPageTab>('saved');
  const [voiceDesign, setVoiceDesign] = useState('');
  const [voiceClone, setVoiceClone] = useState('');
  const [designStylePrompt, setDesignStylePrompt] = useState('');
  const [cloneStylePrompt, setCloneStylePrompt] = useState('');
  const [optimizeTextPreview, setOptimizeTextPreview] = useState(false);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="音色预设" subtitle="管理克隆、设计和已保存音色" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div
            className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both' }}
          >
            <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blush" />
                <h3 className="font-display italic text-[18px] font-medium text-ink">音色工作台</h3>
                <span className="font-body text-[13px] text-ink-soft/70">{presets.length}/20</span>
              </div>
              <div className="flex gap-1 bg-white/60 rounded-2xl border border-card-border p-1.5">
                {PAGE_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`min-w-24 px-4 py-2.5 rounded-xl font-body text-[14px] font-medium transition-all duration-150 ${
                      activeTab === tab.value
                        ? 'bg-white text-ink shadow-card border border-card-border'
                        : 'text-ink-soft hover:text-ink hover:bg-white/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[560px]">
              {activeTab === 'saved' && (
                <VoicePresetLibrary
                  onCreateDesign={() => setActiveTab('design')}
                  onCreateClone={() => setActiveTab('clone')}
                />
              )}

              {activeTab === 'design' && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,760px)_minmax(300px,1fr)] gap-5 items-start">
                  <div className="bg-white/70 rounded-card border border-card-border p-5">
                    <DesignTrialPanel
                      voiceDesign={voiceDesign}
                      stylePrompt={designStylePrompt}
                      optimizeTextPreview={optimizeTextPreview}
                      onVoiceDesignChange={setVoiceDesign}
                      onStylePromptChange={setDesignStylePrompt}
                      onOptimizeTextPreviewChange={setOptimizeTextPreview}
                    />
                  </div>
                  <RecentPresetPanel onOpenSaved={() => setActiveTab('saved')} />
                </div>
              )}

              {activeTab === 'clone' && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,760px)_minmax(300px,1fr)] gap-5 items-start">
                  <div className="bg-white/70 rounded-card border border-card-border p-5">
                    <CloneTrialPanel
                      voiceClone={voiceClone}
                      stylePrompt={cloneStylePrompt}
                      onVoiceCloneChange={setVoiceClone}
                      onStylePromptChange={setCloneStylePrompt}
                    />
                  </div>
                  <RecentPresetPanel onOpenSaved={() => setActiveTab('saved')} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VoicePresets;
