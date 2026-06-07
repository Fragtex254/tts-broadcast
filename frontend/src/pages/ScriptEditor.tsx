import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { ScriptPreview } from '../components/Dashboard/ScriptPreview';
import { VoiceGenerator } from '../components/Dashboard/VoiceGenerator';
import { SegmentEditor } from '../components/Dashboard/SegmentEditor';
import { AudioPlayer } from '../components/Dashboard/AudioPlayer';
import useStore from '../store';

const MIN_LEFT_WIDTH = 200;
const MAX_LEFT_WIDTH = 400;
const DEFAULT_LEFT_WIDTH = 260;

export const ScriptEditor: React.FC = () => {
  const navigate = useNavigate();
  const { script, currentBroadcast, segments, saveBroadcast } = useStore();
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const clamped = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, newWidth));
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
  }, [isDragging]);

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

      <main className="flex-1 overflow-hidden">
        <div ref={containerRef} className="flex h-full">
          {/* 左侧固定面板：语音生成 */}
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

          {/* 右侧滚动区域：稿件预览 + 段落编辑器 + 播放器 */}
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
