import React, { useEffect, useMemo, useState } from 'react';
import useStore from '../../store';
import type { Segment, SegmentDraftInput } from '../../store';
import { getApiErrorMessage } from '../../services/apiError';
import { STYLE_TAGS, sanitizeStyleTag } from '../../constants/toneTags';

const MAX_SEGMENT_TEXT_LENGTH = 1024;

interface SegmentDraft {
  key: string;
  id?: number;
  text: string;
  styleTag: string;
}

interface SegmentRefineModalProps {
  broadcastId: number;
  segments: Segment[];
  onClose: () => void;
}

function createDraft(segment: Segment, index: number): SegmentDraft {
  return {
    key: `segment-${segment.id}-${index}`,
    id: segment.id,
    text: segment.text,
    styleTag: segment.style_tag || '',
  };
}

function splitTextAtNaturalPoint(text: string): string[] {
  const lineParts = text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  if (lineParts.length > 1) return lineParts;

  const value = text.trim();
  const middle = Math.floor(value.length / 2);
  const punctuation = /[。！？!?；;]/;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < value.length; i += 1) {
    if (!punctuation.test(value[i])) continue;
    const distance = Math.abs(i - middle);
    if (distance < bestDistance && i < value.length - 1) {
      bestIndex = i + 1;
      bestDistance = distance;
    }
  }

  if (bestIndex <= 0) return [value];
  return [value.slice(0, bestIndex).trim(), value.slice(bestIndex).trim()].filter(Boolean);
}

export const SegmentRefineModal: React.FC<SegmentRefineModalProps> = ({
  broadcastId,
  segments,
  onClose,
}) => {
  const replaceSegments = useStore((s) => s.replaceSegments);
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() => segments.map(createDraft));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const hasInvalidDraft = useMemo(() => (
    drafts.some((draft) => !draft.text.trim() || draft.text.trim().length > MAX_SEGMENT_TEXT_LENGTH)
  ), [drafts]);

  const updateDraft = (key: string, patch: Partial<Pick<SegmentDraft, 'text' | 'styleTag'>>) => {
    setDrafts((current) => current.map((draft) => (
      draft.key === key ? { ...draft, ...patch } : draft
    )));
  };

  const mergeAt = (index: number, direction: 'previous' | 'next') => {
    setError(null);
    setDrafts((current) => {
      const targetIndex = direction === 'previous' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const mergedText = direction === 'previous'
        ? `${next[targetIndex].text.trim()}\n${next[index].text.trim()}`
        : `${next[index].text.trim()}\n${next[targetIndex].text.trim()}`;
      const mergedStyleTag = next[index].styleTag || next[targetIndex].styleTag;
      const keepIndex = direction === 'previous' ? targetIndex : index;
      const removeIndex = direction === 'previous' ? index : targetIndex;
      next[keepIndex] = {
        ...next[keepIndex],
        text: mergedText.trim(),
        styleTag: mergedStyleTag,
      };
      next.splice(removeIndex, 1);
      return next;
    });
  };

  const splitAt = (index: number) => {
    setError(null);
    const draft = drafts[index];
    if (!draft) return;
    const parts = splitTextAtNaturalPoint(draft.text);
    if (parts.length <= 1) {
      setError('请先在文本中换行，或在段落中保留可拆分标点');
      return;
    }

    setDrafts((current) => {
      const nextDrafts = parts.map((part, partIndex) => ({
        key: `${draft.key}-split-${Date.now()}-${partIndex}`,
        id: partIndex === 0 ? draft.id : undefined,
        text: part,
        styleTag: draft.styleTag,
      }));
      return [
        ...current.slice(0, index),
        ...nextDrafts,
        ...current.slice(index + 1),
      ];
    });
  };

  const handleSave = async () => {
    const payload: SegmentDraftInput[] = drafts.map((draft) => ({
      id: draft.id,
      text: draft.text.trim(),
      styleTag: sanitizeStyleTag(draft.styleTag),
    }));
    const invalid = payload.find((draft) => !draft.text || draft.text.length > MAX_SEGMENT_TEXT_LENGTH);
    if (invalid) {
      setError(`每个段落必须有文本，且不能超过 ${MAX_SEGMENT_TEXT_LENGTH} 个字`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await replaceSegments(broadcastId, payload);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, '保存切分整理失败'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-paper flex flex-col animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="切分精修"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-card-border bg-white/45 backdrop-blur-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-lilac" />
            <h3 className="font-display italic text-[18px] font-medium text-ink-soft">切分精修</h3>
          </div>
          <p className="font-body text-[12px] text-ink-soft/55 mt-1">
            {drafts.length} 段 · 单段最多 {MAX_SEGMENT_TEXT_LENGTH} 字
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-soft hover:text-ink font-body text-[12px] transition-colors shrink-0"
        >
          关闭
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="max-w-6xl mx-auto space-y-3">
          {drafts.map((draft, index) => {
              const textLength = draft.text.trim().length;
              const isTooLong = textLength > MAX_SEGMENT_TEXT_LENGTH;
              return (
                <section
                  key={draft.key}
                  className={`bg-white/[0.55] backdrop-blur-sm rounded-card border p-4 transition-colors ${
                    isTooLong ? 'border-pink/40 bg-pink/5' : 'border-card-border'
                  }`}
                  style={{ animation: `fade-in-up 0.25s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.02}s both` }}
                >
                  <div className="flex items-start gap-3">
                    <span className="font-display italic text-[18px] font-medium text-lilac min-w-[28px]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <textarea
                        value={draft.text}
                        onChange={(event) => updateDraft(draft.key, { text: event.target.value })}
                        className="w-full h-32 bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[13px] leading-relaxed resize-y transition-colors"
                      />
                      <div className="flex flex-col lg:flex-row gap-2">
                        <input
                          value={draft.styleTag}
                          onChange={(event) => updateDraft(draft.key, { styleTag: sanitizeStyleTag(event.target.value) })}
                          placeholder="情绪铺垫"
                          className="flex-1 bg-white/70 text-ink rounded-xl px-3.5 py-2 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          {STYLE_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => updateDraft(draft.key, { styleTag: tag })}
                              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                                draft.styleTag === tag
                                  ? 'bg-lilac/30 border-lilac text-ink'
                                  : 'bg-paper-2/40 border-card-border text-ink-soft hover:bg-lilac/10'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="w-28 flex-shrink-0 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => mergeAt(index, 'previous')}
                        disabled={index === 0}
                        className="w-full bg-lilac/25 hover:bg-lilac/35 disabled:opacity-35 text-ink font-body text-[11px] rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        合并上段
                      </button>
                      <button
                        type="button"
                        onClick={() => mergeAt(index, 'next')}
                        disabled={index === drafts.length - 1}
                        className="w-full bg-lilac/25 hover:bg-lilac/35 disabled:opacity-35 text-ink font-body text-[11px] rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        合并下段
                      </button>
                      <button
                        type="button"
                        onClick={() => splitAt(index)}
                        className="w-full bg-sage/55 hover:bg-sage/70 text-ink font-body text-[11px] rounded-lg px-2.5 py-1.5 transition-colors"
                      >
                        拆分
                      </button>
                      <span className={`block text-right font-body text-[10px] ${isTooLong ? 'text-pink' : 'text-ink-soft/45'}`}>
                        {textLength}/{MAX_SEGMENT_TEXT_LENGTH}
                      </span>
                    </div>
                  </div>
                </section>
              );
            })}
        </div>
      </div>

      <div className="border-t border-card-border bg-white/35 px-5 py-4">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="mb-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-ink-soft hover:text-ink font-body text-[12px] transition-colors px-3 py-2"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || hasInvalidDraft}
              className="bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
            >
              {isSaving ? '保存中...' : '保存整理'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SegmentRefineModal;
