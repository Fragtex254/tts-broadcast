import React, { useEffect, useState, useCallback } from 'react';
import useStore from '../../store';
import type { Segment } from '../../store';
import { getApiErrorMessage } from '../../services/apiError';
import { hasSelectedVoice, VOICE_REQUIRED_MESSAGE } from '../../store/voiceConfigModel';
import { useBatchGenerateSSE } from '../../hooks/useSSE';
import { TagPicker } from './TagPicker';
import { SegmentRefineModal } from './SegmentRefineModal';
import { AudioPlaybackBar } from './AudioPlaybackBar';
import { AudioTagTextEditor } from './AudioTagTextEditor';

const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ============ StatusBadge ============

interface StatusBadgeProps {
  status: Segment['status'];
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles: Record<string, string> = {
    pending: 'bg-lemon/25 text-ink',
    generating: 'bg-lilac/25 text-ink',
    generated: 'bg-sage/30 text-ink',
    failed: 'bg-pink/20 text-ink',
  };
  const labels: Record<string, string> = {
    pending: '◌ 等待中',
    generating: '⟳ 生成中',
    generated: '✓ 就绪',
    failed: '✕ 失败',
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-body font-medium uppercase tracking-wider ${styles[status] || ''}`}>
      {labels[status] || status}
    </span>
  );
};

// ============ 主组件 ============

interface SegmentEditorProps {
  broadcastId: number;
  onMerged?: () => void;
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({ broadcastId, onMerged }) => {
  const segments = useStore((s) => s.segments);
  const isSplitting = useStore((s) => s.isSplitting);
  const isMerging = useStore((s) => s.isMerging);
  const fetchSegments = useStore((s) => s.fetchSegments);
  const updateSegmentText = useStore((s) => s.updateSegmentText);
  const regenerateSegment = useStore((s) => s.regenerateSegment);
  const batchGenerateSegments = useStore((s) => s.batchGenerateSegments);
  const deleteSegment = useStore((s) => s.deleteSegment);
  const mergeSegments = useStore((s) => s.mergeSegments);
  const updateSegmentStyleTag = useStore((s) => s.updateSegmentStyleTag);
  const updateSegmentPlaybackRate = useStore((s) => s.updateSegmentPlaybackRate);
  const updateAllSegmentPlaybackRates = useStore((s) => s.updateAllSegmentPlaybackRates);
  const suggestTags = useStore((s) => s.suggestTags);
  const isSuggestingTags = useStore((s) => s.isSuggestingTags);
  const voiceConfig = useStore((s) => s.voiceConfig);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openTagPickerId, setOpenTagPickerId] = useState<number | null>(null);
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [tagEditorSegmentId, setTagEditorSegmentId] = useState<number | null>(null);
  const [updatingPlaybackRateId, setUpdatingPlaybackRateId] = useState<number | 'all' | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [regeneratingSegmentIds, setRegeneratingSegmentIds] = useState<Set<number>>(() => new Set());

  // SSE 监听批量生成进度（始终启用）
  useBatchGenerateSSE(broadcastId, {
    onSegmentProgress: useCallback((segmentId: number, status: string, audioPath?: string, errorMessage?: string) => {
      // 实时更新单个 segment 状态
      useStore.setState((state) => ({
        segments: state.segments.map((s) => {
          if (s.id === segmentId) {
            return {
              ...s,
              status: status as Segment['status'],
              audio_path: audioPath || s.audio_path,
              error_message: status === 'failed' ? (errorMessage || s.error_message || '语音生成失败') : '',
            };
          }
          return s;
        }),
      }));
    }, []),
    onSegmentComplete: useCallback((newSegments: Segment[]) => {
      // 所有 segment 生成完成
      useStore.setState({ segments: newSegments });
    }, []),
    onError: useCallback((errorMsg: string) => {
      setError(errorMsg);
    }, []),
    enabled: true, // 始终启用
  });

  useEffect(() => {
    fetchSegments(broadcastId).catch(() => setError('加载文段列表失败'));
  }, [broadcastId, fetchSegments]);

  // popover 打开时按 Esc 关闭
  useEffect(() => {
    if (openTagPickerId === null) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenTagPickerId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openTagPickerId]);

  if (!segments.length && !isSplitting) return null;

  const hasPendingOrFailed = segments.some((s) => s.status !== 'generated');
  const allGenerated = segments.length > 0 && segments.every((s) => s.status === 'generated');
  const canGenerateVoice = hasSelectedVoice(voiceConfig);
  const hasLocalGenerating = isBatchGenerating || regeneratingSegmentIds.size > 0;
  const commonPlaybackRate = segments.every((segment) => segment.playback_rate === segments[0]?.playback_rate)
    ? segments[0]?.playback_rate || 1
    : null;
  const isSegmentBusy = (segment: Segment) =>
    regeneratingSegmentIds.has(segment.id) || (isBatchGenerating && segment.status === 'generating');

  const handleStartEdit = (seg: Segment) => { setEditingId(seg.id); setEditText(seg.text); setTagEditorSegmentId(null); };
  const handleCancelEdit = () => { setEditingId(null); setEditText(''); setTagEditorSegmentId(null); };
  const handleSaveEdit = async (segId: number) => {
    if (!editText.trim()) return;
    setError(null);
    try { await updateSegmentText(broadcastId, segId, editText.trim()); setEditingId(null); setEditText(''); setTagEditorSegmentId(null); }
    catch { setError('保存编辑失败'); }
  };
  const handleRegenerate = async (segId: number) => {
    setError(null);
    if (!canGenerateVoice) {
      setError(VOICE_REQUIRED_MESSAGE);
      return;
    }
    setRegeneratingSegmentIds((ids) => new Set(ids).add(segId));
    try { await regenerateSegment(broadcastId, segId); }
    catch (err) { setError(getApiErrorMessage(err, '重新生成失败')); }
    finally {
      setRegeneratingSegmentIds((ids) => {
        const next = new Set(ids);
        next.delete(segId);
        return next;
      });
    }
  };
  const handleDelete = async (segId: number) => { setError(null); try { await deleteSegment(broadcastId, segId); } catch { setError('删除失败'); } };
  const handleBatchGenerate = async () => {
    setError(null);
    if (!canGenerateVoice) {
      setError(VOICE_REQUIRED_MESSAGE);
      return;
    }
    setIsBatchGenerating(true);
    try {
      const { results } = await batchGenerateSegments(broadcastId);
      const failed = results.filter((result) => result.status === 'failed');
      if (failed.length > 0) {
        setError(`有 ${failed.length} 个段落生成失败，具体原因已显示在对应段落下方`);
      }
    } catch (err) {
      // 优先展示后端返回的错误文案（如 429 限流、请求体过大、clone 解析失败等）
      setError(getApiErrorMessage(err, '批量生成失败'));
    } finally {
      setIsBatchGenerating(false);
    }
  };
  const handleMerge = async () => { setError(null); try { await mergeSegments(broadcastId); onMerged?.(); } catch { setError('合并失败'); } };
  const handleSetStyleTag = async (segId: number, styleTag: string) => {
    setError(null);
    setOpenTagPickerId(null);
    try { await updateSegmentStyleTag(broadcastId, segId, styleTag); }
    catch { setError('设置风格标签失败'); }
  };
  const handleSetSegmentPlaybackRate = async (segId: number, playbackRate: number) => {
    setError(null);
    setUpdatingPlaybackRateId(segId);
    try { await updateSegmentPlaybackRate(broadcastId, segId, playbackRate); }
    catch (err) { setError(getApiErrorMessage(err, '设置段落倍速失败')); }
    finally { setUpdatingPlaybackRateId(null); }
  };
  const handleSetAllPlaybackRates = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const playbackRate = Number(event.target.value);
    setError(null);
    setUpdatingPlaybackRateId('all');
    try { await updateAllSegmentPlaybackRates(broadcastId, playbackRate); }
    catch (err) { setError(getApiErrorMessage(err, '批量设置倍速失败')); }
    finally { setUpdatingPlaybackRateId(null); }
  };
  const handleSuggestTags = async () => {
    setError(null);
    try { await suggestTags(broadcastId); }
    catch (err) { setError(getApiErrorMessage(err, 'AI 标签优化失败')); }
  };

  if (isSplitting) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-4 h-1 bg-ink/10 rounded-full overflow-hidden">
            <div className="h-full bg-lilac rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <span className="font-body text-[12px] text-ink-soft">正在切分文段...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-lilac" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">段落编辑器</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <label className="flex items-center gap-1.5 font-body text-[11px] text-ink-soft/75">
            全部倍速
            <select
              value={commonPlaybackRate === null ? '' : String(commonPlaybackRate)}
              onChange={handleSetAllPlaybackRates}
              disabled={updatingPlaybackRateId === 'all'}
              className="bg-white/70 text-ink rounded-full px-3 py-1.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors disabled:opacity-40"
            >
              {commonPlaybackRate === null && <option value="">混合</option>}
              {PLAYBACK_RATE_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>{rate}x</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setIsRefineOpen(true)}
            disabled={hasLocalGenerating}
            className="bg-lilac/30 hover:bg-lilac/40 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-3.5 py-2 shadow-btn ui-transition duration-fast uppercase tracking-wider"
          >
            切分精修
          </button>
        </div>
      </div>

      {/* 生成进度指示器 */}
      {hasLocalGenerating && (
        <div className="mb-3 bg-lilac/10 rounded-xl p-3 border border-lilac/20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-[11px] text-ink-soft">正在生成语音...</span>
            <span className="font-body text-[11px] text-lilac">
              {segments.filter(s => s.status === 'generated').length} / {segments.length}
            </span>
          </div>
          <div className="w-full h-1.5 bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-lilac transition-[width] duration-normal"
              style={{
                width: `${(segments.filter(s => s.status === 'generated').length / segments.length) * 100}%`
              }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {segments.map((seg) => (
          (() => {
            const segmentBusy = isSegmentBusy(seg);
            const displayStatus: Segment['status'] = seg.status === 'generating' && !segmentBusy ? 'pending' : seg.status;
            return (
          <div
            key={seg.id}
            className={`bg-white/45 rounded-2xl p-3 border ui-transition duration-slow ${
              segmentBusy
                ? 'border-lilac/40 bg-lilac/5 animate-pulse'
                : seg.status === 'generated'
                ? 'border-sage/30'
                : seg.status === 'failed'
                ? 'border-pink/30 bg-pink/5'
                : 'border-card-border'
            }`}

          >
            {/* 第一行：序号 + 文本 + 状态 + 音频 + 操作 */}
            <div className="flex items-start gap-3">
              <span className="font-display italic text-[18px] font-medium text-lilac min-w-[22px] pt-0.5">
                {String(seg.index + 1).padStart(2, '0')}
              </span>

              <div className="flex-1 min-w-0">
                {editingId === seg.id ? (
                  <div className="animate-fade-in">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full min-h-28 bg-white/60 text-ink rounded-xl px-3 py-2 border border-ink/15 focus:border-ink/25 focus:outline-none resize-y font-body text-[12px] leading-relaxed"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => handleSaveEdit(seg.id)} className="px-3 py-1 bg-sage text-ink text-[11px] font-body rounded-lg shadow-btn">保存</button>
                      <button type="button" onClick={() => setTagEditorSegmentId(seg.id)} className="px-3 py-1 bg-lilac/35 text-ink text-[11px] font-body rounded-lg shadow-btn">标签编辑</button>
                      <button onClick={handleCancelEdit} className="px-3 py-1 text-ink-soft text-[11px] font-body">取消</button>
                    </div>
                    {tagEditorSegmentId === seg.id && (
                      <AudioTagTextEditor
                        label={`段落 ${String(seg.index + 1).padStart(2, '0')}`}
                        value={editText}
                        onChange={setEditText}
                        placeholder="输入段落文本并插入 MiMo 方括号标签"
                        onClose={() => setTagEditorSegmentId(null)}
                      />
                    )}
                  </div>
                ) : (
                  <p className="font-body text-[12px] text-ink leading-relaxed whitespace-pre-wrap break-words">
                    {seg.text}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <StatusBadge status={displayStatus} />
                {seg.status === 'generated' && seg.audio_path && (
                  <AudioPlaybackBar
                    src={`${seg.audio_path}?t=${seg.updated_at}`}
                    variant="segment"
                    visual="progress"
                    playbackRate={seg.playback_rate || 1}
                    showPlaybackRate
                    resetOnEnded
                    playLabel="段落音频"
                    className="w-44 sm:w-52"
                  />
                )}
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => handleStartEdit(seg)} disabled={segmentBusy || editingId === seg.id} className="p-1.5 rounded-lg text-ink-soft/70 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title="编辑">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => handleRegenerate(seg.id)} disabled={segmentBusy || !canGenerateVoice} className="p-1.5 rounded-lg text-ink-soft/70 hover:text-ink hover:bg-white/50 transition-colors disabled:opacity-30" title={canGenerateVoice ? '重新生成' : VOICE_REQUIRED_MESSAGE}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <button onClick={() => handleDelete(seg.id)} disabled={segmentBusy} className="p-1.5 rounded-lg text-ink-soft/70 hover:text-pink hover:bg-white/50 transition-colors disabled:opacity-30" title="删除">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            {/* 第二行：风格标签 meta（编辑态隐藏） */}
            {editingId !== seg.id && (
              <div className="relative flex flex-wrap items-center gap-2 mt-2 pl-[34px]">
                <span className="text-[11px] text-ink-soft/60">风格</span>
                <button
                  type="button"
                  onClick={() => setOpenTagPickerId(openTagPickerId === seg.id ? null : seg.id)}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
                    seg.style_tag ? 'bg-lilac/20 border-lilac/40 text-ink' : 'bg-paper-2/40 border-dashed border-card-border text-ink-soft/70'
                  }`}
                >
                  {seg.style_tag ? `(${seg.style_tag})` : '+ 风格'}
                </button>
                {openTagPickerId === seg.id && (
                  <TagPicker
                    value={seg.style_tag}
                    onSelect={(tag) => handleSetStyleTag(seg.id, tag)}
                    onClose={() => setOpenTagPickerId(null)}
                  />
                )}
                <span className="ml-2 text-[11px] text-ink-soft/60">倍速</span>
                <select
                  value={seg.playback_rate || 1}
                  onChange={(event) => handleSetSegmentPlaybackRate(seg.id, Number(event.target.value))}
                  disabled={updatingPlaybackRateId === seg.id}
                  className="bg-white/70 text-ink rounded-full px-2.5 py-0.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[11px] transition-colors disabled:opacity-40"
                  title="设置本段播放和下载倍速"
                >
                  {PLAYBACK_RATE_OPTIONS.map((rate) => (
                    <option key={rate} value={rate}>{rate}x</option>
                  ))}
                </select>
              </div>
            )}

            {seg.status === 'failed' && seg.error_message && (
              <div className="mt-2 ml-[34px] bg-pink/10 border border-pink/25 rounded-xl px-3 py-2 font-body text-[11px] text-ink leading-relaxed">
                {seg.error_message}
              </div>
            )}
          </div>
            );
          })()
        ))}
      </div>

      {error && (
        <div className="mb-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">{error}</div>
      )}
      {!canGenerateVoice && (
        <div className="mb-3 rounded-xl border border-lemon/45 bg-lemon/15 p-3 font-body text-[12px] text-ink-soft">
          选择音色后才能生成段落音频。
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSuggestTags}
          disabled={isSuggestingTags || segments.length === 0}
          className="flex-1 bg-lemon/30 hover:bg-lemon/40 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn ui-transition duration-fast uppercase tracking-wider"
        >
          {isSuggestingTags ? '优化中...' : 'AI 标签优化'}
        </button>
        <button
          onClick={handleBatchGenerate}
          disabled={!hasPendingOrFailed || isSuggestingTags || !canGenerateVoice || isBatchGenerating}
          className="flex-1 bg-sage hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn ui-transition duration-fast uppercase tracking-wider"
        >
          {isBatchGenerating ? '生成中...' : canGenerateVoice ? '全部生成' : '先选音色'}
        </button>
        <button
          onClick={handleMerge}
          disabled={!allGenerated || isMerging}
          className="flex-1 bg-lilac hover:brightness-105 disabled:opacity-40 text-ink font-body font-medium text-[12px] rounded-xl px-4 py-2.5 shadow-btn ui-transition duration-fast uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {isMerging ? (
            <>
              <div className="w-3 h-1 bg-ink/20 rounded-full overflow-hidden"><div className="h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} /></div>
              合并中...
            </>
          ) : '合并音频'}
        </button>
      </div>

      {isRefineOpen && (
        <SegmentRefineModal
          broadcastId={broadcastId}
          segments={segments}
          onClose={() => setIsRefineOpen(false)}
        />
      )}
    </div>
  );
};

export default SegmentEditor;
