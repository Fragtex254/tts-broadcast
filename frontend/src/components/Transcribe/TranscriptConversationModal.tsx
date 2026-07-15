import React, { useMemo, useState } from 'react';
import { Eye, Funnel, MagnifyingGlass } from '@phosphor-icons/react';
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

const CONVERSATION_PAGE_SIZE = 100;

interface TranscriptConversationModalProps {
  isOpen: boolean;
  title: string;
  turns: TranscriptTurn[];
  speakers: TranscriptSpeaker[];
  onClose: () => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
}

export const TranscriptConversationModal: React.FC<TranscriptConversationModalProps> = ({
  isOpen,
  title,
  turns,
  speakers,
  onClose,
  onCorrect,
}) => {
  const [query, setQuery] = useState('');
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(CONVERSATION_PAGE_SIZE);
  const speakerNames = useMemo(() => new Map(speakers.map((speaker) => [speaker.speaker_key, speaker.display_name])), [speakers]);
  const speakerIndexes = useMemo(() => createTranscriptSpeakerIndexes(speakers), [speakers]);
  const speakerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    turns.forEach((turn) => counts.set(turn.speaker_key, (counts.get(turn.speaker_key) || 0) + 1));
    return counts;
  }, [turns]);
  const filteredTurns = useMemo(
    () => filterTranscriptConversationTurns(turns, speakerNames, query, speakerFilter),
    [query, speakerFilter, speakerNames, turns],
  );
  const visibleTurns = filteredTurns.slice(0, visibleCount);
  const activeTurn = activeTurnId === null ? null : turns.find((turn) => turn.id === activeTurnId) || null;
  const activeSpeakerKey = activeTurn?.speaker_key || speakerFilter;
  const hasQuery = query.trim().length > 0;

  const toggleSpeakerFilter = (speakerKey: string) => {
    setSpeakerFilter((current) => current === speakerKey ? null : speakerKey);
    setVisibleCount(CONVERSATION_PAGE_SIZE);
    setActiveTurnId(null);
  };

  const filterToSpeaker = (speakerKey: string) => {
    setSpeakerFilter(speakerKey);
    setVisibleCount(CONVERSATION_PAGE_SIZE);
    setActiveTurnId(null);
  };

  const clearFilters = () => {
    setQuery('');
    setSpeakerFilter(null);
    setVisibleCount(CONVERSATION_PAGE_SIZE);
    setActiveTurnId(null);
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    setVisibleCount(CONVERSATION_PAGE_SIZE);
    setActiveTurnId(null);
  };

  const searchInput = (
    <label className="relative hidden w-56 sm:block">
      <span className="sr-only">搜索逐字稿</span>
      <MagnifyingGlass aria-hidden="true" size={14} weight="regular" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/45" />
      <input
        type="search"
        value={query}
        onChange={(event) => updateQuery(event.target.value)}
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
      onClose={onClose}
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
              placeholder="搜索逐字稿"
              className="w-full rounded-xl border border-card-border bg-white/70 py-2.5 pl-9 pr-3.5 font-body text-[11px] text-ink outline-none transition-colors placeholder:text-ink-soft/40 focus:border-ink/20"
            />
          </label>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-display text-[13px] font-medium text-ink"><Funnel aria-hidden="true" size={13} weight="regular" />说话人</h2>
            {speakerFilter && (
              <button type="button" onClick={() => { setSpeakerFilter(null); setVisibleCount(CONVERSATION_PAGE_SIZE); setActiveTurnId(null); }} className="font-body text-[9px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">
                显示全部
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {speakers.map((speaker, index) => {
              const tone = getTranscriptSpeakerTone(index);
              const isCurrentSpeaker = activeSpeakerKey === speaker.speaker_key;
              const isFiltered = speakerFilter === speaker.speaker_key;
              return (
                <button
                  key={speaker.id}
                  type="button"
                  aria-pressed={isFiltered}
                  onClick={() => toggleSpeakerFilter(speaker.speaker_key)}
                  className={`min-w-[178px] rounded-2xl border p-3 text-left transition-all duration-200 lg:min-w-0 ${
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

        <section className="min-h-0 overflow-y-auto bg-white/25 px-3 py-4 sm:px-6 sm:py-5 lg:px-8" aria-label="对话逐字稿">
          <div className="mx-auto max-w-3xl space-y-2.5">
            {(hasQuery || speakerFilter) && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-card-border bg-white/60 px-4 py-3">
                <p className="font-body text-[10px] text-ink-soft">
                  找到 {filteredTurns.length} 个发言{speakerFilter ? ` · ${speakerNames.get(speakerFilter) || speakerFilter}` : ''}{hasQuery ? ` · “${query.trim()}”` : ''}
                </p>
                <button type="button" onClick={clearFilters} className="font-body text-[10px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">
                  清除筛选
                </button>
              </div>
            )}

            {visibleTurns.map((turn) => {
              const speakerIndex = speakerIndexes.get(turn.speaker_key) || 0;
              const speakerName = speakerNames.get(turn.speaker_key) || turn.speaker_key;
              return (
                <TranscriptConversationTurn
                  key={turn.id}
                  turn={turn}
                  speakerName={speakerName}
                  tone={getTranscriptSpeakerTone(speakerIndex)}
                  isActive={activeTurnId === turn.id}
                  isMuted={activeTurnId !== null && activeTurnId !== turn.id}
                  onActiveChange={setActiveTurnId}
                  onFilterSpeaker={filterToSpeaker}
                  onCorrect={onCorrect}
                />
              );
            })}

            {filteredTurns.length === 0 && (
              <div className="p-12 text-center animate-fade-in">
                <p className="font-display italic text-[16px] text-ink-soft/40">没有找到匹配的发言</p>
                <button type="button" onClick={clearFilters} className="mt-2 font-body text-[11px] text-ink-soft underline decoration-card-border underline-offset-4 hover:text-ink">清除筛选</button>
              </div>
            )}

            {visibleCount < filteredTurns.length && (
              <div className="flex flex-col items-center gap-2 border-t border-card-border py-5">
                <p className="font-body text-[10px] text-ink-soft/55">已显示 {visibleTurns.length} / {filteredTurns.length}</p>
                <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + CONVERSATION_PAGE_SIZE, filteredTurns.length))} className="rounded-full border border-card-border bg-white/70 px-4 py-2 font-body text-[11px] text-ink-soft transition hover:border-lilac/55 hover:text-ink">
                  继续显示 {Math.min(CONVERSATION_PAGE_SIZE, filteredTurns.length - visibleCount)} 个
                </button>
              </div>
            )}
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
