import React, { useState, useCallback } from 'react';
import { voicePresetApi } from '../../services/api';
import { useStore } from '../../store';
import AudioUploader from './AudioUploader';
import MiniAudioPlayer from './MiniAudioPlayer';

// ============ 接口定义 ============

interface CloneTrialPanelProps {
  onVoiceCloneChange: (base64: string) => void;
  onStylePromptChange: (prompt: string) => void;
  voiceClone: string;
  stylePrompt: string;
}

// ============ 主组件 ============

export const CloneTrialPanel: React.FC<CloneTrialPanelProps> = ({
  onVoiceCloneChange,
  onStylePromptChange,
  voiceClone,
  stylePrompt,
}) => {
  const { presets, fetchPresets } = useStore();

  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [trialText, setTrialText] = useState('');
  const [isTrialLoading, setIsTrialLoading] = useState(false);
  const [trialAudioUrl, setTrialAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 保存对话框状态
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleFileSelect = useCallback(
    (file: File | null) => {
      if (!file) {
        setFileName(undefined);
        onVoiceCloneChange('');
        return;
      }
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // 去掉 data:audio/xxx;base64, 前缀，只保留 base64 部分
        const base64 = result.split(',')[1] ?? '';
        onVoiceCloneChange(base64);
      };
      reader.readAsDataURL(file);
    },
    [onVoiceCloneChange],
  );

  const handleTrial = async () => {
    if (!voiceClone) {
      setError('请先上传参考音频');
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
      const formData = new FormData();
      // base64 解码为 Blob 后作为文件发送
      const byteChars = atob(voiceClone);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'audio/wav' });
      formData.append('reference_audio', blob, fileName || 'reference.wav');
      formData.append('trial_text', trialText);
      if (stylePrompt.trim()) {
        formData.append('style_prompt', stylePrompt);
      }

      const response = await voicePresetApi.trialClone(formData);
      setTrialAudioUrl(response.data.audioUrl);
    } catch {
      setError('试听生成失败，请检查音频或稍后重试');
    } finally {
      setIsTrialLoading(false);
    }
  };

  const handleSave = async () => {
    if (!presetName.trim()) {
      setError('请输入预设名称');
      return;
    }
    if (!voiceClone) {
      setError('请先上传参考音频');
      return;
    }
    setError(null);
    setIsSaving(true);

    try {
      const formData = new FormData();
      const byteChars = atob(voiceClone);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'audio/wav' });
      formData.append('reference_audio', blob, fileName || 'reference.wav');
      formData.append('name', presetName.trim());
      formData.append('type', 'clone');
      formData.append('trial_text', trialText);
      if (stylePrompt.trim()) {
        formData.append('style_prompt', stylePrompt);
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
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* 参考音频上传 */}
      <AudioUploader onFileSelect={handleFileSelect} currentFileName={fileName} />

      {/* 风格提示词 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          风格提示词（可选）
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => onStylePromptChange(e.target.value)}
          placeholder="语速稍快，情绪饱满..."
          className="w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 试听文本 */}
      <div>
        <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
          试听文本
        </label>
        <textarea
          value={trialText}
          onChange={(e) => setTrialText(e.target.value)}
          placeholder="输入要试听的文本内容..."
          className="w-full h-16 bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[11px] transition-colors"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleTrial}
          disabled={isTrialLoading || !voiceClone}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 shadow-btn transition-all duration-150 uppercase tracking-wider flex items-center justify-center gap-2"
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
          className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 shadow-btn transition-all duration-150 uppercase tracking-wider"
        >
          💾
        </button>
      </div>

      {/* 试听音频播放器 */}
      <MiniAudioPlayer src={trialAudioUrl} />

      {/* 保存对话框 */}
      {showSaveDialog && (
        <div className="bg-white/60 rounded-2xl p-4 border border-card-border animate-fade-in">
          <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">
            预设名称
          </label>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="为这个音色取个名字..."
            className="w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors mb-3"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowSaveDialog(false);
                setPresetName('');
                setError(null);
              }}
              className="text-ink-soft hover:text-ink font-body text-[12px] transition-colors px-3 py-1.5"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !presetName.trim()}
              className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-3 py-2 shadow-btn transition-all duration-150 uppercase tracking-wider"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-pink/10 border border-pink/30 rounded-xl p-2 text-ink text-[10px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default CloneTrialPanel;
