import React, { useState } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  script: string;
}

const VOICE_OPTIONS = [
  { value: 'mimo_default', label: 'MiMo-默认' },
  { value: '冰糖', label: '冰糖' },
  { value: '茉莉', label: '茉莉' },
  { value: '苏打', label: '苏打' },
  { value: '白桦', label: '白桦' },
  { value: 'Mia', label: 'Mia' },
  { value: 'Chloe', label: 'Chloe' },
  { value: 'Milo', label: 'Milo' },
  { value: 'Dean', label: 'Dean' },
];

const VOICE_TYPES = [
  { value: 'preset', label: '预设' },
  { value: 'clone', label: '克隆' },
  { value: 'design', label: '设计' },
];

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({ script }) => {
  const { generateBroadcast, splitScript, isGenerating, isSplitting, settings } = useStore();
  const [voiceType, setVoiceType] = useState('preset');
  const [selectedVoice, setSelectedVoice] = useState(settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState('');
  const [voiceDesign, setVoiceDesign] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSplitAndGenerate = async () => {
    if (!script) {
      setError('请先生成口播稿');
      return;
    }
    setError(null);
    try {
      const result = await generateBroadcast({
        text: script,
        voice: voiceType === 'preset' ? selectedVoice : undefined,
        voiceType,
        voiceDesign: voiceType === 'design' ? voiceDesign : undefined,
        voiceClone: voiceType === 'clone' ? voiceClone : undefined,
        stylePrompt: stylePrompt || undefined,
        mode: 'segmented',
      });
      await splitScript(result.broadcast.id);
    } catch (err) {
      setError('操作失败，请检查 API Key 或稍后重试');
      console.error(err);
    }
  };

  const isBusy = isGenerating || isSplitting;

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card px-5 py-3.5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* 标题 */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">语音生成</h3>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-5 bg-card-border" />

        {/* 音色类型选择 */}
        <div className="flex gap-1">
          {VOICE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoiceType(type.value)}
              className={`px-2.5 py-1 rounded-lg font-body text-[11px] font-medium transition-all duration-150 ${
                voiceType === type.value
                  ? 'bg-white/60 text-ink shadow-card border border-card-border'
                  : 'text-ink-soft hover:text-ink hover:bg-white/30'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* 预设音色横向选择 */}
        {voiceType === 'preset' && (
          <div className="flex gap-1 animate-fade-in">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.value}
                onClick={() => setSelectedVoice(voice.value)}
                className={`px-2.5 py-1.5 rounded-lg font-body text-[11px] transition-all duration-150 ${
                  selectedVoice === voice.value
                    ? 'bg-lemon/25 border border-ink/15 shadow-card text-ink font-medium'
                    : 'bg-white/50 border border-card-border text-ink-soft hover:border-ink/10'
                }`}
              >
                {voice.label}
              </button>
            ))}
          </div>
        )}

        {/* 声音克隆输入 */}
        {voiceType === 'clone' && (
          <input
            type="text"
            value={voiceClone}
            onChange={(e) => setVoiceClone(e.target.value)}
            placeholder="声音 ID"
            className="w-32 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in"
          />
        )}

        {/* 音色设计输入 */}
        {voiceType === 'design' && (
          <input
            type="text"
            value={voiceDesign}
            onChange={(e) => setVoiceDesign(e.target.value)}
            placeholder="音色描述"
            className="w-40 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in"
          />
        )}

        {/* 风格提示词（可选） */}
        {voiceType !== 'preset' && (
          <input
            type="text"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="风格提示词（可选）"
            className="w-36 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in"
          />
        )}

        {/* 生成按钮 */}
        <button
          onClick={handleSplitAndGenerate}
          disabled={isBusy || !script}
          className="ml-auto bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-4 py-2 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider flex items-center gap-2"
        >
          {isBusy ? (
            <>
              <span className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden">
                <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
              </span>
              {isSplitting ? '切分中...' : '生成中...'}
            </>
          ) : (
            '切分并生成语音'
          )}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[11px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceGenerator;
