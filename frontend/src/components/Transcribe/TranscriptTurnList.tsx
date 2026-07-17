import React from 'react';
import type { TranscriptSpeaker, TranscriptTurn } from '../../store';
import { TranscriptConversationReader } from './TranscriptConversationModal';

interface TranscriptTurnListProps {
  title: string;
  turns: TranscriptTurn[];
  speakers: TranscriptSpeaker[];
  onOpenConversation: () => void;
  onCorrect: (turnId: number, correctedText: string) => Promise<void>;
}

export const TranscriptTurnList: React.FC<TranscriptTurnListProps> = ({ title, turns, speakers, onOpenConversation, onCorrect }) => (
  <TranscriptConversationReader
    presentation="embedded"
    isOpen
    title={title}
    turns={turns}
    speakers={speakers}
    onClose={() => undefined}
    onOpenFull={onOpenConversation}
    onCorrect={onCorrect}
  />
);

export default TranscriptTurnList;
