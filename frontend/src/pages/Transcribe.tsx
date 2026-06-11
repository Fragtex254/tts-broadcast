import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import useStore, { type AsrLanguage } from '../store';

const LANGUAGE_OPTIONS: { value: AsrLanguage; label: string }[] = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
];

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (error instanceof Error) return error.message;
  return '转录失败，请稍后重试';
}

export const Transcribe: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    transcriptionText,
    isTranscribing,
    transcribeMedia,
    setTranscriptionText,
    updateScript,
  } = useStore();

  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<AsrLanguage>('auto');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFile = useCallback((nextFile: File | null) => {
    setError(null);
    setCopied(false);
    setFile(nextFile);
  }, []);

  const handleSubmit = async () => {
    if (!file) {
      setError('请上传需要转录的音频或视频文件');
      return;
    }

    setError(null);
    try {
      await transcribeMedia(file, language);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCopy = async () => {
    if (!transcriptionText) return;
    await navigator.clipboard.writeText(transcriptionText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleImport = () => {
    if (!transcriptionText.trim()) return;
    updateScript(transcriptionText.trim());
    navigate('/editor');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="转录" subtitle="上传音频或视频并转换为口播稿文本" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <section
            className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-lilac" />
              <h3 className="font-display italic text-[14px] font-medium text-ink-soft">上传媒体</h3>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0] ?? null);
              }}
              className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.mpeg,.m4a,.mp4,.mov,.webm,audio/*,video/*"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <p className="font-display italic text-[18px] text-ink-soft mb-1">
                {file ? file.name : '选择或拖拽音频 / 视频'}
              </p>
              <p className="font-body text-[12px] text-ink-soft/45">
                wav, mp3, m4a, mp4, mov, webm
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as AsrLanguage)}
                className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                onClick={handleSubmit}
                disabled={isTranscribing || !file}
                className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
              >
                {isTranscribing && (
                  <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />
                )}
                <span className="relative">{isTranscribing ? '转录中...' : '开始转录'}</span>
              </button>
            </div>

            {error && (
              <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
                {error}
              </div>
            )}
          </section>

          <section
            className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
            style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sage" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录结果</h3>
              </div>
              {transcriptionText && (
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/40">
                  {transcriptionText.length} 字
                </span>
              )}
            </div>

            <textarea
              value={transcriptionText}
              onChange={(e) => setTranscriptionText(e.target.value)}
              className="w-full h-72 bg-white/60 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors"
              placeholder="转录完成后，文本会出现在这里..."
            />

            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={handleCopy}
                disabled={!transcriptionText}
                className="px-4 py-2 font-body text-[12px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
              >
                {copied ? '已复制' : '复制'}
              </button>
              <button
                onClick={handleImport}
                disabled={!transcriptionText.trim()}
                className="px-4 py-2 font-body text-[12px] bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn transition-all duration-150"
              >
                导入稿件
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Transcribe;
