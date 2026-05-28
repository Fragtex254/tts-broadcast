import React from 'react';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';

export const Dashboard: React.FC = () => {
  const { script, currentBroadcast } = useStore();

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="控制台" subtitle="生成今日 AI 简讯播报" />

      <main className="flex-1 flex overflow-hidden p-6">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 w-full">
          {/* 左侧：快速生成（独立滚动） */}
          <div className="w-full lg:w-1/2 flex flex-col overflow-y-auto">
            <QuickGenerate />
          </div>

          {/* 右侧：语音生成 + 稿件预览 + 音频播放 */}
          <div className="w-full lg:w-1/2 space-y-6 overflow-y-auto">
            <VoiceGenerator script={script} />
            <ScriptPreview />
            <AudioPlayer audioUrl={audioUrl} title={currentBroadcast?.title} />
          </div>
        </div>
      </main>
    </div>
  );
};
