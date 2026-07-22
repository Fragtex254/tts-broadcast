import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../ConfirmDialog';
import { TranscriptionHistoryPanel } from '../Transcribe/TranscriptionHistoryPanel';
import { TranscriptionResultModal } from '../Transcribe/TranscriptionResultModal';
import { TranscriptionStatsCenter } from '../Transcribe/TranscriptionStatsCenter';
import useStore, { type TranscriptionRecord } from '../../store';
import {
  downloadTextFile,
  preferredTranscriptionText,
  relativePathToTxtName,
  sanitizeFileName,
  stripExtension,
} from '../../pages/transcribeUtils';

export const TranscriptionLibrary: React.FC = () => {
  const navigate = useNavigate();
  const records = useStore((state) => state.transcriptionHistory);
  const stats = useStore((state) => state.transcriptionStats);
  const isLoadingRecords = useStore((state) => state.isLoadingTranscriptionHistory);
  const isLoadingStats = useStore((state) => state.isLoadingTranscriptionStats);
  const isDeleting = useStore((state) => state.isDeletingTranscriptionResult);
  const fetchRecords = useStore((state) => state.fetchTranscriptionHistory);
  const fetchStats = useStore((state) => state.fetchTranscriptionStats);
  const deleteRecord = useStore((state) => state.deleteTranscriptionHistoryResult);
  const formatRecord = useStore((state) => state.formatTranscriptionResult);
  const createEditorDraft = useStore((state) => state.createEditorDraft);
  const cancelEditorDraftCreation = useStore((state) => state.cancelEditorDraftCreation);

  const [error, setError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<TranscriptionRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TranscriptionRecord | null>(null);

  const loadLibrary = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([
        fetchRecords({ limit: 30 }),
        fetchStats(),
      ]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载转录文稿失败');
    }
  }, [fetchRecords, fetchStats]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLibrary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLibrary]);

  useEffect(() => cancelEditorDraftCreation, [cancelEditorDraftCreation]);

  const openEditorDraft = useCallback(async (text: string) => {
    if (!text.trim() || useStore.getState().isCreatingEditorDraft) return;
    setError(null);
    try {
      const draft = await createEditorDraft({ text: text.trim() });
      navigate(`/editor/${draft.id}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入编辑器失败，请重试');
    }
  }, [createEditorDraft, navigate]);

  const handleImport = (record: TranscriptionRecord) => {
    const text = preferredTranscriptionText(record);
    if (!text) return;
    void openEditorDraft(text);
  };

  const handleOpen = (record: TranscriptionRecord) => {
    if (record.content_mode === 'podcast' && record.structure_status === 'ready') {
      navigate(`/history/transcriptions/${record.id}`);
      return;
    }
    setSelectedRecord(record);
  };

  const handleDownload = (record: TranscriptionRecord) => {
    const text = preferredTranscriptionText(record);
    if (!text) return;
    downloadTextFile(relativePathToTxtName(record.relative_path || record.file_name), text);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await deleteRecord(deleteTarget.id);
      await fetchStats();
      if (selectedRecord?.id === deleteTarget.id) setSelectedRecord(null);
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除转录文稿失败');
    }
  };

  const handleFormat = async (text: string) => {
    if (!selectedRecord) throw new Error('未选择转录文稿');
    const nextRecord = await formatRecord(selectedRecord.id, text);
    setSelectedRecord(nextRecord);
    return nextRecord.formatted_text;
  };

  return (
    <div className="space-y-4">
      <TranscriptionStatsCenter stats={stats} isLoading={isLoadingStats} onRefresh={loadLibrary} />
      <TranscriptionHistoryPanel
        records={records}
        isLoading={isLoadingRecords}
        error={error}
        onRefresh={loadLibrary}
        onOpen={handleOpen}
        onDownload={handleDownload}
        onImport={handleImport}
        onDelete={setDeleteTarget}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="删除转录文稿"
        message={`确定删除「${deleteTarget?.relative_path || deleteTarget?.file_name || '这条转录文稿'}」吗？`}
        warningMessage="删除后无法从内容库恢复。"
        confirmText="确认删除"
        cancelText="取消"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />

      {selectedRecord && (
        <TranscriptionResultModal
          key={`${selectedRecord.id}-${selectedRecord.updated_at}`}
          isOpen
          title={selectedRecord.relative_path || selectedRecord.file_name}
          text={selectedRecord.text}
          formattedText={selectedRecord.formatted_text}
          canFormat
          onClose={() => setSelectedRecord(null)}
          onCopy={(text) => navigator.clipboard.writeText(text)}
          onDownload={(text) => {
            const baseName = stripExtension(selectedRecord.relative_path || selectedRecord.file_name || '转录结果');
            downloadTextFile(`${sanitizeFileName(baseName)}_排版.txt`, text);
          }}
          onImport={(text) => {
            if (!text.trim()) return;
            void openEditorDraft(text);
          }}
          onFormat={handleFormat}
        />
      )}
    </div>
  );
};

export default TranscriptionLibrary;
