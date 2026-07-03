import React from 'react';
import { Header } from '../components/Layout/Header';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';
import { hasSelectedVoice } from '../store/voiceConfigModel';

export const ScriptEditor: React.FC = () => {
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const segments = useStore((s) => s.segments);
  const saveBroadcast = useStore((s) => s.saveBroadcast);
  const voiceConfig = useStore((s) => s.voiceConfig);

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';
  const hasVoice = hasSelectedVoice(voiceConfig);

  return (
    <div className={`relative flex-1 flex flex-col overflow-hidden transition-colors duration-200 ${
      hasVoice ? 'bg-paper' : 'bg-paper-2'
    }`}>
      <div className={`flex min-h-0 flex-1 flex-col transition-all duration-200 ${
        hasVoice ? 'opacity-100 saturate-100 contrast-100 grayscale-0' : 'opacity-35 saturate-0 contrast-75 grayscale'
      }`}>
        <Header title="口播稿编辑" subtitle="编辑稿件、切分短句并生成语音" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-4">
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
        </main>
      </div>

      {!hasVoice && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-ink/5 backdrop-blur-[1px]" />
      )}

      <VoiceGenerator />
    </div>
  );
};

export default ScriptEditor;
