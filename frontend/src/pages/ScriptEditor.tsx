import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';

export const ScriptEditor: React.FC = () => {
  const navigate = useNavigate();
  const { script, currentBroadcast, segments, saveBroadcast } = useStore();

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';

  // 空状态：无口播稿时引导回信源收集
  if (!script && !currentBroadcast) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="口播稿编辑" subtitle="编辑稿件、切分短句并生成语音" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-12 shadow-card border border-card-border text-center animate-fade-in">
              <p className="font-display italic text-[18px] text-ink-soft/40 mb-2">
                暂无口播稿
              </p>
              <p className="font-body text-[13px] text-ink-soft/30 mb-6">
                请先前往信源收集获取资讯并改写口播稿
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-lemon hover:brightness-105 text-ink font-body font-medium text-[12px] rounded-full px-6 py-2.5 shadow-btn transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:shadow-none uppercase tracking-wider"
              >
                前往信源收集
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="口播稿编辑" subtitle="编辑稿件、切分短句并生成语音" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 上：口播稿预览 */}
          <ScriptPreview />

          {/* 中上：语音生成（横向紧凑条） */}
          <VoiceGenerator script={script} />

          {/* 中下：段落编辑器（主体区域） */}
          {isSegmented && segments.length > 0 && currentBroadcast && (
            <SegmentEditor broadcastId={currentBroadcast.id} />
          )}

          {/* 底：播放器 */}
          <AudioPlayer
            audioUrl={audioUrl}
            title={currentBroadcast?.title}
            broadcastId={currentBroadcast?.id}
            isSaved={currentBroadcast?.saved === 1}
            onSave={saveBroadcast}
            mode={currentBroadcast?.mode}
          />
        </div>
      </main>
    </div>
  );
};

export default ScriptEditor;
