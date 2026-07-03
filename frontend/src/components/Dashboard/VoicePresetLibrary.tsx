import React, { useEffect, useMemo, useState } from 'react';
import { useStore, type VoicePreset } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';

type PresetFilter = 'all' | VoicePreset['type'];

const FILTERS: { value: PresetFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'design', label: '设计' },
  { value: 'clone', label: '克隆' },
];

const TYPE_LABELS: Record<VoicePreset['type'], string> = {
  design: '设计',
  clone: '克隆',
};

const TYPE_STYLES: Record<VoicePreset['type'], string> = {
  design: 'bg-lilac/45',
  clone: 'bg-blush/55',
};

interface VoicePresetLibraryProps {
  onCreateDesign?: () => void;
  onCreateClone?: () => void;
}

export const VoicePresetLibrary: React.FC<VoicePresetLibraryProps> = ({
  onCreateDesign,
  onCreateClone,
}) => {
  const presets = useStore((s) => s.presets);
  const isLoadingPresets = useStore((s) => s.isLoadingPresets);
  const presetError = useStore((s) => s.presetError);
  const fetchPresets = useStore((s) => s.fetchPresets);
  const updatePreset = useStore((s) => s.updatePreset);
  const deletePreset = useStore((s) => s.deletePreset);

  const [filter, setFilter] = useState<PresetFilter>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStylePrompt, setEditStylePrompt] = useState('');
  const [editDesignPrompt, setEditDesignPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const filteredPresets = useMemo(() => (
    filter === 'all' ? presets : presets.filter((preset) => preset.type === filter)
  ), [filter, presets]);

  const selectedPreset = useMemo(() => (
    presets.find((preset) => preset.id === selectedId) || filteredPresets[0] || null
  ), [filteredPresets, presets, selectedId]);

  const startEdit = (preset: VoicePreset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditStylePrompt(preset.style_prompt || '');
    setEditDesignPrompt(preset.design_prompt || '');
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditStylePrompt('');
    setEditDesignPrompt('');
    setError(null);
  };

  const saveEdit = async (preset: VoicePreset) => {
    if (!editName.trim()) {
      setError('请输入预设名称');
      return;
    }
    if (preset.type === 'design' && !editDesignPrompt.trim()) {
      setError('请输入音色描述');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', editName.trim());
      formData.append('style_prompt', editStylePrompt.trim());
      if (preset.type === 'design') {
        formData.append('design_prompt', editDesignPrompt.trim());
      }
      await updatePreset(preset.id, formData);
      cancelEdit();
    } catch {
      setError('保存修改失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const removePreset = async (preset: VoicePreset) => {
    if (confirmDeleteId !== preset.id) {
      setConfirmDeleteId(preset.id);
      return;
    }
    await deletePreset(preset.id);
    setConfirmDeleteId(null);
    if (selectedId === preset.id) {
      setSelectedId(null);
    }
  };

  if (isLoadingPresets && presets.length === 0) {
    return (
      <div className="bg-white/70 rounded-card border border-card-border p-8 min-h-[460px] animate-pulse">
        <div className="h-7 w-40 bg-ink/5 rounded-xl mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-36 bg-ink/5 rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (presetError && presets.length === 0) {
    return (
      <div className="bg-pink/10 border border-pink/30 rounded-card p-6 min-h-[240px] flex items-center justify-center animate-shake">
        <div className="text-center">
          <p className="font-body text-[15px] text-ink">{presetError}</p>
          <button
            onClick={fetchPresets}
            className="mt-4 bg-sage hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium transition-all duration-150"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="bg-white/70 rounded-card border border-card-border p-8 min-h-[460px] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="font-display italic text-[20px] text-ink mb-2">暂无保存的预设</p>
            <div className="flex justify-center gap-2 mt-5">
              <button
                onClick={onCreateDesign}
                className="bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium transition-all duration-150"
              >
                音色设计
              </button>
              <button
                onClick={onCreateClone}
                className="bg-blush hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium transition-all duration-150"
              >
                声音克隆
              </button>
            </div>
          </div>
        </div>
        <aside className="bg-white/60 rounded-card border border-card-border p-5 min-h-[260px]" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
      <section className="bg-white/70 rounded-card border border-card-border p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blush" />
            <h3 className="font-display italic text-[18px] font-medium text-ink">已保存预设</h3>
            <span className="font-body text-[13px] text-ink-soft/70">{presets.length}/20</span>
          </div>
          <div className="flex gap-1 bg-white/70 rounded-xl border border-card-border p-1">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value)}
                className={`px-3.5 py-2 rounded-lg font-body text-[13px] font-medium transition-all duration-150 ${
                  filter === item.value
                    ? 'bg-white text-ink shadow-card border border-card-border'
                    : 'text-ink-soft hover:text-ink hover:bg-white/50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredPresets.map((preset) => {
            const isSelected = selectedPreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setSelectedId(preset.id);
                  setConfirmDeleteId(null);
                  if (editingId !== preset.id) cancelEdit();
                }}
                className={`text-left rounded-card border p-4 min-h-[150px] transition-all duration-150 ${
                  isSelected
                    ? 'bg-white shadow-card border-ink/20'
                    : 'bg-white/55 border-card-border hover:border-ink/15 hover:bg-white/75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2.5 py-1 rounded-full font-body text-[12px] text-ink ${TYPE_STYLES[preset.type]}`}>
                        {TYPE_LABELS[preset.type]}
                      </span>
                      {preset.trial_audio_path && (
                        <span className="px-2.5 py-1 rounded-full bg-sage/45 font-body text-[12px] text-ink">可试听</span>
                      )}
                    </div>
                    <h4 className="font-display text-[19px] font-medium text-ink truncate">{preset.name}</h4>
                  </div>
                </div>
                <p className="mt-3 font-body text-[13px] leading-6 text-ink-soft/80 line-clamp-2">
                  {preset.type === 'design'
                    ? preset.design_prompt || preset.style_prompt || '未填写音色描述'
                    : preset.style_prompt || '克隆音色'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="bg-white/80 rounded-card border border-card-border p-5 shadow-card sticky top-6">
        {selectedPreset && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className={`inline-flex px-2.5 py-1 rounded-full font-body text-[12px] text-ink ${TYPE_STYLES[selectedPreset.type]}`}>
                  {TYPE_LABELS[selectedPreset.type]}
                </span>
                <h3 className="mt-2 font-display text-[22px] font-medium text-ink truncate">{selectedPreset.name}</h3>
              </div>
            </div>

            {editingId === selectedPreset.id ? (
              <div className="space-y-3">
                <div>
                  <label className="font-body text-[13px] font-medium text-ink-soft mb-1.5 block">预设名称</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white/80 text-ink rounded-xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[14px] transition-colors"
                  />
                </div>
                <div>
                  <label className="font-body text-[13px] font-medium text-ink-soft mb-1.5 block">风格提示词</label>
                  <textarea
                    value={editStylePrompt}
                    onChange={(e) => setEditStylePrompt(e.target.value)}
                    className="w-full h-24 bg-white/80 text-ink rounded-xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[14px] leading-6 transition-colors"
                  />
                </div>
                {selectedPreset.type === 'design' && (
                  <div>
                    <label className="font-body text-[13px] font-medium text-ink-soft mb-1.5 block">音色描述</label>
                    <textarea
                      value={editDesignPrompt}
                      onChange={(e) => setEditDesignPrompt(e.target.value)}
                      className="w-full h-36 bg-white/80 text-ink rounded-xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[14px] leading-6 transition-colors"
                    />
                  </div>
                )}
                {error && (
                  <div className="bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[13px] font-body animate-shake">
                    {error}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={cancelEdit}
                    className="text-ink-soft hover:text-ink font-body text-[13px] transition-colors px-3 py-2"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => saveEdit(selectedPreset)}
                    disabled={isSaving}
                    className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium transition-all duration-150"
                  >
                    {isSaving ? '保存中...' : '保存修改'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedPreset.style_prompt && (
                  <div>
                    <span className="font-body text-[12px] font-medium text-ink-soft/70">风格</span>
                    <p className="mt-1 font-body text-[14px] leading-6 text-ink">{selectedPreset.style_prompt}</p>
                  </div>
                )}
                {selectedPreset.type === 'design' && selectedPreset.design_prompt && (
                  <div>
                    <span className="font-body text-[12px] font-medium text-ink-soft/70">音色描述</span>
                    <p className="mt-1 font-body text-[14px] leading-6 text-ink">{selectedPreset.design_prompt}</p>
                  </div>
                )}
                {selectedPreset.original_audio_path && (
                  <div>
                    <span className="font-body text-[12px] font-medium text-ink-soft/70">参考音频</span>
                    <div className="mt-2"><MiniAudioPlayer src={selectedPreset.original_audio_path} /></div>
                  </div>
                )}
                {selectedPreset.trial_audio_path && (
                  <div>
                    <span className="font-body text-[12px] font-medium text-ink-soft/70">试听音频</span>
                    <div className="mt-2"><MiniAudioPlayer src={selectedPreset.trial_audio_path} /></div>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => startEdit(selectedPreset)}
                    className="flex-1 bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium transition-all duration-150"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => removePreset(selectedPreset)}
                    className="bg-pink/85 hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium transition-all duration-150"
                  >
                    {confirmDeleteId === selectedPreset.id ? '确认删除' : '删除'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};

export default VoicePresetLibrary;
