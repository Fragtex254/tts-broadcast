import React, { useCallback, useState } from 'react';
import { createScopedLogger, toLogError } from '../../services/logger';
import { AudioPlaybackBar } from './AudioPlaybackBar';

const logger = createScopedLogger('audio-player');

interface AudioPlayerProps {
  audioUrl: string | null;
  title?: string;
  broadcastId?: number;
  isSaved?: boolean;
  onSave?: (id: number) => void | Promise<unknown>;
  mode?: string | null;
  onOpenPublishPackage?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  title = '语音播报',
  broadcastId,
  isSaved,
  onSave,
  mode,
  onOpenPublishPackage,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    const version = audioUrl.includes('?') ? audioUrl.slice(audioUrl.indexOf('?')) : '';
    a.href = broadcastId ? `/api/broadcast/${broadcastId}/download${version}` : audioUrl;
    a.download = `${title}.wav`;
    a.click();
  };

  // 保存可能因后端返回畸形数据而抛错（saveBroadcast 走 safeParseStrict），
  // 这里兜底 catch，避免未处理的 Promise rejection，并给出可感知的失败反馈
  const handleSave = useCallback(async () => {
    if (!onSave || broadcastId == null) return;
    setSaveError(false);
    setIsSaving(true);
    try {
      await onSave(broadcastId);
    } catch (err) {
      logger.error({ err: toLogError(err), broadcastId, hasAudioUrl: Boolean(audioUrl) }, '保存播报失败');
      setSaveError(true);
      window.setTimeout(() => setSaveError(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, broadcastId, audioUrl]);

  if (!audioUrl) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">播放器</h3>
        </div>
        <div className="bg-white/40 rounded-2xl p-8 flex items-center justify-center border border-card-border">
          <p className="font-body text-[12px] text-ink-soft/70 animate-fade-in">
            {mode === 'segmented' ? '请先合并所有句子音频' : '生成语音后在此播放'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">播放器</h3>
        </div>
        <div className="flex items-center gap-3">
          {broadcastId && onOpenPublishPackage && (
            <button type="button" onClick={onOpenPublishPackage} className="font-body text-[11px] text-ink-soft/70 hover:text-ink transition-colors uppercase tracking-wider" title="生成发布内容包">
              发布包
            </button>
          )}
          {broadcastId && onSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`font-body text-[11px] transition-colors flex items-center gap-1 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed ${saveError ? 'text-pink animate-shake' : isSaved ? 'text-lemon' : 'text-ink-soft/70 hover:text-lemon'}`}
              title={saveError ? '保存失败，请重试' : isSaved ? '取消保存' : '保存此播报'}
            >
              <svg className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="font-body text-[11px] text-ink-soft/70 hover:text-ink transition-colors flex items-center gap-1 uppercase tracking-wider"
            title="下载音频"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      <AudioPlaybackBar
        src={audioUrl}
        variant="regular"
        visual="waveform"
        waveformSeed={audioUrl || title}
        playLabel={title}
      />
    </div>
  );
};

export default AudioPlayer;
