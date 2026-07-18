import React, { useEffect, useMemo, useState } from 'react';
import { useStore, type VoicePreset } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';
import { PresetCharacterImage } from './PresetCharacterImage';
import AudioDownloadLink from './AudioDownloadLink';

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
  const [editCharacterImageFile, setEditCharacterImageFile] = useState<File | null>(null);
  const [editRemoveCharacterImage, setEditRemoveCharacterImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingCloneId, setTogglingCloneId] = useState<number | null>(null);
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

  const editCharacterImagePreviewUrl = useMemo(() => (
    editCharacterImageFile ? URL.createObjectURL(editCharacterImageFile) : null
  ), [editCharacterImageFile]);

  useEffect(() => {
    if (!editCharacterImagePreviewUrl) return undefined;
    return () => URL.revokeObjectURL(editCharacterImagePreviewUrl);
  }, [editCharacterImagePreviewUrl]);

  const startEdit = (preset: VoicePreset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditStylePrompt(preset.style_prompt || '');
    setEditDesignPrompt(preset.design_prompt || '');
    setEditCharacterImageFile(null);
    setEditRemoveCharacterImage(false);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditStylePrompt('');
    setEditDesignPrompt('');
    setEditCharacterImageFile(null);
    setEditRemoveCharacterImage(false);
    setError(null);
  };

  const handleEditCharacterImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setEditCharacterImageFile(null);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('仅支持 PNG、JPG 或 WebP 角色立绘');
      event.target.value = '';
      return;
    }
    setError(null);
    setEditRemoveCharacterImage(false);
    setEditCharacterImageFile(file);
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
        formData.append('use_trial_audio_as_clone', preset.use_trial_audio_as_clone ? 'true' : 'false');
        if (editCharacterImageFile) {
          formData.append('character_image', editCharacterImageFile);
        } else if (editRemoveCharacterImage) {
          formData.append('remove_character_image', 'true');
        }
      }
      await updatePreset(preset.id, formData);
      cancelEdit();
    } catch {
      setError('保存修改失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleUseTrialAudioAsClone = async (preset: VoicePreset) => {
    if (preset.type !== 'design' || !preset.trial_audio_path || !preset.design_prompt) return;
    setTogglingCloneId(preset.id);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', preset.name);
      formData.append('style_prompt', preset.style_prompt || '');
      formData.append('design_prompt', preset.design_prompt);
      formData.append('use_trial_audio_as_clone', preset.use_trial_audio_as_clone ? 'false' : 'true');
      await updatePreset(preset.id, formData);
    } catch {
      setError('切换克隆生成失败，请稍后重试');
    } finally {
      setTogglingCloneId(null);
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
            className="mt-4 bg-sage hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium ui-transition duration-fast"
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
                className="bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium ui-transition duration-fast"
              >
                音色设计
              </button>
              <button
                onClick={onCreateClone}
                className="bg-blush hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium ui-transition duration-fast"
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
            <h3 className="font-display italic text-[18px] font-medium text-ink">已保存音色</h3>
            <span className="font-body text-[13px] text-ink-soft/70">{presets.length}/20</span>
          </div>
          <div className="flex gap-1 bg-white/70 rounded-xl border border-card-border p-1">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value)}
                className={`px-3.5 py-2 rounded-lg font-body text-[13px] font-medium ui-transition duration-fast ${
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
                className={`text-left rounded-card border p-4 min-h-[150px] ui-transition duration-fast ${
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
                      {preset.type === 'design' && preset.use_trial_audio_as_clone === 1 && (
                        <span className="px-2.5 py-1 rounded-full bg-lemon/45 font-body text-[12px] text-ink">克隆生成</span>
                      )}
                    </div>
                    <h4 className="font-display text-[19px] font-medium text-ink truncate">{preset.name}</h4>
                  </div>
                </div>
                {preset.character_image_path && (
                  <PresetCharacterImage
                    src={preset.character_image_path}
                    alt=""
                    className="mt-3 h-28 w-full rounded-xl border border-card-border bg-white/70"
                  />
                )}
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
                  <>
                    <div>
                      <label className="font-body text-[13px] font-medium text-ink-soft mb-1.5 block">音色描述</label>
                      <textarea
                        value={editDesignPrompt}
                        onChange={(e) => setEditDesignPrompt(e.target.value)}
                        className="w-full h-36 bg-white/80 text-ink rounded-xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[14px] leading-6 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="font-body text-[13px] font-medium text-ink-soft mb-1.5 block">角色立绘</label>
                      {(editCharacterImagePreviewUrl || (!editRemoveCharacterImage && selectedPreset.character_image_path)) && (
                        editCharacterImagePreviewUrl ? (
                          <img
                            src={editCharacterImagePreviewUrl}
                            alt=""
                            className="mb-2 h-32 w-full rounded-xl border border-card-border bg-white/70 object-contain"
                          />
                        ) : (
                          <PresetCharacterImage
                            src={selectedPreset.character_image_path || ''}
                            alt=""
                            className="mb-2 h-32 w-full rounded-xl border border-card-border bg-white/70"
                          />
                        )
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleEditCharacterImageChange}
                        className="block w-full cursor-pointer rounded-xl border border-card-border bg-white/80 px-3 py-2 font-body text-[12px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-lilac file:px-3 file:py-1.5 file:font-body file:text-[11px] file:text-ink"
                      />
                      {selectedPreset.character_image_path && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditCharacterImageFile(null);
                            setEditRemoveCharacterImage(true);
                          }}
                          className="mt-2 text-ink-soft hover:text-ink font-body text-[12px] transition-colors"
                        >
                          移除已保存立绘
                        </button>
                      )}
                    </div>
                  </>
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
                    className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium ui-transition duration-fast"
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
                {selectedPreset.type === 'design' && (
                  <button
                    type="button"
                    onClick={() => toggleUseTrialAudioAsClone(selectedPreset)}
                    disabled={!selectedPreset.trial_audio_path || togglingCloneId === selectedPreset.id}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 font-body text-[13px] ui-transition duration-fast ${
                      selectedPreset.use_trial_audio_as_clone
                        ? 'border-sage/40 bg-sage/25 text-ink'
                        : 'border-card-border bg-white/55 text-ink-soft hover:bg-white/80 hover:text-ink'
                    } disabled:opacity-40`}
                    title={selectedPreset.trial_audio_path ? '使用试听音频作为克隆音频生成' : '请先保存试听音频'}
                  >
                    <span>用试听音频走 voiceclone</span>
                    <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
                      selectedPreset.use_trial_audio_as_clone ? 'bg-sage' : 'bg-ink/10'
                    }`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                        selectedPreset.use_trial_audio_as_clone ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </span>
                  </button>
                )}
                {selectedPreset.character_image_path && (
                  <div>
                    <span className="font-body text-[12px] font-medium text-ink-soft/70">角色立绘</span>
                    <PresetCharacterImage
                      src={selectedPreset.character_image_path}
                      alt=""
                      className="mt-2 h-44 w-full rounded-xl border border-card-border bg-white/70"
                    />
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
                    <div className="mt-2 space-y-2">
                      <MiniAudioPlayer src={selectedPreset.trial_audio_path} />
                      <AudioDownloadLink src={selectedPreset.trial_audio_path} filename={`${selectedPreset.name}-trial.wav`} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => startEdit(selectedPreset)}
                    className="flex-1 bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium ui-transition duration-fast"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => removePreset(selectedPreset)}
                    className="bg-pink/85 hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[13px] font-medium ui-transition duration-fast"
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
