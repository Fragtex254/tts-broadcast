import React from 'react';
import type { TranscriptSpeaker, TranscriptSummaryItem, TranscriptTurn } from '../../store';
import { TranscriptConversationReader } from './TranscriptConversationModal';
import type { BilibiliVideoReference } from './bilibiliPlayerModel';

interface TranscriptTurnListProps {
  title: string;
  turns: TranscriptTurn[];
  speakers: TranscriptSpeaker[];
  onOpenConversation: () => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
  bilibiliVideo?: BilibiliVideoReference | null;
  sourceUrl?: string;
  videoSeekSeconds?: number;
  videoSeekRequestId?: number;
  onSeekToVideo?: (seconds: number) => void;
  playerContainerRef?: React.RefObject<HTMLElement | null>;
  summaryItems?: TranscriptSummaryItem[];
  isSummaryStale?: boolean;
}

export const TranscriptTurnList: React.FC<TranscriptTurnListProps> = ({
  title,
  turns,
  speakers,
  onOpenConversation,
  onCorrect,
  bilibiliVideo = null,
  sourceUrl = '',
  videoSeekSeconds = 0,
  videoSeekRequestId = 0,
  onSeekToVideo,
  playerContainerRef,
  summaryItems = [],
  isSummaryStale = false,
}) => (
  <TranscriptConversationReader
    presentation="embedded"
    isOpen
    title={title}
    turns={turns}
    speakers={speakers}
    onClose={() => undefined}
    onOpenFull={onOpenConversation}
    onCorrect={onCorrect}
    bilibiliVideo={bilibiliVideo}
    sourceUrl={sourceUrl}
    videoSeekSeconds={videoSeekSeconds}
    videoSeekRequestId={videoSeekRequestId}
    onSeekToVideo={onSeekToVideo}
    playerContainerRef={playerContainerRef}
    summaryItems={summaryItems}
    isSummaryStale={isSummaryStale}
  />
);

export default TranscriptTurnList;
