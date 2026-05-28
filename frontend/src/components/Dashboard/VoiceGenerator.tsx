import React, { useState } from 'react';
import { useStore } from '../../store';

interface VoiceGeneratorProps {
  script: string;
  onGenerated?: (audioUrl: string) => void;
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

export const VoiceGenerator: React.FC<VoiceGeneratorProps> = ({
  script,
  onGenerated,
}) => {
  const { generateBroadcast, isGenerating, settings } = useStore();
  const [voiceType, setVoiceType] = useState('preset');
  const [selectedVoice, setSelectedVoice] = useState(settings.default_voice || '冰糖');
  const [voiceClone, setVoiceClone] = useState('');
  const [voiceDesign, setVoiceDesign] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
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
      });
      onGenerated?.(result.audioUrl);
    } catch (err) {
      setError('语音生成失败，请检查 API Key 或稍后重试');
      console.error(err);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">语音生成</h3>

      {/* 音色类型选择 */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">音色类型</label>
        <div className="flex gap-2">
          {VOICE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setVoiceType(type.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                voiceType === type.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* 根据类型显示不同配置 */}
      {voiceType === 'preset' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">选择音色</label>
          <div className="grid grid-cols-2 gap-2">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.value}
                onClick={() => setSelectedVoice(voice.value)}
                className={`p-3 rounded-lg text-left transition-colors ${
                  selectedVoice === voice.value
                    ? 'bg-blue-600/30 border border-blue-500'
                    : 'bg-gray-700 border border-gray-600 hover:border-gray-500'
                }`}
              >
                <span className="text-white text-sm font-medium">
                  {voice.label}
                </span>
                <span className="text-gray-400 text-xs block mt-0.5">
                  {voice.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {voiceType === 'clone' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            克隆声音 ID
          </label>
          <input
            type="text"
            value={voiceClone}
            onChange={(e) => setVoiceClone(e.target.value)}
            placeholder="输入已克隆的声音 ID"
            className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {voiceType === 'design' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            音色设计描述
          </label>
          <textarea
            value={voiceDesign}
            onChange={(e) => setVoiceDesign(e.target.value)}
            placeholder="描述你想要的音色，例如：年轻女性，声音甜美，语速适中..."
            className="w-full h-20 bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
          />
        </div>
      )}

      {/* 风格提示词 */}
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">
          风格提示词 <span className="text-gray-500">(可选)</span>
        </label>
        <input
          type="text"
          value={stylePrompt}
          onChange={(e) => setStylePrompt(e.target.value)}
          placeholder="例如：语速稍快，情绪饱满，专业播报风格"
          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !script}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-medium rounded-lg px-4 py-3 transition-colors flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            生成中...
          </>
        ) : (
          '生成语音播报'
        )}
      </button>

      {/* 错误提示 */}
      {error && (
        <div className="mt-3 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceGenerator;
