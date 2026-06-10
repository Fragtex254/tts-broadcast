import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from '../components/Layout/Header';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';

const DEFAULT_LEFT_WIDTH = 260;

export const ScriptEditor: React.FC = () => {
  const { currentBroadcast, segments, saveBroadcast } = useStore();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [widthLimits, setWidthLimits] = useState({ min: 200, max: 600 });

  // 动态计算面板宽度限制（视口 25%-75%）
  useEffect(() => {
    const updateLimits = () => {
      setWidthLimits({
        min: window.innerWidth * 0.25,
        max: window.innerWidth * 0.75,
      });
    };
    updateLimits();
    window.addEventListener('resize', updateLimits);
    return () => window.removeEventListener('resize', updateLimits);
  }, []);

  const audioUrl = currentBroadcast?.audio_path
    ? `/api/broadcast/${currentBroadcast.id}/audio`
    : null;

  const isSegmented = currentBroadcast?.mode === 'segmented';

  // 拖动处理
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const clamped = Math.min(widthLimits.max, Math.max(widthLimits.min, newWidth));
      setLeftWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, widthLimits]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="口播稿编辑" subtitle="编辑稿件、切分短句并生成语音" />

      <main className="flex-1 overflow-hidden">
        <div ref={containerRef} className="flex h-full">
          {/* 左侧固定面板：语音生成（始终显示） */}
          <div
            className="flex-shrink-0 overflow-y-auto p-4 border-r border-card-border bg-paper-2/30"
            style={{ width: leftWidth }}
          >
            <VoiceGenerator layout="vertical" />
          </div>

          {/* 可拖动分隔条 */}
          <div
            onMouseDown={handleMouseDown}
            className={`flex-shrink-0 w-1.5 cursor-col-resize flex items-center justify-center group transition-colors ${
              isDragging ? 'bg-lilac/30' : 'hover:bg-lilac/15'
            }`}
          >
            <div className={`w-0.5 h-8 rounded-full transition-colors ${
              isDragging ? 'bg-lilac' : 'bg-card-border group-hover:bg-ink/20'
            }`} />
          </div>

          {/* 右侧滚动区域 */}
          <div className="flex-1 overflow-y-auto p-6 min-w-0">
            <div className="max-w-4xl mx-auto space-y-4">
              {/* 口播稿预览 */}
              <ScriptPreview />

              {/* 段落编辑器（主体区域） */}
              {isSegmented && segments.length > 0 && currentBroadcast && (
                <SegmentEditor broadcastId={currentBroadcast.id} />
              )}

              {/* 播放器 */}
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
        </div>
      </main>
    </div>
  );
};

export default ScriptEditor;
