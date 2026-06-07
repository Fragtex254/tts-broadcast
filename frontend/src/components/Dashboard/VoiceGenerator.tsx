import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  layout?: 'horizontal' | 'vertical';
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
  { value: 'preset', label: '预设' },
  { value: 'clone', label: '克隆' },
  { value: 'design', label: '设计' },
];

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({ layout = 'horizontal' }) => {
  const {
    currentBroadcast, segments,
    batchGenerateSegments, isGenerating, isSplitting,
    settings, voiceConfig, updateVoiceConfig,
  } = useStore();

  const [voiceType, setVoiceType] = useState(voiceConfig.voiceType || 'preset');
  const [selectedVoice, setSelectedVoice] = useState(voiceConfig.voice || settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState(voiceConfig.voiceClone || '');
  const [voiceDesign, setVoiceDesign] = useState(voiceConfig.voiceDesign || '');
  const [stylePrompt, setStylePrompt] = useState(voiceConfig.stylePrompt || '');
  const [error, setError] = useState<string | null>(null);

  // 同步本地状态到 store（供 splitScriptAction 读取）
  useEffect(() => {
    updateVoiceConfig({
      voice: selectedVoice,
      voiceType,
      voiceDesign,
      voiceClone,
      stylePrompt,
    });
  }, [selectedVoice, voiceType, voiceDesign, voiceClone, stylePrompt]);

  const handleBatchGenerate = async () => {
    if (!currentBroadcast) {
      setError('请先切分口播稿');
      return;
    }
    setError(null);
    try {
      await batchGenerateSegments(currentBroadcast.id);
    } catch {
      setError('生成语音失败，请检查 API Key 或稍后重试');
    }
  };

  const isBusy = isGenerating || isSplitting;
  const hasSegments = currentBroadcast?.mode === 'segmented' && segments.length > 0;
  const hasPending = segments.some((s) => s.status === 'pending' || s.status === 'failed');
  const isVertical = layout === 'vertical';

  if (isVertical) {
    // 垂直布局：用于左侧固定面板
    return (
      <div className="flex flex-col h-full">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">语音生成</h3>
        </div>

        {/* 音色类型选择 */}
        <div className="mb-3 flex-shrink-0">
          <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">音色类型</label>
          <div className="flex gap-1">
            {VOICE_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setVoiceType(type.value)}
                className={`flex-1 px-2 py-1.5 rounded-lg font-body text-[11px] font-medium transition-all duration-150 ${
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

        {/* 预设音色列表（纵向） */}
        {voiceType === 'preset' && (
          <div className="flex-1 overflow-y-auto mb-3 animate-fade-in min-h-0">
            <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">选择音色</label>
            <div className="flex flex-col gap-1">
              {VOICE_OPTIONS.map((voice) => (
                <button
                  key={voice.value}
                  onClick={() => setSelectedVoice(voice.value)}
                  className={`px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                    selectedVoice === voice.value
                      ? 'bg-lemon/25 border border-ink/15 shadow-card'
                      : 'bg-white/50 border border-card-border hover:border-ink/10'
                  }`}
                >
                  <span className="font-body text-[12px] font-medium text-ink block">{voice.label}</span>
                  <span className="font-body text-[9px] uppercase tracking-wider text-ink-soft/40">{voice.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 声音克隆输入 */}
        {voiceType === 'clone' && (
          <div className="mb-3 animate-fade-in flex-shrink-0">
            <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">克隆声音 ID</label>
            <input
              type="text"
              value={voiceClone}
              onChange={(e) => setVoiceClone(e.target.value)}
              placeholder="输入已克隆的声音 ID"
              className="w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
            />
          </div>
        )}

        {/* 音色设计输入 */}
        {voiceType === 'design' && (
          <div className="mb-3 animate-fade-in flex-shrink-0">
            <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">音色设计描述</label>
            <textarea
              value={voiceDesign}
              onChange={(e) => setVoiceDesign(e.target.value)}
              placeholder="描述你想要的音色..."
              className="w-full h-20 bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[11px] transition-colors"
            />
          </div>
        )}

        {/* 风格提示词 */}
        {voiceType !== 'preset' && (
          <div className="mb-3 animate-fade-in flex-shrink-0">
            <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 mb-1.5 block">风格提示词（可选）</label>
            <input
              type="text"
              value={stylePrompt}
              onChange={(e) => setStylePrompt(e.target.value)}
              placeholder="语速稍快，情绪饱满..."
              className="w-full bg-white/70 text-ink rounded-xl px-3 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors"
            />
          </div>
        )}

        {/* 生成按钮 */}
        <button
          onClick={handleBatchGenerate}
          disabled={isBusy || !hasSegments}
          className="flex-shrink-0 w-full bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {isBusy ? (
            <>
              <span className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden">
                <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
              </span>
              生成中...
            </>
          ) : hasSegments ? (
            hasPending ? '生成语音' : '✓ 已全部生成'
          ) : (
            '请先切分口播稿'
          )}
        </button>

        {/* 错误提示 */}
        {error && (
          <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[11px] font-body animate-shake flex-shrink-0">
            {error}
          </div>
        )}
      </div>
    );
  }

  // 水平布局（兼容，当前不在主流程中使用）
  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card px-5 py-3.5 shadow-card border border-card-border">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">语音生成</h3>
        </div>
        <div className="w-px h-5 bg-card-border" />
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
        {voiceType === 'clone' && (
          <input type="text" value={voiceClone} onChange={(e) => setVoiceClone(e.target.value)} placeholder="声音 ID"
            className="w-32 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in" />
        )}
        {voiceType === 'design' && (
          <input type="text" value={voiceDesign} onChange={(e) => setVoiceDesign(e.target.value)} placeholder="音色描述"
            className="w-40 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in" />
        )}
        {voiceType !== 'preset' && (
          <input type="text" value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} placeholder="风格提示词（可选）"
            className="w-36 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in" />
        )}
        <button
          onClick={handleBatchGenerate}
          disabled={isBusy || !hasSegments}
          className="ml-auto bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[11px] rounded-xl px-4 py-2 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider flex items-center gap-2"
        >
          {isBusy ? '生成中...' : hasSegments ? (hasPending ? '生成语音' : '✓ 已全部生成') : '请先切分口播稿'}
        </button>
      </div>
      {error && (
        <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[11px] font-body animate-shake">{error}</div>
      )}
    </div>
  );
};

export default VoiceGenerator;
