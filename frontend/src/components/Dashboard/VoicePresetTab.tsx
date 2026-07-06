import React, { useEffect, useMemo, useState } from 'react';
import { useStore, type VoicePreset } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';
import { PresetCharacterImage } from './PresetCharacterImage';
import AudioDownloadLink from './AudioDownloadLink';

// ============ 接口定义 ============

interface VoicePresetTabProps {
  onApplyPreset?: (preset: VoicePreset) => void;
}

// ============ 常量 ============

const TYPE_TAG_STYLES: Record<VoicePreset['type'], string> = {
  clone: 'bg-blush/40 text-ink',
  design: 'bg-lilac/40 text-ink',
};

const TYPE_TAG_LABELS: Record<VoicePreset['type'], string> = {
  clone: '克隆',
  design: '设计',
};

// ============ 主组件 ============

export const VoicePresetTab: React.FC<VoicePresetTabProps> = ({ onApplyPreset }) => {
  const presets = useStore((s) => s.presets);
  const isLoadingPresets = useStore((s) => s.isLoadingPresets);
  const presetError = useStore((s) => s.presetError);
  const fetchPresets = useStore((s) => s.fetchPresets);
  const updatePreset = useStore((s) => s.updatePreset);
  const deletePreset = useStore((s) => s.deletePreset);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStylePrompt, setEditStylePrompt] = useState('');
  const [editDesignPrompt, setEditDesignPrompt] = useState('');
  const [editCharacterImageFile, setEditCharacterImageFile] = useState<File | null>(null);
  const [editRemoveCharacterImage, setEditRemoveCharacterImage] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [togglingCloneId, setTogglingCloneId] = useState<number | null>(null);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const editCharacterImagePreviewUrl = useMemo(() => (
    editCharacterImageFile ? URL.createObjectURL(editCharacterImageFile) : null
  ), [editCharacterImageFile]);

  useEffect(() => {
    if (!editCharacterImagePreviewUrl) return undefined;
    return () => URL.revokeObjectURL(editCharacterImagePreviewUrl);
  }, [editCharacterImagePreviewUrl]);

  const handleItemClick = (preset: VoicePreset) => {
    // 选中该预设作为当前音色
    onApplyPreset?.(preset);
    // 展开/收起详情
    setExpandedId(expandedId === preset.id ? null : preset.id);
  };

  const handleTogglePlay = (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation();
    if (!preset.trial_audio_path) return;
    setPlayingId((prev) => (prev === preset.id ? null : preset.id));
  };

  const handleToggleUseTrialAudioAsClone = async (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation();
    if (preset.type !== 'design' || !preset.trial_audio_path || !preset.design_prompt) return;

    setTogglingCloneId(preset.id);
    setEditError(null);
    try {
      const formData = new FormData();
      formData.append('name', preset.name);
      formData.append('style_prompt', preset.style_prompt || '');
      formData.append('design_prompt', preset.design_prompt);
      formData.append('use_trial_audio_as_clone', preset.use_trial_audio_as_clone ? 'false' : 'true');
      await updatePreset(preset.id, formData);
    } catch {
      setExpandedId(preset.id);
      setEditError('切换克隆生成失败，请稍后重试');
    } finally {
      setTogglingCloneId(null);
    }
  };

  const handleStartEdit = (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation();
    setEditingId(preset.id);
    setExpandedId(preset.id);
    setEditName(preset.name);
    setEditStylePrompt(preset.style_prompt || '');
    setEditDesignPrompt(preset.design_prompt || '');
    setEditCharacterImageFile(null);
    setEditRemoveCharacterImage(false);
    setEditError(null);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditName('');
    setEditStylePrompt('');
    setEditDesignPrompt('');
    setEditCharacterImageFile(null);
    setEditRemoveCharacterImage(false);
    setEditError(null);
  };

  const handleEditCharacterImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setEditCharacterImageFile(null);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setEditError('仅支持 PNG、JPG 或 WebP 角色立绘');
      event.target.value = '';
      return;
    }
    setEditError(null);
    setEditRemoveCharacterImage(false);
    setEditCharacterImageFile(file);
  };

  const handleSaveEdit = async (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation();
    if (!editName.trim()) {
      setEditError('请输入预设名称');
      return;
    }
    if (preset.type === 'design' && !editDesignPrompt.trim()) {
      setEditError('请输入音色描述');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
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
      handleCancelEdit();
    } catch {
      setEditError('保存修改失败，请稍后重试');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      try {
        await deletePreset(id);
        setConfirmDeleteId(null);
        if (playingId === id) setPlayingId(null);
        if (expandedId === id) setExpandedId(null);
      } catch {
        // 错误已在 store 中处理
      }
    } else {
      setConfirmDeleteId(id);
    }
  };

  if (isLoadingPresets && presets.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="min-h-44 rounded-card border border-card-border bg-white/55 p-4 animate-pulse">
            <div className="mb-4 h-6 w-24 rounded-lg bg-ink/5" />
            <div className="mb-3 h-6 w-32 rounded-lg bg-ink/5" />
            <div className="h-4 w-full rounded bg-ink/5" />
            <div className="mt-2 h-4 w-2/3 rounded bg-ink/5" />
          </div>
        ))}
      </div>
    );
  }

  if (presetError && presets.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-2xl border border-pink/30 bg-pink/10 p-6 animate-shake">
        <div className="text-center">
          <p className="font-body text-[13px] text-ink">{presetError}</p>
          <button
            type="button"
            onClick={fetchPresets}
            className="mt-4 rounded-xl bg-sage px-4 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn transition-all duration-150 hover:brightness-105"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  // 空状态
  if (presets.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center animate-fade-in">
        <div className="text-center">
          <p className="font-display italic text-[18px] text-ink-soft/60">暂无保存的预设</p>
          <p className="mt-2 font-body text-[12px] text-ink-soft/50">在音色预设页试听满意后保存</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">
          已保存预设
        </label>
        <span className="font-body text-[11px] text-ink-soft/70">
          {presets.length}/20
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {presets.map((preset) => {
          const isExpanded = expandedId === preset.id;
          return (
            <div
              key={preset.id}
              className={`min-h-48 cursor-pointer rounded-card border p-4 text-left transition-all duration-150 hover:-translate-y-px active:translate-y-0 ${
                isExpanded
                  ? 'border-ink/20 bg-white/85 shadow-card'
                  : 'border-card-border bg-white/60 hover:border-ink/15 hover:bg-white/80'
              }`}
              onClick={() => handleItemClick(preset)}
            >
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 font-body text-[11px] ${TYPE_TAG_STYLES[preset.type]}`}>
                        {TYPE_TAG_LABELS[preset.type]}
                      </span>
                      {preset.trial_audio_path && (
                        <span className="rounded-full bg-sage/35 px-2 py-0.5 font-body text-[11px] text-ink">可试听</span>
                      )}
                      {preset.type === 'design' && preset.use_trial_audio_as_clone === 1 && (
                        <span className="rounded-full bg-lemon/45 px-2 py-0.5 font-body text-[11px] text-ink">克隆生成</span>
                      )}
                    </div>
                    <h4 className="truncate font-display text-[19px] font-medium text-ink">{preset.name}</h4>
                  </div>
                  {preset.character_image_path && (
                    <PresetCharacterImage
                      src={preset.character_image_path}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded-xl border border-card-border bg-white/70"
                    />
                  )}
                </div>

                <p className="line-clamp-3 flex-1 font-body text-[12px] leading-5 text-ink-soft/75">
                  {preset.type === 'design'
                    ? preset.design_prompt || preset.style_prompt || '未填写音色描述'
                    : preset.style_prompt || '克隆音色'}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-card-border pt-3">
                  {preset.type === 'design' && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleUseTrialAudioAsClone(e, preset)}
                      disabled={!preset.trial_audio_path || togglingCloneId === preset.id}
                      className={`rounded-lg px-2.5 py-1.5 font-body text-[11px] transition-colors ${
                        preset.use_trial_audio_as_clone
                          ? 'bg-sage/45 text-ink'
                          : 'bg-white/50 text-ink-soft hover:bg-white/80 hover:text-ink disabled:hover:bg-white/50'
                      } disabled:opacity-35`}
                      title={preset.trial_audio_path ? '使用试听音频作为克隆音频生成' : '请先保存试听音频'}
                    >
                      克隆
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleTogglePlay(e, preset)}
                    disabled={!preset.trial_audio_path}
                    className="rounded-lg bg-white/50 px-2.5 py-1.5 font-body text-[11px] text-ink-soft transition-colors hover:bg-white/80 hover:text-ink disabled:opacity-35"
                    title="试听"
                  >
                    {playingId === preset.id ? '停止' : '试听'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleStartEdit(e, preset)}
                    className="rounded-lg bg-white/50 px-2.5 py-1.5 font-body text-[11px] text-ink-soft transition-colors hover:bg-white/80 hover:text-ink"
                    title="编辑预设"
                  >
                    编辑
                  </button>
                  {confirmDeleteId === preset.id ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, preset.id)}
                        className="rounded-lg bg-pink/15 px-2.5 py-1.5 font-body text-[11px] font-medium text-pink"
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="rounded-lg bg-white/50 px-2.5 py-1.5 font-body text-[11px] text-ink-soft transition-colors hover:bg-white/80 hover:text-ink"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, preset.id)}
                      className="ml-auto rounded-lg bg-white/50 px-2.5 py-1.5 font-body text-[11px] text-ink-soft/60 transition-colors hover:bg-pink/10 hover:text-pink"
                      title="删除"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {/* 展开的详情 */}
              {isExpanded && (
                <div className="px-3 pb-2.5 animate-fade-in space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  {/* 分隔线 */}
                  <div className="border-t border-card-border" />

                  {editingId === preset.id ? (
                    <div className="space-y-2 pt-1">
                      <div>
                        <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">预设名称</span>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1 w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
                        />
                      </div>
                      <div>
                        <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">风格提示词</span>
                        <input
                          type="text"
                          value={editStylePrompt}
                          onChange={(e) => setEditStylePrompt(e.target.value)}
                          placeholder="可选"
                          className="mt-1 w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
                        />
                      </div>
                      {preset.type === 'design' && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">音色描述</span>
                          <textarea
                            value={editDesignPrompt}
                            onChange={(e) => setEditDesignPrompt(e.target.value)}
                            className="mt-1 w-full h-20 bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[11px] transition-colors"
                          />
                        </div>
                      )}
                      {preset.type === 'design' && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">角色立绘</span>
                          {(editCharacterImagePreviewUrl || (!editRemoveCharacterImage && preset.character_image_path)) && (
                            editCharacterImagePreviewUrl ? (
                              <img
                                src={editCharacterImagePreviewUrl}
                                alt=""
                                className="mt-1 h-24 w-full rounded-xl border border-card-border bg-white/70 object-contain"
                              />
                            ) : (
                              <PresetCharacterImage
                                src={preset.character_image_path || ''}
                                alt=""
                                className="mt-1 h-24 w-full rounded-xl border border-card-border bg-white/70"
                              />
                            )
                          )}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleEditCharacterImageChange}
                            className="mt-1 block w-full cursor-pointer rounded-xl border border-card-border bg-white/70 px-2 py-1.5 font-body text-[10px] text-ink file:mr-2 file:rounded-lg file:border-0 file:bg-lilac file:px-2 file:py-1 file:font-body file:text-[10px] file:text-ink"
                          />
                          {preset.character_image_path && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditCharacterImageFile(null);
                                setEditRemoveCharacterImage(true);
                              }}
                              className="mt-1 font-body text-[10px] text-ink-soft/70 hover:text-ink"
                            >
                              移除已保存立绘
                            </button>
                          )}
                        </div>
                      )}
                      {editError && (
                        <div className="bg-pink/10 border border-pink/30 rounded-xl p-2 text-ink text-[10px] font-body animate-shake">
                          {editError}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCancelEdit}
                          className="text-ink-soft hover:text-ink font-body text-[11px] transition-colors px-2 py-1.5"
                        >
                          取消
                        </button>
                        <button
                          onClick={(e) => handleSaveEdit(e, preset)}
                          disabled={isSavingEdit}
                          className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[10px] rounded-xl px-3 py-1.5 shadow-btn transition-all duration-150 uppercase tracking-wider"
                        >
                          {isSavingEdit ? '保存中...' : '保存修改'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>

                      {/* 风格提示词 */}
                      {preset.style_prompt && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">风格</span>
                          <p className="font-body text-[10px] text-ink-soft/70">{preset.style_prompt}</p>
                        </div>
                      )}

                      {/* 设计描述 */}
                      {preset.type === 'design' && preset.design_prompt && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">音色描述</span>
                          <p className="font-body text-[10px] text-ink-soft/70">{preset.design_prompt}</p>
                        </div>
                      )}

                      {preset.type === 'design' && preset.trial_audio_path && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleUseTrialAudioAsClone(e, preset)}
                          disabled={togglingCloneId === preset.id}
                          className={`flex w-full items-center justify-between rounded-xl border px-2.5 py-2 font-body text-[10px] transition-all duration-150 ${
                            preset.use_trial_audio_as_clone
                              ? 'border-sage/40 bg-sage/25 text-ink'
                              : 'border-card-border bg-white/45 text-ink-soft hover:bg-white/70 hover:text-ink'
                          } disabled:opacity-40`}
                        >
                          <span>用试听音频走 voiceclone</span>
                          <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                            preset.use_trial_audio_as_clone ? 'bg-sage' : 'bg-ink/10'
                          }`}>
                            <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${
                              preset.use_trial_audio_as_clone ? 'translate-x-3' : 'translate-x-0'
                            }`} />
                          </span>
                        </button>
                      )}

                      {preset.type === 'design' && preset.character_image_path && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">角色立绘</span>
                          <PresetCharacterImage
                            src={preset.character_image_path}
                            alt=""
                            className="mt-1 h-24 w-full rounded-xl border border-card-border bg-white/70"
                          />
                        </div>
                      )}

                      {/* 原始音频（克隆） */}
                      {preset.type === 'clone' && preset.original_audio_path && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">参考音频</span>
                          <div className="mt-0.5"><MiniAudioPlayer src={preset.original_audio_path} /></div>
                        </div>
                      )}

                      {/* 试听音频 */}
                      {preset.trial_audio_path && (
                        <div>
                          <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/70">试听音频</span>
                          <div className="mt-0.5 space-y-1">
                            <MiniAudioPlayer src={preset.trial_audio_path} />
                            <AudioDownloadLink
                              src={preset.trial_audio_path}
                              filename={`${preset.name}-trial.wav`}
                              compact
                              onClick={(event) => event.stopPropagation()}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 内联播放器（非展开态的快速试听） */}
              {!isExpanded && playingId === preset.id && preset.trial_audio_path && (
                <div className="px-3 pb-2">
                  <MiniAudioPlayer src={preset.trial_audio_path} onEnded={() => setPlayingId(null)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VoicePresetTab;
