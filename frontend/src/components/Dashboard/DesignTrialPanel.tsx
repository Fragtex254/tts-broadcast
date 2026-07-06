import React, { useEffect, useMemo, useState } from 'react';
import { voicePresetApi } from '../../services/api';
import { getApiErrorMessage } from '../../services/apiError';
import { useStore } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';
import LongTextField from './LongTextField';
import AudioDownloadLink from './AudioDownloadLink';

// ============ 接口定义 ============

interface DesignTrialPanelProps {
  onVoiceDesignChange: (design: string) => void;
  onStylePromptChange: (prompt: string) => void;
  onOptimizeTextPreviewChange: (enabled: boolean) => void;
  onCharacterImageChange: (file: File | null) => void;
  voiceDesign: string;
  stylePrompt: string;
  optimizeTextPreview: boolean;
  characterImageFile: File | null;
}

// ============ 主组件 ============

export const DesignTrialPanel: React.FC<DesignTrialPanelProps> = ({
  onVoiceDesignChange,
  onStylePromptChange,
  onOptimizeTextPreviewChange,
  onCharacterImageChange,
  voiceDesign,
  stylePrompt,
  optimizeTextPreview,
  characterImageFile,
}) => {
  const presets = useStore((s) => s.presets);
  const fetchPresets = useStore((s) => s.fetchPresets);

  const [trialText, setTrialText] = useState('');
  const [isTrialLoading, setIsTrialLoading] = useState(false);
  const [trialAudioUrl, setTrialAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characterSummary, setCharacterSummary] = useState('');
  const [isInferring, setIsInferring] = useState(false);
  const [isCharacterPanelOpen, setIsCharacterPanelOpen] = useState(false);

  // 保存对话框状态
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const characterImagePreviewUrl = useMemo(() => (
    characterImageFile ? URL.createObjectURL(characterImageFile) : null
  ), [characterImageFile]);

  useEffect(() => {
    if (!characterImagePreviewUrl) return undefined;
    return () => URL.revokeObjectURL(characterImagePreviewUrl);
  }, [characterImagePreviewUrl]);

  const handleCharacterImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setCharacterSummary('');
      onCharacterImageChange(null);
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('仅支持 PNG、JPG 或 WebP 角色立绘');
      event.target.value = '';
      return;
    }
    setError(null);
    setCharacterSummary('');
    onCharacterImageChange(file);
  };

  const handleInferFromImage = async () => {
    if (!characterImageFile) {
      setError('请先上传角色立绘');
      return;
    }

    setError(null);
    setIsInferring(true);
    try {
      const formData = new FormData();
      formData.append('character_image', characterImageFile);
      const response = await voicePresetApi.inferDesignFromImage(formData);
      const designPrompt = String(response.data.designPrompt || '').trim();
      if (!designPrompt) {
        setError('反推结果为空，请换一张更清晰的立绘重试');
        return;
      }
      onVoiceDesignChange(designPrompt);
      const inferredStylePrompt = String(response.data.stylePrompt || '').trim();
      if (inferredStylePrompt) {
        onStylePromptChange(inferredStylePrompt);
      }
      setCharacterSummary(String(response.data.characterSummary || '').trim());
      setTrialAudioUrl(null);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, '立绘反推失败，请确认当前 LLM 模型支持视觉输入'));
    } finally {
      setIsInferring(false);
    }
  };

  const handleSuggestTrialTags = async (text: string) => {
    const response = await voicePresetApi.suggestTrialTextTags({
      text,
      voice_design: voiceDesign,
      style_prompt: stylePrompt,
    });
    const inferredStylePrompt = String(response.data.stylePrompt || '').trim();
    if (inferredStylePrompt) {
      onStylePromptChange(inferredStylePrompt);
    }
    return String(response.data.taggedText || text);
  };

  const handleTrial = async () => {
    if (!voiceDesign.trim()) {
      setError('请输入音色设计描述');
      return;
    }
    if (!trialText.trim()) {
      setError('请输入试听文本');
      return;
    }
    setError(null);
    setIsTrialLoading(true);
    setTrialAudioUrl(null);

    try {
      const response = await voicePresetApi.trialDesign({
        design_prompt: voiceDesign,
        trial_text: trialText,
        style_prompt: stylePrompt.trim() || undefined,
        optimize_text_preview: optimizeTextPreview,
      });
      setTrialAudioUrl(response.data.audioUrl);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, '试听生成失败，请检查描述或稍后重试'));
    } finally {
      setIsTrialLoading(false);
    }
  };

  const handleSave = async () => {
    if (!presetName.trim()) {
      setError('请输入预设名称');
      return;
    }
    if (!voiceDesign.trim()) {
      setError('请输入音色设计描述');
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append('name', presetName.trim());
      formData.append('type', 'design');
      formData.append('design_prompt', voiceDesign);
      if (stylePrompt.trim()) {
        formData.append('style_prompt', stylePrompt);
      }
      if (characterImageFile) {
        formData.append('character_image', characterImageFile);
      }
      // 附带试听音频
      if (trialAudioUrl) {
        const audioRes = await fetch(trialAudioUrl);
        const audioBlob = await audioRes.blob();
        formData.append('trial_audio', audioBlob, 'trial.wav');
      }

      await voicePresetApi.create(formData);
      await fetchPresets();
      setShowSaveDialog(false);
      setPresetName('');
    } catch {
      setError('保存预设失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = presets.length < 20 && !!trialAudioUrl;

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-card-border bg-white/65 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-card-border bg-white/75">
            {characterImagePreviewUrl ? (
              <img
                src={characterImagePreviewUrl}
                alt="角色立绘预览"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="font-body text-[11px] text-ink-soft/55">立绘</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-body text-[13px] font-medium text-ink">
              角色立绘反推
            </div>
            <div className="truncate font-body text-[12px] leading-5 text-ink-soft/70">
              {characterSummary || (characterImageFile ? characterImageFile.name : '未选择立绘')}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsCharacterPanelOpen(true)}
          className="shrink-0 rounded-xl bg-lilac px-4 py-2.5 font-body text-[13px] font-medium text-ink shadow-btn transition-all duration-150 hover:brightness-105"
        >
          打开面板
        </button>
      </div>

      <LongTextField
        label="音色设计描述"
        value={voiceDesign}
        onChange={onVoiceDesignChange}
        placeholder="描述你想要的音色特征，如：年轻女性，声音清脆明亮，带有笑意..."
        minHeightClass="min-h-44"
      />

      <LongTextField
        label="风格提示词（可选）"
        value={stylePrompt}
        onChange={onStylePromptChange}
        placeholder="语速稍快，情绪饱满..."
        minHeightClass="min-h-28"
      />

      <LongTextField
        label="试听文本"
        value={trialText}
        onChange={setTrialText}
        placeholder="输入要试听的文本内容..."
        minHeightClass="min-h-32"
        enableAudioTagEditor
        onSuggestAudioTags={handleSuggestTrialTags}
      />

      <label className="flex items-start gap-3 bg-white/65 rounded-2xl border border-card-border px-4 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={optimizeTextPreview}
          onChange={(e) => onOptimizeTextPreviewChange(e.target.checked)}
          className="mt-1 h-4 w-4 accent-lilac"
        />
        <span className="flex-1">
          <span className="block font-body text-[14px] font-medium text-ink">优化试听文本</span>
          <span className="block font-body text-[13px] text-ink-soft/70 leading-6 mt-0.5">
            允许 MiMo 根据音色描述润色或扩写试听文本；关闭时严格使用上方文本。
          </span>
        </span>
      </label>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleTrial}
          disabled={isTrialLoading || !voiceDesign.trim()}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[14px] rounded-2xl px-4 py-3 shadow-btn transition-all duration-150 flex items-center justify-center gap-2"
        >
          {isTrialLoading ? (
            <>
              <span className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden">
                <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
              </span>
              生成中...
            </>
          ) : (
            '试听'
          )}
        </button>
        <button
          onClick={() => setShowSaveDialog(true)}
          disabled={!canSave}
          title={presets.length >= 20 ? '预设已满（上限 20）' : !trialAudioUrl ? '请先试听' : '保存预设'}
          className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[14px] rounded-2xl px-5 py-3 shadow-btn transition-all duration-150"
        >
          保存预设
        </button>
      </div>

      {/* 试听音频播放器 */}
      {trialAudioUrl && (
        <div className="space-y-2">
          <MiniAudioPlayer src={trialAudioUrl} />
          <AudioDownloadLink src={trialAudioUrl} filename="design-trial.wav" />
        </div>
      )}

      {/* 保存对话框 */}
      {showSaveDialog && (
        <div className="bg-white/70 rounded-2xl p-5 border border-card-border animate-fade-in">
          <label className="font-body text-[14px] font-medium text-ink-soft mb-2 block">
            预设名称
          </label>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="为这个音色取个名字..."
            className="w-full bg-white/80 text-ink rounded-2xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[15px] transition-colors mb-4"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowSaveDialog(false);
                setPresetName('');
                setError(null);
              }}
              className="text-ink-soft hover:text-ink font-body text-[14px] transition-colors px-3 py-2"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !presetName.trim()}
              className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[14px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[13px] font-body animate-shake">
          {error}
        </div>
      )}

      {isCharacterPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="character-panel-title"
        >
          <div className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-card-border bg-paper p-5 shadow-card">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="character-panel-title" className="font-body text-[18px] font-semibold text-ink">
                  角色立绘反推
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCharacterPanelOpen(false)}
                className="rounded-xl border border-card-border bg-white/70 px-3 py-2 font-body text-[13px] text-ink-soft transition-colors hover:text-ink"
              >
                关闭
              </button>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-48 w-full items-center justify-center overflow-hidden rounded-2xl border border-card-border bg-white/70 sm:w-40">
                {characterImagePreviewUrl ? (
                  <img
                    src={characterImagePreviewUrl}
                    alt="角色立绘预览"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="px-4 text-center font-body text-[12px] leading-5 text-ink-soft/60">
                    上传角色立绘
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-2 block font-body text-[14px] font-medium text-ink-soft">
                  角色立绘
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleCharacterImageChange}
                  className="block w-full cursor-pointer rounded-xl border border-card-border bg-white/80 px-3 py-2 font-body text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-lilac file:px-3 file:py-1.5 file:font-body file:text-[12px] file:text-ink"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleInferFromImage}
                    disabled={isInferring || !characterImageFile}
                    className="rounded-xl bg-lilac px-4 py-2.5 font-body text-[13px] font-medium text-ink shadow-btn transition-all duration-150 hover:brightness-105 disabled:opacity-40"
                  >
                    {isInferring ? '反推中...' : '反推音色描述'}
                  </button>
                  {characterImageFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setCharacterSummary('');
                        onCharacterImageChange(null);
                      }}
                      className="px-3 py-2 font-body text-[13px] text-ink-soft transition-colors hover:text-ink"
                    >
                      移除立绘
                    </button>
                  )}
                </div>
                {characterSummary && (
                  <p className="mt-3 rounded-xl border border-card-border bg-white/55 px-3 py-2 font-body text-[12px] leading-5 text-ink-soft">
                    {characterSummary}
                  </p>
                )}
                {error && (
                  <div className="mt-3 rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[13px] text-ink">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignTrialPanel;
