import React, { useEffect, useState } from 'react';
import { useStore, type VoicePreset } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';

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
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

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

  const handleStartEdit = (e: React.MouseEvent, preset: VoicePreset) => {
    e.stopPropagation();
    setEditingId(preset.id);
    setExpandedId(preset.id);
    setEditName(preset.name);
    setEditStylePrompt(preset.style_prompt || '');
    setEditDesignPrompt(preset.design_prompt || '');
    setEditError(null);
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditName('');
    setEditStylePrompt('');
    setEditDesignPrompt('');
    setEditError(null);
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

  // 空状态
  if (presets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center animate-fade-in min-h-0">
        <p className="font-body text-[11px] text-ink-soft/70 text-center px-4">
          暂无保存的预设<br />
          <span className="text-[9px]">在克隆或设计页签中试听满意后可保存</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto mb-3 animate-fade-in min-h-0">
      <div className="flex items-center justify-between mb-1.5">
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70">
          已保存预设
        </label>
        <span className="font-body text-[10px] text-ink-soft/70">
          {presets.length}/20
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {presets.map((preset) => {
          const isExpanded = expandedId === preset.id;
          return (
            <div
              key={preset.id}
              className={`bg-white/50 border rounded-xl transition-all duration-150 cursor-pointer ${
                isExpanded
                  ? 'border-ink/20 shadow-card'
                  : 'border-card-border hover:border-ink/10'
              }`}
              onClick={() => handleItemClick(preset)}
            >
              {/* 头部：标签 + 名称 + 操作 */}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-body uppercase tracking-wider flex-shrink-0 ${TYPE_TAG_STYLES[preset.type]}`}>
                  {TYPE_TAG_LABELS[preset.type]}
                </span>
                <span className="font-body text-[12px] font-medium text-ink truncate flex-1">
                  {preset.name}
                </span>

                {/* 操作按钮 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => handleTogglePlay(e, preset)}
                    disabled={!preset.trial_audio_path}
                    className="text-[11px] text-ink-soft/70 hover:text-ink disabled:opacity-30 transition-colors px-1"
                    title="试听"
                  >
                    {playingId === preset.id ? '⏹' : '▶'}
                  </button>

                  <button
                    onClick={(e) => handleStartEdit(e, preset)}
                    className="text-[11px] text-ink-soft/70 hover:text-ink transition-colors px-1"
                    title="编辑预设"
                  >
                    ✎
                  </button>

                  {confirmDeleteId === preset.id ? (
                    <>
                      <button
                        onClick={(e) => handleDelete(e, preset.id)}
                        className="text-[10px] text-pink font-body font-medium transition-colors px-1"
                      >
                        确认
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                        className="text-[10px] text-ink-soft/70 hover:text-ink font-body transition-colors px-1"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => handleDelete(e, preset.id)}
                      className="text-[11px] text-ink-soft/30 hover:text-pink transition-colors px-1"
                      title="删除"
                    >
                      🗑
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
                          <div className="mt-0.5"><MiniAudioPlayer src={preset.trial_audio_path} /></div>
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
