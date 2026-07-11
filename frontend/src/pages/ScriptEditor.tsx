import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';
import { PublishPackageModal } from '../components/Creator/PublishPackageModal';

export const ScriptEditor: React.FC = () => {
  const navigate = useNavigate();
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const segments = useStore((s) => s.segments);
  const saveBroadcast = useStore((s) => s.saveBroadcast);
  const [isPublishPackageOpen, setIsPublishPackageOpen] = useState(false);

  const audioUrl = currentBroadcast && (
    currentBroadcast.audio_path || (currentBroadcast.mode === 'segmented' && currentBroadcast.status === 'generated')
  )
    ? `/api/broadcast/${currentBroadcast.id}/audio?t=${encodeURIComponent(currentBroadcast.updated_at)}`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';
  return (
    <div className="relative flex-1 flex flex-col overflow-hidden bg-paper">
      <div className="flex min-h-0 flex-1 flex-col">
        <Header title="口播稿编辑" subtitle="先完成内容，再选择音色并生成语音" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-4">
            <VoiceGenerator onManagePresets={() => navigate('/voice-presets')} />
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
              onOpenPublishPackage={currentBroadcast ? () => setIsPublishPackageOpen(true) : undefined}
            />
          </div>
        </main>
      </div>
      {currentBroadcast && isPublishPackageOpen && (
        <PublishPackageModal
          isOpen={isPublishPackageOpen}
          broadcast={currentBroadcast}
          onClose={() => setIsPublishPackageOpen(false)}
        />
      )}
    </div>
  );
};

export default ScriptEditor;
