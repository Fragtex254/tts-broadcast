import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useStore, { type VoicePreset } from '../../store';
import { broadcastApi } from '../../services/api';
import { useDebounce } from '../../hooks/useDebounce';
import { hasSelectedVoice } from '../../store/voiceConfigModel';
import type { VoiceConfig } from '../../store/types';
import { ModalShell } from '../ModalShell';
import { VoicePresetTab } from './VoicePresetTab';

type VoicePanelType = 'builtin' | 'preset';

const VOICE_OPTIONS = [
  { value: 'mimo_default', label: 'MiMo-默认', description: '通用叙述' },
  { value: '冰糖', label: '冰糖', description: '中文女声' },
  { value: '茉莉', label: '茉莉', description: '中文女声' },
  { value: '苏打', label: '苏打', description: '中文男声' },
  { value: '白桦', label: '白桦', description: '中文男声' },
  { value: 'Mia', label: 'Mia', description: '英文女声' },
  { value: 'Chloe', label: 'Chloe', description: '英文女声' },
  { value: 'Milo', label: 'Milo', description: '英文男声' },
  { value: 'Dean', label: 'Dean', description: '英文男声' },
];

const VOICE_TYPES: { value: VoicePanelType; label: string }[] = [
  { value: 'builtin', label: '官方音色' },
  { value: 'preset', label: '我的预设' },
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

const hasText = (value: string | undefined | null) => Boolean(value?.trim());

function getVoiceName(voiceConfig: VoiceConfig, presets: VoicePreset[], selectedPresetName: string) {
  if (voiceConfig.voiceType === 'preset') return voiceConfig.voice;
  if (voiceConfig.voiceType === 'design') {
    return (
      presets.find((preset) => preset.type === 'design' && preset.design_prompt === voiceConfig.voiceDesign)?.name ||
      selectedPresetName ||
      '设计音色'
    );
  }
  if (voiceConfig.voiceType === 'clone') {
    return (
      presets.find((preset) => preset.type === 'clone' && preset.original_audio_path === voiceConfig.voiceClone)?.name ||
      presets.find((preset) => preset.type === 'design' && preset.use_trial_audio_as_clone === 1 && preset.trial_audio_path === voiceConfig.voiceClone)?.name ||
      selectedPresetName ||
      '克隆音色'
    );
  }
  return '未选择音色';
}

export const VoiceGenerator: React.FC = () => {
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const settings = useStore((s) => s.settings);
  const voiceConfig = useStore((s) => s.voiceConfig);
  const presets = useStore((s) => s.presets);
  const fetchPresets = useStore((s) => s.fetchPresets);
  const updateVoiceConfig = useStore((s) => s.updateVoiceConfig);

  const initialPanelType = presets.length > 0 || voiceConfig.voiceType === 'clone' || voiceConfig.voiceType === 'design' ? 'preset' : 'builtin';
  const [panelType, setPanelType] = useState<VoicePanelType>(initialPanelType);
  const [selectedVoice, setSelectedVoice] = useState(voiceConfig.voice || '');
  const [voiceClone, setVoiceClone] = useState(voiceConfig.voiceClone || '');
  const [voiceDesign, setVoiceDesign] = useState(voiceConfig.voiceDesign || '');
  const [stylePrompt, setStylePrompt] = useState(voiceConfig.stylePrompt || '');
  const [optimizeTextPreview] = useState(voiceConfig.optimizeTextPreview || false);
  const [activePresetType, setActivePresetType] = useState<VoiceConfig['voiceType']>(
    voiceConfig.voiceType === 'clone' || voiceConfig.voiceType === 'design' ? voiceConfig.voiceType : ''
  );
  const [speedRatio, setSpeedRatio] = useState(voiceConfig.speed?.speed_ratio ?? 1.0);
  const [emotion, setEmotion] = useState(typeof voiceConfig.emotion === 'string' ? voiceConfig.emotion : '');
  const [pitchRatio, setPitchRatio] = useState(voiceConfig.pitch?.pitch_ratio ?? 1.0);
  const [showFineControls, setShowFineControls] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(() => !hasSelectedVoice(voiceConfig));
  const [selectedPresetName, setSelectedPresetName] = useState('');

  const localVoiceConfig = useMemo<VoiceConfig | null>(() => {
    const effectiveType: VoiceConfig['voiceType'] = activePresetType || (panelType === 'builtin' ? 'preset' : '');
    if (effectiveType === 'preset' && !hasText(selectedVoice)) return null;
    if (effectiveType === 'design' && !hasText(voiceDesign)) return null;
    if (effectiveType === 'clone' && !hasText(voiceClone)) return null;
    if (!effectiveType) return null;

    return {
      voice: effectiveType === 'preset' ? selectedVoice : '',
      voiceType: effectiveType,
      voiceDesign: effectiveType === 'design' ? voiceDesign : '',
      voiceClone: effectiveType === 'clone' ? voiceClone : '',
      stylePrompt,
      optimizeTextPreview,
      speed: effectiveType === 'preset' && speedRatio !== 1.0 ? { speed_ratio: speedRatio, style: '固定' } : null,
      emotion: effectiveType === 'preset' && emotion !== '' ? emotion : null,
      pitch: effectiveType === 'preset' && pitchRatio !== 1.0 ? { pitch_ratio: pitchRatio, style: '固定' } : null,
    };
  }, [activePresetType, emotion, optimizeTextPreview, panelType, pitchRatio, selectedVoice, speedRatio, stylePrompt, voiceClone, voiceDesign]);

  const hasVoice = hasSelectedVoice(voiceConfig);
  const recommendedVoice = settings.default_voice || '冰糖';

  useEffect(() => {
    if (!localVoiceConfig) return;
    updateVoiceConfig(localVoiceConfig);
  }, [localVoiceConfig, updateVoiceConfig]);

  useEffect(() => {
    if (presets.length > 0) return;
    if (voiceConfig.voiceType !== 'design' && voiceConfig.voiceType !== 'clone') return;
    fetchPresets();
  }, [fetchPresets, presets.length, voiceConfig.voiceType]);

  useEffect(() => {
    if (!isSelectorOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSelectorOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSelectorOpen]);

  useEffect(() => {
    if (!isSelectorOpen) return undefined;
    if (presets.length > 0) {
      return undefined;
    }

    let isActive = true;
    fetchPresets().then(() => {
      if (!isActive) return;
      if (useStore.getState().presets.length > 0) {
        setPanelType('preset');
      }
    }).catch(() => {
      // Store 已记录错误；保留当前页签供用户手动切换。
    });
    return () => { isActive = false; };
  }, [fetchPresets, isSelectorOpen, presets.length]);

  const syncToBackend = useCallback(() => {
    if (!currentBroadcast || !localVoiceConfig) return;
    broadcastApi.updateVoiceConfig(currentBroadcast.id, {
      voiceType: localVoiceConfig.voiceType,
      voice: localVoiceConfig.voiceType === 'preset' ? localVoiceConfig.voice : undefined,
      voiceDesign: localVoiceConfig.voiceType === 'design' ? localVoiceConfig.voiceDesign : undefined,
      voiceClone: localVoiceConfig.voiceType === 'clone' ? localVoiceConfig.voiceClone : undefined,
      stylePrompt: localVoiceConfig.stylePrompt || undefined,
      optimizeTextPreview: localVoiceConfig.voiceType === 'design' ? localVoiceConfig.optimizeTextPreview : undefined,
      speed: localVoiceConfig.speed,
      emotion: localVoiceConfig.emotion,
      pitch: localVoiceConfig.pitch,
    }).catch(() => {
      // 拦截器已记录网络错误，界面保留用户当前选择。
    });
  }, [currentBroadcast, localVoiceConfig]);

  const debouncedSyncToBackend = useDebounce(syncToBackend, 800);

  useEffect(() => {
    if (!localVoiceConfig) return;
    debouncedSyncToBackend();
  }, [debouncedSyncToBackend, localVoiceConfig]);

  const selectBuiltinVoice = (voice: string) => {
    setPanelType('builtin');
    setActivePresetType('');
    setSelectedVoice(voice);
    setSelectedPresetName('');
    setVoiceClone('');
    setVoiceDesign('');
    setIsSelectorOpen(false);
  };

  const openVoiceSelector = () => {
    setIsSelectorOpen(true);
    if (presets.length > 0) {
      setPanelType('preset');
    }
  };

  const handleApplyPreset = (preset: VoicePreset) => {
    setPanelType('preset');
    setSelectedVoice('');
    setSelectedPresetName(preset.name);
    if (preset.type === 'clone') {
      setActivePresetType('clone');
      setVoiceClone(preset.original_audio_path || '');
      setVoiceDesign('');
    } else if (preset.use_trial_audio_as_clone === 1 && preset.trial_audio_path) {
      setActivePresetType('clone');
      setVoiceClone(preset.trial_audio_path);
      setVoiceDesign('');
    } else {
      setActivePresetType('design');
      setVoiceDesign(preset.design_prompt || '');
      setVoiceClone('');
    }
    setStylePrompt(preset.style_prompt || '');
    setIsSelectorOpen(false);
  };

  const handlePanelTypeChange = (type: VoicePanelType) => {
    setPanelType(type);
    if (type === 'builtin') {
      setActivePresetType('');
    }
  };

  const handleResetFineControls = () => {
    setSpeedRatio(1.0);
    setEmotion('');
    setPitchRatio(1.0);
  };

  const renderBuiltinVoices = () => (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {VOICE_OPTIONS.map((voice) => {
        const isSelected = voiceConfig.voiceType === 'preset' && voiceConfig.voice === voice.value;
        const isRecommended = voice.value === recommendedVoice;
        return (
          <button
            key={voice.value}
            type="button"
            onClick={() => selectBuiltinVoice(voice.value)}
            className={`min-h-24 rounded-2xl border px-4 py-3 text-left transition-all duration-150 hover:-translate-y-px active:translate-y-0 ${
              isSelected
                ? 'border-ink/20 bg-lemon/30 shadow-card'
                : 'border-card-border bg-white/70 hover:border-ink/15 hover:bg-white/90'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-[20px] font-medium italic text-ink">{voice.label}</span>
              {isRecommended && (
                <span className="rounded-full bg-sage/35 px-2 py-0.5 font-body text-[9px] uppercase tracking-wider text-ink">推荐</span>
              )}
            </span>
            <span className="mt-2 block font-body text-[11px] uppercase tracking-wider text-ink-soft/70">{voice.description}</span>
          </button>
        );
      })}
    </div>
  );

  const renderFineControls = () => {
    if (voiceConfig.voiceType !== 'preset' || !hasVoice) return null;
    return (
      <div className="mt-4 animate-fade-in">
        <button
          type="button"
          onClick={() => setShowFineControls(!showFineControls)}
          className="flex w-full items-center justify-between rounded-xl border border-card-border bg-white/45 px-3 py-2"
        >
          <span className="font-body text-[11px] uppercase tracking-wider text-ink-soft/70">精细控制</span>
          <span
            className="font-body text-[10px] text-ink-soft/70 transition-transform duration-150"
            style={{ transform: showFineControls ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▸
          </span>
        </button>
        {showFineControls && (
          <div className="mt-2 grid gap-3 rounded-xl border border-card-border bg-white/60 p-3 lg:grid-cols-3">
            <div className="flex items-center gap-2">
              <span className="w-8 flex-shrink-0 font-body text-[11px] text-ink-soft">语速</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speedRatio}
                onChange={(e) => setSpeedRatio(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-card-border accent-blush"
              />
              <span className="w-8 flex-shrink-0 text-right font-body text-[11px] text-ink">{speedRatio.toFixed(1)}x</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 flex-shrink-0 font-body text-[11px] text-ink-soft">情感</span>
              <select
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                className="flex-1 cursor-pointer appearance-none rounded-lg border border-card-border bg-white/70 px-2 py-1 font-body text-[11px] text-ink transition-colors focus:border-ink/20 focus:outline-none"
              >
                {EMOTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 flex-shrink-0 font-body text-[11px] text-ink-soft">音调</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={pitchRatio}
                onChange={(e) => setPitchRatio(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-card-border accent-lilac"
              />
              <span className="w-8 flex-shrink-0 text-right font-body text-[11px] text-ink">{pitchRatio.toFixed(1)}x</span>
            </div>
            <div className="flex justify-end lg:col-span-3">
              <button
                type="button"
                onClick={handleResetFineControls}
                className="rounded-lg px-2 py-1 font-body text-[10px] uppercase tracking-wider text-ink-soft/70 transition-all duration-150 hover:bg-white/50 hover:text-ink"
              >
                重置
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const selector = (
    <ModalShell
      isOpen={isSelectorOpen}
      title="选择音色"
      subtitle="选择后才会用于切分和生成语音。当前没有显式选择时，系统不会自动套用默认音色。"
      onClose={() => setIsSelectorOpen(false)}
      size="xl"
      accent="blush"
      ariaLabel="选择音色"
      contentClassName="p-5"
      panelClassName="origin-bottom-right"
      panelStyle={{ animation: 'voice-selector-enter 0.28s cubic-bezier(0.22, 1, 0.36, 1) both' }}
    >
          <div className="mb-4 inline-flex rounded-xl border border-card-border bg-white/55 p-1">
            {VOICE_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => handlePanelTypeChange(type.value)}
                className={`rounded-lg px-4 py-2 font-body text-[12px] font-medium transition-all duration-150 ${
                  panelType === type.value
                    ? 'border border-card-border bg-white/85 text-ink shadow-card'
                    : 'text-ink-soft hover:bg-white/35 hover:text-ink'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          {panelType === 'builtin' ? (
            renderBuiltinVoices()
          ) : (
            <div className="min-h-72 rounded-2xl border border-card-border bg-white/55 p-4">
              <VoicePresetTab onApplyPreset={handleApplyPreset} />
            </div>
          )}
          {renderFineControls()}
    </ModalShell>
  );
  const currentVoiceName = getVoiceName(voiceConfig, presets, selectedPresetName);

  return (
    <>
      <button
        type="button"
        onClick={openVoiceSelector}
        className={`fixed bottom-8 right-0 z-40 flex h-32 w-24 flex-col items-center justify-between rounded-l-xl border border-r-0 p-2.5 text-center text-ink shadow-card backdrop-blur-sm transition-all duration-200 hover:-translate-x-1 hover:brightness-105 active:translate-x-0 active:shadow-none sm:w-28 xl:w-32 ${
          hasVoice ? 'border-card-border bg-white/90' : 'border-blush/45 bg-white/85'
        }`}
        style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0s both' }}
        title={hasVoice ? `当前音色：${currentVoiceName}` : '选择音色'}
      >
        <span
          className={`pointer-events-none absolute -left-1 top-2 h-[calc(100%-16px)] w-1 rounded-l-md ${
            hasVoice ? 'bg-sage/25' : 'bg-blush/25'
          }`}
          aria-hidden="true"
        />
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 sm:h-12 sm:w-12 ${
            hasVoice ? 'border-sage/50 bg-sage/30' : 'border-blush/45 bg-blush/20'
          }`}
          aria-hidden="true"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${hasVoice ? 'bg-sage' : 'bg-blush animate-breathe'}`} />
        </span>
        <span className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1.5">
          <span className="font-body text-[12px] font-medium leading-tight text-ink-soft">
            {hasVoice ? '更换音色' : '选择音色'}
          </span>
          <span className="line-clamp-2 max-w-full break-words font-display text-[16px] font-medium leading-tight text-ink sm:text-[17px]">
            {hasVoice ? currentVoiceName : '未选择'}
          </span>
        </span>
      </button>
      {selector}
    </>
  );
};

export default VoiceGenerator;
