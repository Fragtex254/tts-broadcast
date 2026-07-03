import React, { useState } from 'react';
import { voicePresetApi } from '../../services/api';
import { getApiErrorMessage } from '../../services/apiError';
import { useStore } from '../../store';
import MiniAudioPlayer from './MiniAudioPlayer';

// ============ 接口定义 ============

interface DesignTrialPanelProps {
  onVoiceDesignChange: (design: string) => void;
  onStylePromptChange: (prompt: string) => void;
  onOptimizeTextPreviewChange: (enabled: boolean) => void;
  voiceDesign: string;
  stylePrompt: string;
  optimizeTextPreview: boolean;
}

// ============ 主组件 ============

export const DesignTrialPanel: React.FC<DesignTrialPanelProps> = ({
  onVoiceDesignChange,
  onStylePromptChange,
  onOptimizeTextPreviewChange,
  voiceDesign,
  stylePrompt,
  optimizeTextPreview,
}) => {
  const presets = useStore((s) => s.presets);
  const fetchPresets = useStore((s) => s.fetchPresets);

  const [trialText, setTrialText] = useState('');
  const [isTrialLoading, setIsTrialLoading] = useState(false);
  const [trialAudioUrl, setTrialAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 保存对话框状态
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      {/* 音色设计描述 */}
      <div>
        <label className="font-body text-[14px] font-medium text-ink-soft mb-2 block">
          音色设计描述
        </label>
        <textarea
          value={voiceDesign}
          onChange={(e) => onVoiceDesignChange(e.target.value)}
          placeholder="描述你想要的音色特征，如：年轻女性，声音清脆明亮，带有笑意..."
          className="w-full h-36 bg-white/80 text-ink rounded-2xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[15px] leading-7 transition-colors"
        />
      </div>

      {/* 风格提示词 */}
      <div>
        <label className="font-body text-[14px] font-medium text-ink-soft mb-2 block">
          风格提示词（可选）
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => onStylePromptChange(e.target.value)}
          placeholder="语速稍快，情绪饱满..."
          className="w-full bg-white/80 text-ink rounded-2xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[15px] transition-colors"
        />
      </div>

      {/* 试听文本 */}
      <div>
        <label className="font-body text-[14px] font-medium text-ink-soft mb-2 block">
          试听文本
        </label>
        <textarea
          value={trialText}
          onChange={(e) => setTrialText(e.target.value)}
          placeholder="输入要试听的文本内容..."
          className="w-full h-28 bg-white/80 text-ink rounded-2xl px-4 py-3 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[15px] leading-7 transition-colors"
        />
      </div>

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
      <MiniAudioPlayer src={trialAudioUrl} />

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
    </div>
  );
};

export default DesignTrialPanel;
