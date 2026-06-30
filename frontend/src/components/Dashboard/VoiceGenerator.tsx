import React, { useState, useEffect, useCallback } from 'react';
import useStore, { type VoicePreset } from '../../store';
import { broadcastApi } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { CloneTrialPanel } from './CloneTrialPanel';
import { DesignTrialPanel } from './DesignTrialPanel';
import { VoicePresetTab } from './VoicePresetTab';

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
  { value: 'builtin', label: '内置' },
  { value: 'clone', label: '克隆' },
  { value: 'design', label: '设计' },
  { value: 'preset', label: '预设' },
];

const EMOTION_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'happy', label: '开心' },
  { value: 'sad', label: '悲伤' },
  { value: 'angry', label: '生气' },
  { value: 'fearful', label: '害怕' },
  { value: 'surprised', label: '惊喜' },
  { value: 'calm', label: '冷静' },
  { value: 'pleading', label: '恳求' },
  { value: 'sarcasm', label: '嘲讽' },
  { value: 'furious', label: '暴怒' },
  { value: 'depressed', label: '沮丧' },
  { value: 'stingy', label: '吝啬' },
  { value: 'arrogant', label: '傲慢' },
  { value: 'grief', label: '悲痛' },
  { value: 'seductive', label: '诱惑' },
  { value: 'embarrassed', label: '害羞' },
  { value: 'suspicious', label: '怀疑' },
  { value: 'heartbroken', label: '心疼' },
];

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({ layout = 'horizontal' }) => {
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const settings = useStore((s) => s.settings);
  const voiceConfig = useStore((s) => s.voiceConfig);
  const updateVoiceConfig = useStore((s) => s.updateVoiceConfig);

  const [voiceType, setVoiceType] = useState(voiceConfig.voiceType === 'preset' ? 'builtin' : (voiceConfig.voiceType || 'builtin'));
  const [selectedVoice, setSelectedVoice] = useState(voiceConfig.voice || settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState(voiceConfig.voiceClone || '');
  const [voiceDesign, setVoiceDesign] = useState(voiceConfig.voiceDesign || '');
  const [stylePrompt, setStylePrompt] = useState(voiceConfig.stylePrompt || '');
  const [optimizeTextPreview, setOptimizeTextPreview] = useState(voiceConfig.optimizeTextPreview || false);
  // 预设选中时的真实音色类型（不切换 UI tab）
  const [activePresetType, setActivePresetType] = useState<string | null>(null);
  // 精细控制（仅 builtin 模式）
  const [speedRatio, setSpeedRatio] = useState<number>(1.0);
  const [emotion, setEmotion] = useState<string>('');
  const [pitchRatio, setPitchRatio] = useState<number>(1.0);
  const [showFineControls, setShowFineControls] = useState(false);

  // ====== 同步本地状态到 store（即时，不触后端） ======
  useEffect(() => {
    const effectiveType = activePresetType || (voiceType === 'builtin' ? 'preset' : voiceType);
    updateVoiceConfig({
      voice: selectedVoice,
      voiceType: effectiveType,
      voiceDesign,
      voiceClone,
      stylePrompt,
      optimizeTextPreview,
      speed: speedRatio === 1.0 ? null : { speed_ratio: speedRatio, style: '固定' },
      emotion: emotion === '' ? null : emotion,
      pitch: pitchRatio === 1.0 ? null : { pitch_ratio: pitchRatio, style: '固定' },
    });
  }, [selectedVoice, voiceType, voiceDesign, voiceClone, stylePrompt, optimizeTextPreview, activePresetType, speedRatio, emotion, pitchRatio, updateVoiceConfig]);

  // ====== 防抖同步音色配置到后端（避免 slider 每次变动都 PATCH） ======
  const syncToBackend = useCallback(() => {
    if (!currentBroadcast) return;
    const effectiveType = activePresetType || (voiceType === 'builtin' ? 'preset' : voiceType);
    const payload = {
      voiceType: effectiveType,
      voice: effectiveType === 'preset' ? selectedVoice : undefined,
      voiceDesign: effectiveType === 'design' ? voiceDesign : undefined,
      voiceClone: effectiveType === 'clone' ? voiceClone : undefined,
      stylePrompt: stylePrompt || undefined,
      optimizeTextPreview: effectiveType === 'design' ? optimizeTextPreview : undefined,
      speed: voiceType === 'builtin' && speedRatio !== 1.0 ? { speed_ratio: speedRatio, style: '固定' as const } : undefined,
      emotion: voiceType === 'builtin' && emotion !== '' ? emotion : undefined,
      pitch: voiceType === 'builtin' && pitchRatio !== 1.0 ? { pitch_ratio: pitchRatio, style: '固定' as const } : undefined,
    };
    broadcastApi.updateVoiceConfig(currentBroadcast.id, payload).catch(() => {
      // 静默处理 — 拦截器已打印错误
    });
  }, [currentBroadcast, activePresetType, voiceType, selectedVoice, voiceDesign, voiceClone, stylePrompt, optimizeTextPreview, speedRatio, emotion, pitchRatio]);

  const debouncedSyncToBackend = useDebounce(syncToBackend, 800);

  // 当配置变化时，触发防抖同步
  useEffect(() => {
    // 跳过首次渲染 — 首次不需要同步（后端已有数据）
    // 通过检查 voiceConfig 是否与本地状态一致来判断是否是初始化
    const effectiveType = activePresetType || (voiceType === 'builtin' ? 'preset' : voiceType);
    const isInitial =
      voiceConfig.voice === selectedVoice &&
      voiceConfig.voiceType === effectiveType &&
      voiceConfig.voiceDesign === voiceDesign &&
      voiceConfig.voiceClone === voiceClone &&
      voiceConfig.stylePrompt === stylePrompt &&
      voiceConfig.optimizeTextPreview === optimizeTextPreview;

    if (isInitial) return;
    debouncedSyncToBackend();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVoice, voiceType, voiceDesign, voiceClone, stylePrompt, optimizeTextPreview, activePresetType, speedRatio, emotion, pitchRatio]);

  const handleApplyPreset = (preset: VoicePreset) => {
    setActivePresetType(preset.type);
    if (preset.type === 'clone') {
      setVoiceClone(preset.original_audio_path || '');
      setVoiceDesign('');
    } else {
      setVoiceDesign(preset.design_prompt || '');
      setVoiceClone('');
    }
    setStylePrompt(preset.style_prompt || '');
  };

  // 切换到非预设 tab 时，清除预设选中状态
  const handleVoiceTypeChange = (type: string) => {
    setVoiceType(type);
    if (type !== 'preset') {
      setActivePresetType(null);
    }
  };

  // 重置精细控制参数
  const handleResetFineControls = () => {
    setSpeedRatio(1.0);
    setEmotion('');
    setPitchRatio(1.0);
  };

  const isVertical = layout === 'vertical';

  if (isVertical) {
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
                onClick={() => handleVoiceTypeChange(type.value)}
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
        {voiceType === 'builtin' && (
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

        {/* 精细控制（仅内置音色模式） */}
        {voiceType === 'builtin' && (
          <div className="mb-3 flex-shrink-0 animate-fade-in">
            <button
              onClick={() => setShowFineControls(!showFineControls)}
              className="flex items-center justify-between w-full mb-1.5 group"
            >
              <label className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 cursor-pointer">精细控制</label>
              <span className="font-body text-[10px] text-ink-soft/40 transition-transform duration-150"
                style={{ transform: showFineControls ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                ▸
              </span>
            </button>
            {showFineControls && (
              <div className="bg-white/60 rounded-xl border border-card-border p-3 space-y-3">
                {/* 语速 */}
                <div className="flex items-center gap-2">
                  <span className="font-body text-[11px] text-ink-soft w-8 flex-shrink-0">语速</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={speedRatio}
                    onChange={(e) => setSpeedRatio(Number(e.target.value))}
                    className="flex-1 h-1 bg-card-border rounded-lg appearance-none cursor-pointer accent-blush"
                  />
                  <span className="font-body text-[11px] text-ink w-8 text-right flex-shrink-0">{speedRatio.toFixed(1)}x</span>
                </div>
                {/* 情感 */}
                <div className="flex items-center gap-2">
                  <span className="font-body text-[11px] text-ink-soft w-8 flex-shrink-0">情感</span>
                  <select
                    value={emotion}
                    onChange={(e) => setEmotion(e.target.value)}
                    className="flex-1 bg-white/70 text-ink rounded-lg px-2 py-1 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors appearance-none cursor-pointer"
                  >
                    {EMOTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {/* 音调 */}
                <div className="flex items-center gap-2">
                  <span className="font-body text-[11px] text-ink-soft w-8 flex-shrink-0">音调</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={pitchRatio}
                    onChange={(e) => setPitchRatio(Number(e.target.value))}
                    className="flex-1 h-1 bg-card-border rounded-lg appearance-none cursor-pointer accent-lilac"
                  />
                  <span className="font-body text-[11px] text-ink w-8 text-right flex-shrink-0">{pitchRatio.toFixed(1)}x</span>
                </div>
                {/* 重置按钮 */}
                <div className="flex justify-end">
                  <button
                    onClick={handleResetFineControls}
                    className="font-body text-[10px] uppercase tracking-wider text-ink-soft/50 hover:text-ink px-2 py-1 rounded-lg hover:bg-white/50 transition-all duration-150"
                  >
                    重置
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 声音克隆输入 */}
        {voiceType === 'clone' && (
          <CloneTrialPanel
            voiceClone={voiceClone}
            stylePrompt={stylePrompt}
            onVoiceCloneChange={setVoiceClone}
            onStylePromptChange={setStylePrompt}
          />
        )}

        {/* 音色设计输入 */}
        {voiceType === 'design' && (
          <DesignTrialPanel
            voiceDesign={voiceDesign}
            stylePrompt={stylePrompt}
            optimizeTextPreview={optimizeTextPreview}
            onVoiceDesignChange={setVoiceDesign}
            onStylePromptChange={setStylePrompt}
            onOptimizeTextPreviewChange={setOptimizeTextPreview}
          />
        )}

        {/* 预设管理 */}
        {voiceType === 'preset' && (
          <VoicePresetTab onApplyPreset={handleApplyPreset} />
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
              onClick={() => handleVoiceTypeChange(type.value)}
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
        {voiceType === 'builtin' && (
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
        {(voiceType === 'clone' || voiceType === 'design') && (
          <input type="text" value={stylePrompt} onChange={(e) => setStylePrompt(e.target.value)} placeholder="风格提示词（可选）"
            className="w-36 bg-white/70 text-ink rounded-lg px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors animate-fade-in" />
        )}
      </div>
    </div>
  );
};

export default VoiceGenerator;
