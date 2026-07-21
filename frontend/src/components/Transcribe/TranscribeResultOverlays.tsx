import React from 'react';
import type { TranscriptDetail, TranscriptionChunkPreview } from '../../store';
import { TranscriptConversationModal } from './TranscriptConversationModal';
import { TranscriptionPreviewModal } from './TranscriptionPreviewModal';

export interface TranscribePreviewOverlay {
  title: string;
  text: string;
  chunks: TranscriptionChunkPreview[];
  isLive: boolean;
  isCopied: boolean;
  canImport: boolean;
}

interface TranscribeResultOverlaysProps {
  preview: TranscribePreviewOverlay | null;
  conversation: TranscriptDetail | null;
  onClosePreview: () => void;
  onCopyPreview: () => void;
  onDownloadPreview: () => void;
  onImportPreview: () => void;
  onCloseConversation: () => void;
  onCorrectTurn: (turnId: number, correctedText: string) => Promise<void>;
}

export const TranscribeResultOverlays: React.FC<TranscribeResultOverlaysProps> = ({
  preview,
  conversation,
  onClosePreview,
  onCopyPreview,
  onDownloadPreview,
  onImportPreview,
  onCloseConversation,
  onCorrectTurn,
}) => (
  <>
    {preview && (
      <TranscriptionPreviewModal
        isOpen
        title={preview.title}
        text={preview.text}
        chunks={preview.chunks}
        isLive={preview.isLive}
        isCopied={preview.isCopied}
        onClose={onClosePreview}
        onCopy={onCopyPreview}
        onDownload={onDownloadPreview}
        onImport={preview.canImport ? onImportPreview : undefined}
      />
    )}
    {conversation && (
      <TranscriptConversationModal
        isOpen
        title={conversation.record.relative_path || conversation.record.file_name}
        turns={conversation.turns}
        speakers={conversation.speakers}
        onClose={onCloseConversation}
        onCorrect={onCorrectTurn}
      />
    )}
  </>
);

export default TranscribeResultOverlays;
