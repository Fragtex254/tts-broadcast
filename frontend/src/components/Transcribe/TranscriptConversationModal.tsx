import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, CaretUp, Eye, Funnel, MagnifyingGlass } from '@phosphor-icons/react';
import type { TranscriptSpeaker, TranscriptTurn } from '../../store';
import { formatTranscriptTime } from '../../pages/transcriptWorkspaceModel';
import { ModalShell } from '../ModalShell';
import { TranscriptConversationTurn } from './TranscriptConversationTurn';
import {
  createTranscriptSpeakerIndexes,
  filterTranscriptConversationTurns,
  getTranscriptSpeakerInitial,
  getTranscriptSpeakerTone,
} from './transcriptConversationModel';
import { useVirtualTranscriptTurns } from './useVirtualTranscriptTurns';

interface VirtualTurnRowProps {
  turnId: number;
  start: number;
  onMeasure: (turnId: number, height: number) => void;
  children: React.ReactNode;
}

const VirtualTurnRow: React.FC<VirtualTurnRowProps> = ({ turnId, start, onMeasure, children }) => {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => onMeasure(turnId, row.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [onMeasure, turnId]);

  return (
    <div ref={rowRef} className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${start}px)` }}>
      {children}
    </div>
  );
};

interface TranscriptConversationModalProps {
  isOpen: boolean;
  title: string;
  turns: TranscriptTurn[];
  speakers: TranscriptSpeaker[];
  onClose: () => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
  initialEvidenceSegmentIndex?: number | null;
  evidenceEndSegmentIndex?: number | null;
}

export const TranscriptConversationModal: React.FC<TranscriptConversationModalProps> = ({
  isOpen,
  title,
  turns,
  speakers,
  onClose,
  onCorrect,
  initialEvidenceSegmentIndex = null,
  evidenceEndSegmentIndex = null,
}) => {
  const requestedEvidenceEnd = evidenceEndSegmentIndex ?? initialEvidenceSegmentIndex;
  const evidenceRangeStart = initialEvidenceSegmentIndex === null || requestedEvidenceEnd === null
    ? null
    : Math.min(initialEvidenceSegmentIndex, requestedEvidenceEnd);
  const evidenceRangeEnd = initialEvidenceSegmentIndex === null || requestedEvidenceEnd === null
    ? null
    : Math.max(initialEvidenceSegmentIndex, requestedEvidenceEnd);
  const evidenceTurnIds = useMemo(() => new Set(turns.filter((turn) => (
    evidenceRangeStart !== null
    && evidenceRangeEnd !== null
    && turn.evidence_segment_indexes.some((index) => index >= evidenceRangeStart && index <= evidenceRangeEnd)
  )).map((turn) => turn.id)), [evidenceRangeEnd, evidenceRangeStart, turns]);
  const initialTurnId = initialEvidenceSegmentIndex === null
    ? null
    : turns.find((turn) => evidenceTurnIds.has(turn.id))?.id || null;
  const [query, setQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<number | null>(initialTurnId);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [editingTurnId, setEditingTurnId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [closeNotice, setCloseNotice] = useState(false);
  const pendingScrollTurnIdRef = useRef<number | null>(initialTurnId);
  const pendingFocusTurnIdRef = useRef<number | null>(null);
  const speakerNames = useMemo(() => new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name])), [speakers]);
  const speakerIndexes = useMemo(() => createTranscriptSpeakerIndexes(speakers), [speakers]);
  const speakerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    turns.forEach((turn) => counts.set(turn.speaker_key, (counts.get(turn.speaker_key) || 0) + 1));
    return counts;
  }, [turns]);
  const displayedTurns = useMemo(
    () => filterTranscriptConversationTurns(turns, speakerNames, '', speakerFilter),
    [speakerFilter, speakerNames, turns],
  );
  const matchingTurns = useMemo(
    () => query.trim() ? filterTranscriptConversationTurns(turns, speakerNames, query, speakerFilter) : [],
    [query, speakerFilter, speakerNames, turns],
  );
  const displayedTurnIds = useMemo(() => displayedTurns.map((turn) => turn.id), [displayedTurns]);
  const safeCurrentMatchIndex = Math.min(currentMatchIndex, Math.max(0, matchingTurns.length - 1));
  const searchTargetTurnId = matchingTurns[safeCurrentMatchIndex]?.id || null;
  const {
    layout,
    measureTurn,
    progressPercent,
    scrollContainerRef,
    scrollToIndex,
    virtualItems,
    visibleEndIndex,
  } = useVirtualTranscriptTurns({
    isEnabled: isOpen,
    turnIds: displayedTurnIds,
    pinnedTurnId: editingTurnId || activeTurnId || searchTargetTurnId,
  });
  const activeTurn = activeTurnId === null ? null : turns.find((turn) => turn.id === activeTurnId) || null;
  const editingTurn = editingTurnId === null ? null : turns.find((turn) => turn.id === editingTurnId) || null;
  const activeSpeakerKey = activeTurn?.speaker_key || speakerFilter;
  const hasQuery = query.trim().length > 0;

  useLayoutEffect(() => {
    const pendingTurnId = pendingScrollTurnIdRef.current;
    if (pendingTurnId === null) return;
    const displayedIndex = displayedTurns.findIndex((turn) => turn.id === pendingTurnId);
    if (displayedIndex < 0) return;
    pendingScrollTurnIdRef.current = null;
    scrollToIndex(displayedIndex);
  }, [displayedTurns, scrollToIndex]);

  useLayoutEffect(() => {
    const pendingTurnId = pendingFocusTurnIdRef.current;
    if (pendingTurnId === null) return;
    const target = document.getElementById(`conversation-turn-${pendingTurnId}`);
    if (!target) return;
    pendingFocusTurnIdRef.current = null;
    target.focus({ preventScroll: true });
  }, [activeTurnId, virtualItems]);

  const applySpeakerFilter = (nextSpeakerFilter: string | null) => {
    if (editingTurn && nextSpeakerFilter && editingTurn.speaker_key !== nextSpeakerFilter) return;
    const nextDisplayedTurns = filterTranscriptConversationTurns(turns, speakerNames, '', nextSpeakerFilter);
    const nextMatches = query.trim()
      ? filterTranscriptConversationTurns(turns, speakerNames, query, nextSpeakerFilter)
      : [];
    setSpeakerFilter(nextSpeakerFilter);
    setCurrentMatchIndex(0);
    setActiveTurnId(nextMatches[0]?.id || null);
    pendingScrollTurnIdRef.current = nextMatches[0]?.id || nextDisplayedTurns[0]?.id || null;
  };

  const toggleSpeakerFilter = (speakerKey: string) => {
    applySpeakerFilter(speakerFilter === speakerKey ? null : speakerKey);
  };

  const filterToSpeaker = (speakerKey: string) => {
    applySpeakerFilter(speakerKey);
  };

  const clearFilters = () => {
    setQuery('');
    setSpeakerFilter(null);
    setCurrentMatchIndex(0);
    setActiveTurnId(null);
    pendingScrollTurnIdRef.current = turns[0]?.id || null;
  };

  const updateQuery = (value: string) => {
    const nextMatches = value.trim()
      ? filterTranscriptConversationTurns(turns, speakerNames, value, speakerFilter)
      : [];
    setQuery(value);
    setCurrentMatchIndex(0);
    setActiveTurnId(nextMatches[0]?.id || null);
    if (nextMatches.length > 0) {
      const displayedIndex = displayedTurns.findIndex((turn) => turn.id === nextMatches[0].id);
      if (displayedIndex >= 0) scrollToIndex(displayedIndex);
    }
  };

  const jumpToMatch = (direction: -1 | 1) => {
    if (matchingTurns.length === 0) return;
    const nextIndex = (safeCurrentMatchIndex + direction + matchingTurns.length) % matchingTurns.length;
    const targetTurn = matchingTurns[nextIndex];
    const displayedIndex = displayedTurns.findIndex((turn) => turn.id === targetTurn.id);
    if (displayedIndex < 0) return;
    setCurrentMatchIndex(nextIndex);
    setActiveTurnId(targetTurn.id);
    scrollToIndex(displayedIndex);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !hasQuery) return;
    event.preventDefault();
    jumpToMatch(event.shiftKey ? -1 : 1);
  };

  const navigateFromTurn = (turnId: number, direction: -1 | 1) => {
    const currentIndex = displayedTurns.findIndex((turn) => turn.id === turnId);
    const nextIndex = Math.min(displayedTurns.length - 1, Math.max(0, currentIndex + direction));
    const nextTurn = displayedTurns[nextIndex];
    if (!nextTurn || nextTurn.id === turnId) return;
    setActiveTurnId(nextTurn.id);
    pendingFocusTurnIdRef.current = nextTurn.id;
    scrollToIndex(nextIndex);
  };

  const finishEditing = () => {
    setEditingTurnId(null);
    setEditingDraft('');
    setCloseNotice(false);
    setActiveTurnId(null);
  };

  const handleClose = () => {
    if (editingTurnId !== null) {
      setCloseNotice(true);
      setActiveTurnId(editingTurnId);
      return;
    }
    onClose();
  };

  const searchInput = (
    <label className="relative hidden w-56 sm:block">
      <span className="sr-only">搜索逐字稿</span>
      <MagnifyingGlass aria-hidden="true" size={14} weight="regular" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/45" />
      <input
        type="search"
        value={query}
        onChange={(event) => updateQuery(event.target.value)}
        onKeyDown={handleSearchKeyDown}
        aria-keyshortcuts="Enter Shift+Enter"
        placeholder="搜索逐字稿"
        className="w-full rounded-xl border border-card-border bg-white/70 py-2.5 pl-9 pr-3.5 font-body text-[11px] text-ink outline-none transition-colors placeholder:text-ink-soft/40 focus:border-ink/20"
      />
    </label>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      title="逐字稿阅读"
      subtitle={<span className="block max-w-[680px] truncate">{title} · {speakers.length} 位说话人 · {turns.length} 个发言轮次</span>}
      onClose={handleClose}
      headerActions={searchInput}
      size="xl"
      accent="lilac"
      contentClassName="overflow-hidden p-0"
      panelClassName="h-[calc(100vh-3rem)]"
      panelStyle={{ maxWidth: '1320px' }}
      closeOnBackdrop={false}
      ariaLabel="逐字稿阅读"
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-paper lg:grid-cols-[220px_minmax(0,1fr)] lg:grid-rows-1 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
        <aside className="border-b border-card-border bg-white/30 p-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r" aria-label="说话人筛选">
          <label className="relative mb-3 block sm:hidden">
            <span className="sr-only">在逐字稿中搜索</span>
            <MagnifyingGlass aria-hidden="true" size={14} weight="regular" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/45" />
            <input
              type="search"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              aria-keyshortcuts="Enter Shift+Enter"
              placeholder="搜索逐字稿"
              className="w-full rounded-xl border border-card-border bg-white/70 py-2.5 pl-9 pr-3.5 font-body text-[11px] text-ink outline-none transition-colors placeholder:text-ink-soft/40 focus:border-ink/20"
            />
          </label>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-display text-[13px] font-medium text-ink"><Funnel aria-hidden="true" size={13} weight="regular" />说话人</h2>
            {speakerFilter && (
              <button type="button" onClick={() => applySpeakerFilter(null)} className="font-body text-[9px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">
                显示全部
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {speakers.map((speaker, index) => {
              const tone = getTranscriptSpeakerTone(index);
              const isCurrentSpeaker = activeSpeakerKey === speaker.speaker_key;
              const isFiltered = speakerFilter === speaker.speaker_key;
              const isBlockedByEditing = editingTurn !== null && editingTurn.speaker_key !== speaker.speaker_key;
              return (
                <button
                  key={speaker.id}
                  type="button"
                  aria-pressed={isFiltered}
                  disabled={isBlockedByEditing}
                  title={isBlockedByEditing ? '请先保存或取消当前校对' : undefined}
                  onClick={() => toggleSpeakerFilter(speaker.speaker_key)}
                  className={`min-w-[178px] rounded-2xl border p-3 text-left transition-all duration-200 disabled:opacity-40 lg:min-w-0 ${
                    isCurrentSpeaker || isFiltered
                      ? `${tone.strongSurface} ${tone.mutedBorder} shadow-card`
                      : 'border-card-border bg-white/50 hover:bg-white/75'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-medium text-ink ${tone.badge}`}>
                      {getTranscriptSpeakerInitial(speaker.display_name, speaker.speaker_key)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-body text-[12px] font-semibold text-ink">{speaker.display_name}</span>
                      <span className="mt-0.5 block font-body text-[9px] text-ink-soft/55">发言 {speakerCounts.get(speaker.speaker_key) || 0} 轮</span>
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-1 font-body text-[9px] text-ink-soft/65"><Eye aria-hidden="true" size={11} weight="regular" />{isFiltered ? '再次点击显示全部' : '只看此人'}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-white/25" aria-label="对话逐字稿">
          <div className="shrink-0 px-3 pt-4 sm:px-6 sm:pt-5 lg:px-8">
            <div className="mx-auto max-w-3xl">
            {closeNotice && (
              <p className="mb-3 animate-shake rounded-xl border border-pink/30 bg-pink/10 px-3 py-2 font-body text-[11px] text-ink" role="alert">请先保存或取消当前校对，再关闭逐字稿。</p>
            )}
            {(hasQuery || speakerFilter) && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-card-border bg-white/60 px-4 py-3">
                <p className="font-body text-[10px] text-ink-soft" role="status" aria-live="polite">
                  {hasQuery ? `找到 ${matchingTurns.length} 个匹配` : `正在查看 ${displayedTurns.length} 个发言`}{speakerFilter ? ` · ${speakerNames.get(speakerFilter) || speakerFilter}` : ''}{hasQuery ? ` · “${query.trim()}”` : ''}
                </p>
                <div className="flex items-center gap-2">
                  {hasQuery && matchingTurns.length > 0 && (
                    <>
                      <span aria-live="polite" className="min-w-12 text-center font-body text-[10px] tabular-nums text-ink-soft">{safeCurrentMatchIndex + 1} / {matchingTurns.length}</span>
                      <button type="button" onClick={() => jumpToMatch(-1)} title="上一处匹配（Shift+Enter）" aria-label="上一处匹配" className="rounded-lg border border-card-border bg-white/70 p-1.5 text-ink-soft transition-colors hover:text-ink">
                        <CaretUp aria-hidden="true" size={13} weight="bold" />
                      </button>
                      <button type="button" onClick={() => jumpToMatch(1)} title="下一处匹配（Enter）" aria-label="下一处匹配" className="rounded-lg border border-card-border bg-white/70 p-1.5 text-ink-soft transition-colors hover:text-ink">
                        <CaretDown aria-hidden="true" size={13} weight="bold" />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={clearFilters} className="font-body text-[10px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">
                    清除筛选
                  </button>
                </div>
              </div>
            )}
            <div className="mb-3 flex items-center gap-3 px-1 font-body text-[9px] text-ink-soft/55">
              <span className="shrink-0 tabular-nums">当前位置 {Math.min(visibleEndIndex + 1, displayedTurns.length)} / {displayedTurns.length}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/5" role="progressbar" aria-label="逐字稿阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-valuetext={`当前位置 ${Math.min(visibleEndIndex + 1, displayedTurns.length)} / ${displayedTurns.length}`}>
                <div className="h-full rounded-full bg-lilac transition-[width] duration-150" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums">{progressPercent}%</span>
            </div>
            </div>
          </div>

          <div ref={scrollContainerRef} data-testid="transcript-virtual-scroll" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-6 sm:pb-5 lg:px-8">
            <div className="relative mx-auto max-w-3xl" style={{ height: `${layout.totalSize}px` }} role="feed" aria-label="发言列表" aria-busy="false">
            {virtualItems.map((virtualItem) => {
              const turn = displayedTurns[virtualItem.index];
              const speakerIndex = speakerIndexes.get(turn.speaker_key) || 0;
              const speakerName = speakerNames.get(turn.speaker_key) || turn.speaker_key;
              return (
                <VirtualTurnRow
                  key={turn.id}
                  turnId={turn.id}
                  start={virtualItem.start}
                  onMeasure={measureTurn}
                >
                  <TranscriptConversationTurn
                    turn={turn}
                    speakerName={speakerName}
                    tone={getTranscriptSpeakerTone(speakerIndex)}
                    isActive={activeTurnId === turn.id}
                    isMuted={activeTurnId !== null && activeTurnId !== turn.id && !evidenceTurnIds.has(turn.id)}
                    isEvidence={evidenceTurnIds.has(turn.id)}
                    isSearchTarget={hasQuery && searchTargetTurnId === turn.id}
                    isEditing={editingTurnId === turn.id}
                    editingDraft={editingTurnId === turn.id ? editingDraft : ''}
                    positionInSet={virtualItem.index + 1}
                    setSize={displayedTurns.length}
                    onActiveChange={setActiveTurnId}
                    onEditingDraftChange={setEditingDraft}
                    onFinishEditing={finishEditing}
                    onFilterSpeaker={filterToSpeaker}
                    onNavigate={(direction) => navigateFromTurn(turn.id, direction)}
                    onStartEditing={(turnId, value) => { setEditingTurnId(turnId); setEditingDraft(value); setCloseNotice(false); }}
                    onCorrect={onCorrect}
                  />
                </VirtualTurnRow>
              );
            })}

            {displayedTurns.length === 0 && (
              <div className="p-12 text-center animate-fade-in">
                <p className="font-display italic text-[16px] text-ink-soft/40">没有找到匹配的发言</p>
                <button type="button" onClick={clearFilters} className="mt-2 font-body text-[11px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">清除筛选</button>
              </div>
            )}
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 border-l border-card-border bg-white/30 p-4 xl:block" aria-label="当前定位">
          <div className="sticky top-0">
            <h2 className="font-display text-[13px] font-medium text-ink">当前定位</h2>
            {activeTurn ? (
              <div data-testid="active-turn-context" className={`mt-3 rounded-2xl border p-4 ${getTranscriptSpeakerTone(speakerIndexes.get(activeTurn.speaker_key) || 0).strongSurface} ${getTranscriptSpeakerTone(speakerIndexes.get(activeTurn.speaker_key) || 0).mutedBorder}`}>
                <p className="font-body text-[13px] font-semibold text-ink">{speakerNames.get(activeTurn.speaker_key) || activeTurn.speaker_key}</p>
                <p className="mt-1 font-body text-[11px] tabular-nums text-ink-soft/70">{formatTranscriptTime(activeTurn.start_seconds)}–{formatTranscriptTime(activeTurn.end_seconds)}</p>
                <div className="my-3 border-t border-card-border" />
                <p className="font-body text-[10px] text-ink-soft">发言 {activeTurn.turn_index + 1} / {turns.length}</p>
                <p className="mt-3 font-body text-[10px] leading-relaxed text-ink-soft/65">可在高亮发言区域筛选该说话人或校对文字。</p>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-card-border bg-white/35 p-4">
                <p className="font-display italic text-[13px] text-ink-soft/45">悬浮或聚焦一段发言</p>
                <p className="mt-2 font-body text-[10px] leading-relaxed text-ink-soft/50">这里会同步显示说话人、时间和发言序号。</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </ModalShell>
  );
};

export default TranscriptConversationModal;
