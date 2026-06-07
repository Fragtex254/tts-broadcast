import React, { useState } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  script: string;
}

const VOICE_OPTIONS = [
  { value: 'mimo_default', label: 'MiMo-默认', description: '默认音色' },
  { value: '冰糖', label: '冰糖', description: '中文女声' },
  { value: '茉莉', label: '茉莉', description: '中文女声' },
  { value: '苏打', label: '苏打', description: '中文男声' },
  { value: '白桦', label: '白桦', description: '中文男声' },
  { value: 'Mia', label: 'Mia', description: '英文女声' },
  { value: 'Chloe', label: 'Chloe', description: '英文女声' },
  { value: 'Milo', label: 'Milo', description: '英文男声' },
  { value: 'Dean', label: 'Dean', description: '英文男声' },
];

const VOICE_TYPES = [
  { value: 'preset', label: '预设音色' },
  { value: 'clone', label: '声音克隆' },
  { value: 'design', label: '音色设计' },
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
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}>
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2 h-2 rounded-full bg-blush" />
        <h3 className="font-display italic text-[14px] font-medium text-ink-soft">语音生成</h3>
      </div>

      {/* 音色类型选择 */}
      <div className="mb-4">
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">音色类型</label>
        <div className="flex gap-2">
          {VOICE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoiceType(type.value)}
              className={`px-4 py-2 rounded-xl font-body text-[12px] font-medium transition-all duration-150 ${
                voiceType === type.value
                  ? 'bg-white/60 text-ink shadow-card border border-card-border'
                  : 'text-ink-soft hover:text-ink hover:bg-white/30'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* 预设音色网格 */}
      {voiceType === 'preset' && (
        <div className="mb-4 animate-fade-in">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">选择音色</label>
          <div className="grid grid-cols-3 gap-2">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.value}
                onClick={() => setSelectedVoice(voice.value)}
                className={`p-2.5 rounded-2xl text-center transition-all duration-150 ${
                  selectedVoice === voice.value
                    ? 'bg-lemon/25 border border-ink/15 shadow-card'
                    : 'bg-white/50 border border-card-border hover:border-ink/10'
                }`}
              >
                <span className="font-display text-[15px] font-medium text-ink block">{voice.label}</span>
                <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40 mt-0.5 block">{voice.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 声音克隆 */}
      {voiceType === 'clone' && (
        <div className="mb-4 animate-fade-in">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">克隆声音 ID</label>
          <input
            type="text"
            value={voiceClone}
            onChange={(e) => setVoiceClone(e.target.value)}
            placeholder="输入已克隆的声音 ID"
            className="w-full bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
          />
        </div>
      )}

      {/* 音色设计 */}
      {voiceType === 'design' && (
        <div className="mb-4 animate-fade-in">
          <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">音色设计描述</label>
          <textarea
            value={voiceDesign}
            onChange={(e) => setVoiceDesign(e.target.value)}
            placeholder="描述你想要的音色，例如：年轻女性，声音甜美，语速适中..."
            className="w-full h-20 bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[12px] transition-colors"
          />
        </div>
      )}

      {/* 风格提示词 */}
      <div className="mb-4">
        <label className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60 mb-2 block">
          风格提示词 <span className="normal-case tracking-normal text-ink-soft/40">(可选)</span>
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="例如：语速稍快，情绪饱满，专业播报风格"
          className="w-full bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
        />
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleSplitAndGenerate}
        disabled={isBusy || !script}
        className="w-full bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-3 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider flex items-center justify-center gap-2"
      >
        {isBusy ? (
          <>
            <span className="w-4 h-1 bg-ink/20 rounded-full overflow-hidden">
              <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
            </span>
            {isSplitting ? 'AI 切分中...' : '创建中...'}
          </>
        ) : (
          '切分并生成语音'
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceGenerator;
