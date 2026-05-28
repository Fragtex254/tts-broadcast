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

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <QuickGenerate />
            <VoiceGenerator script={script} />
          </div>

          <ScriptPreview />
          <AudioPlayer audioUrl={audioUrl} title={currentBroadcast?.title} />
        </div>
      </main>
    </div>
  );
};
