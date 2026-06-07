import React from 'react';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';

export const Dashboard: React.FC = () => {
  const { script, currentBroadcast, segments, saveBroadcast } = useStore();

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="控制台" subtitle="生成今日 AI 简讯播报" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-4 w-full">
          {/* 左侧：快速生成（独立滚动） */}
          <div className="w-full lg:w-1/2 flex flex-col">
            <QuickGenerate />
          </div>

          {/* 右侧：语音生成 + 稿件预览 + 逐句编辑 + 音频播放 */}
          <div className="w-full lg:w-1/2 space-y-4">
            <VoiceGenerator script={script} />
            <ScriptPreview />
            {isSegmented && segments.length > 0 && currentBroadcast && (
              <SegmentEditor broadcastId={currentBroadcast.id} />
            )}
            <AudioPlayer
              audioUrl={audioUrl}
              title={currentBroadcast?.title}
              broadcastId={currentBroadcast?.id}
              isSaved={currentBroadcast?.saved === 1}
              onSave={saveBroadcast}
              mode={currentBroadcast?.mode}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
