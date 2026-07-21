import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { LiveTranscriptionPreview } from '../components/Transcribe/LiveTranscriptionPreview';
import { TranscribeBatchFileList } from '../components/Transcribe/TranscribeBatchFileList';
import { TranscribeBatchPanel } from '../components/Transcribe/TranscribeBatchPanel';
import {
  TranscribeResultOverlays,
  type TranscribePreviewOverlay,
} from '../components/Transcribe/TranscribeResultOverlays';
import { TranscribeResultsPanel } from '../components/Transcribe/TranscribeResultsPanel';
import { TranscribeUploadPanel } from '../components/Transcribe/TranscribeUploadPanel';
import { useTranscribeFileSelection } from '../components/Transcribe/useTranscribeFileSelection';
import { useTranscribeProviderState } from '../components/Transcribe/useTranscribeProviderState';
import useStore from '../store';
import {
  downloadTextFile,
  getErrorMessage,
  sanitizeFileName,
  stripExtension,
} from './transcribeUtils';

// webkitdirectory 不是标准 React 属性，需通过 cast 透传
const FOLDER_INPUT_PROPS = {
  webkitdirectory: '',
  directory: '',
} as unknown as React.InputHTMLAttributes<HTMLInputElement>;

type ResultModalTarget = { type: 'single' } | { type: 'batch'; index: number };

export const Transcribe: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const transcriptionText = useStore((state) => state.transcriptionText);
  const transcriptionChunks = useStore((state) => state.transcriptionChunks);
  const transcriptionRecord = useStore((state) => state.transcriptionRecord);
  const isTranscribing = useStore((state) => state.isTranscribing);
  const transcribeProgress = useStore((state) => state.transcribeProgress);
  const transcribeMedia = useStore((state) => state.transcribeMedia);
  const transcriptDetail = useStore((state) => state.transcriptDetail);
  const fetchTranscriptDetail = useStore((state) => state.fetchTranscriptDetail);
  const correctTranscriptTurn = useStore((state) => state.correctTranscriptTurn);
  const updateScript = useStore((state) => state.updateScript);
  const setCurrentBroadcast = useStore((state) => state.setCurrentBroadcast);
  const batchTranscriptionItems = useStore((state) => state.batchTranscriptionItems);
  const isBatchTranscribing = useStore((state) => state.isBatchTranscribing);
  const batchTranscribeProgress = useStore((state) => state.batchTranscribeProgress);
  const batchTranscribeMedia = useStore((state) => state.batchTranscribeMedia);
  const clearBatchTranscription = useStore((state) => state.clearBatchTranscription);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewModalTarget, setPreviewModalTarget] = useState<ResultModalTarget | null>(null);
  const [conversationResultId, setConversationResultId] = useState<number | null>(null);
  const [isOpeningResult, setIsOpeningResult] = useState(false);

  const providerState = useTranscribeProviderState(setError);
  const resetCopyFeedback = useCallback(() => setCopied(false), []);
  const fileSelection = useTranscribeFileSelection({
    clearBatchTranscription,
    onError: setError,
    onResetFeedback: resetCopyFeedback,
  });

  const handleSubmit = useCallback(async () => {
    if (!fileSelection.file) {
      setError('请上传需要转录的音频或视频文件');
      return;
    }
    setError(null);
    try {
      await transcribeMedia(
        fileSelection.file,
        providerState.contentMode === 'podcast' ? 'auto' : providerState.controls.language,
        providerState.asrProvider,
        providerState.transcribeOptions,
      );
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  }, [fileSelection.file, providerState, transcribeMedia]);

  const handleBatchSubmit = useCallback(async () => {
    const selectedFiles = fileSelection.batchFiles.filter((_, index) => fileSelection.selectedIndexes.has(index));
    if (selectedFiles.length === 0) {
      setError('请至少勾选一个需要转录的文件');
      return;
    }
    setError(null);
    try {
      await batchTranscribeMedia(
        selectedFiles,
        providerState.contentMode === 'podcast' ? 'auto' : providerState.controls.language,
        providerState.asrProvider,
        providerState.transcribeOptions,
      );
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  }, [batchTranscribeMedia, fileSelection.batchFiles, fileSelection.selectedIndexes, providerState]);

  const handleCopy = useCallback(async () => {
    if (!transcriptionText) return;
    await navigator.clipboard.writeText(transcriptionText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [transcriptionText]);

  const handleImportItem = useCallback((text: string) => {
    if (!text.trim()) return;
    setCurrentBroadcast(null);
    updateScript(text.trim());
    navigate('/editor');
  }, [navigate, setCurrentBroadcast, updateScript]);

  const handleMergeAll = useCallback(() => {
    const completed = batchTranscriptionItems.filter((item) => item.status === 'completed' && item.text.trim());
    if (completed.length === 0) return;
    const merged = completed.map((item) => `【${item.relativePath}】\n${item.text.trim()}`).join('\n\n');
    setCurrentBroadcast(null);
    updateScript(merged);
    navigate('/editor');
  }, [batchTranscriptionItems, navigate, setCurrentBroadcast, updateScript]);

  const handleDownload = useCallback(() => {
    if (!transcriptionText.trim()) return;
    const baseName = fileSelection.file ? stripExtension(fileSelection.file.name) : '转录结果';
    downloadTextFile(`${sanitizeFileName(baseName)}.txt`, transcriptionText);
  }, [fileSelection.file, transcriptionText]);

  const modalItem = previewModalTarget?.type === 'batch'
    ? batchTranscriptionItems[previewModalTarget.index]
    : null;
  const modalTitle = previewModalTarget?.type === 'single'
    ? (fileSelection.file?.name || transcriptionRecord?.file_name || '转录结果')
    : (modalItem?.relativePath || '转录结果');
  const modalText = previewModalTarget?.type === 'single'
    ? (transcriptionRecord?.text || transcriptionText)
    : (modalItem?.transcriptionResult?.text || modalItem?.text || '');
  const isPreviewLive = previewModalTarget?.type === 'single' && isTranscribing;
  const modalIsPodcast = previewModalTarget?.type === 'single'
    ? (transcriptionRecord?.content_mode || providerState.contentMode) === 'podcast'
    : modalItem?.transcriptionResult?.content_mode === 'podcast';
  const currentConversation = transcriptDetail?.record.id === conversationResultId ? transcriptDetail : null;

  const handleOpenResult = useCallback(async (target: ResultModalTarget) => {
    const record = target.type === 'single'
      ? transcriptionRecord
      : batchTranscriptionItems[target.index]?.transcriptionResult;
    const isPodcastResult = record?.content_mode === 'podcast' && record.structure_status === 'ready';
    if (!isPodcastResult || !record?.id) {
      setPreviewModalTarget(target);
      return;
    }

    setIsOpeningResult(true);
    setError(null);
    try {
      await fetchTranscriptDetail(record.id);
      setConversationResultId(record.id);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '打开对话逐字稿失败');
    } finally {
      setIsOpeningResult(false);
    }
  }, [batchTranscriptionItems, fetchTranscriptDetail, transcriptionRecord]);

  const handleCopyModalResult = useCallback(() => {
    void navigator.clipboard.writeText(modalText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  }, [modalText]);

  const handleDownloadModalResult = useCallback(() => {
    if (!modalText.trim()) return;
    const baseName = previewModalTarget?.type === 'single'
      ? (fileSelection.file
          ? stripExtension(fileSelection.file.name)
          : stripExtension(transcriptionRecord?.file_name || '转录结果'))
      : stripExtension(modalItem?.relativePath || '转录结果');
    downloadTextFile(`${sanitizeFileName(baseName)}.txt`, modalText);
  }, [fileSelection.file, modalItem?.relativePath, modalText, previewModalTarget?.type, transcriptionRecord?.file_name]);

  const handleImportModalResult = useCallback(() => {
    if (!modalText.trim()) return;
    setCurrentBroadcast(null);
    updateScript(modalText.trim());
    setPreviewModalTarget(null);
    navigate('/editor');
  }, [modalText, navigate, setCurrentBroadcast, updateScript]);

  const handleCorrectTurn = useCallback(async (turnId: number, correctedText: string) => {
    if (!currentConversation) return;
    await correctTranscriptTurn(currentConversation.record.id, turnId, correctedText);
  }, [correctTranscriptTurn, currentConversation]);

  const previewOverlay: TranscribePreviewOverlay | null = previewModalTarget ? {
    title: modalTitle,
    text: modalText,
    chunks: previewModalTarget.type === 'single' ? transcriptionChunks : [],
    isLive: isPreviewLive,
    isCopied: copied,
    canImport: !isPreviewLive && !modalIsPodcast,
  } : null;
  const showBatchItems = isBatchTranscribing || batchTranscriptionItems.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header
        title="音视频转录"
        subtitle="添加一个或多个文件，系统会自动选择处理方式"
        actions={(
          <button
            type="button"
            onClick={() => navigate('/history?tab=transcriptions')}
            className="rounded-xl border border-card-border bg-white/70 px-3.5 py-2 font-body text-[11px] text-ink-soft transition-colors hover:bg-white/90 hover:text-ink"
          >
            打开转录文稿库
          </button>
        )}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".wav,.mp3,.mpeg,.m4a,.mp4,.mov,.webm,audio/*,video/*"
            onChange={fileSelection.handleFileSelect}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...FOLDER_INPUT_PROPS}
            onChange={fileSelection.handleFolderSelect}
            className="hidden"
          />
          <div className="rounded-2xl border border-lilac/40 bg-lilac/15 px-4 py-3 font-body text-[12px] leading-relaxed text-ink-soft">
            一个文件直接转录；多个文件或文件夹自动进入批量队列。历史文稿和统计统一在内容库管理。
          </div>

          {fileSelection.mode === 'single' ? (
            <>
              <TranscribeUploadPanel
                file={fileSelection.file}
                error={error}
                isTranscribing={isTranscribing}
                progress={transcribeProgress}
                options={{
                  ...providerState.controls,
                  isDisabled: isTranscribing,
                  isSubmitDisabled: isTranscribing
                    || providerState.isMossModelMissing
                    || providerState.isPodcastUnavailable,
                  onSubmit: () => void handleSubmit(),
                }}
                onChooseFiles={() => fileInputRef.current?.click()}
                onChooseFolder={() => folderInputRef.current?.click()}
                onDropFiles={fileSelection.handleSelectedFiles}
              />
              <LiveTranscriptionPreview
                text={transcriptionText}
                chunks={transcriptionChunks}
                progress={transcribeProgress}
                isTranscribing={isTranscribing}
                isPodcast={(transcriptionRecord?.content_mode || providerState.contentMode) === 'podcast'}
                isCopied={copied}
                isOpening={isOpeningResult}
                onOpen={() => void handleOpenResult({ type: 'single' })}
                onCopy={() => void handleCopy()}
                onDownload={handleDownload}
              />
            </>
          ) : (
            <>
              <TranscribeBatchPanel
                fileCount={fileSelection.batchFiles.length}
                error={error}
                isTranscribing={isBatchTranscribing}
                progress={batchTranscribeProgress}
                options={{
                  ...providerState.controls,
                  isDisabled: isBatchTranscribing,
                  isBatch: true,
                  isSubmitDisabled: isBatchTranscribing
                    || fileSelection.selectedIndexes.size === 0
                    || providerState.isMossModelMissing
                    || providerState.isPodcastUnavailable,
                  selectedCount: fileSelection.selectedIndexes.size,
                  fileCount: fileSelection.batchFiles.length,
                  onSubmit: () => void handleBatchSubmit(),
                }}
                onChooseFiles={() => fileInputRef.current?.click()}
                onChooseFolder={() => folderInputRef.current?.click()}
                onDropFiles={fileSelection.handleSelectedFiles}
              />
              {showBatchItems ? (
                <TranscribeResultsPanel
                  items={batchTranscriptionItems}
                  isTranscribing={isBatchTranscribing}
                  onMergeAll={handleMergeAll}
                  onOpenItem={(index) => void handleOpenResult({ type: 'batch', index })}
                  onImportItem={handleImportItem}
                />
              ) : (
                <TranscribeBatchFileList
                  files={fileSelection.batchFiles}
                  selectedIndexes={fileSelection.selectedIndexes}
                  isDisabled={isBatchTranscribing}
                  onToggleAll={fileSelection.toggleSelectAll}
                  onToggle={fileSelection.toggleSelect}
                  onClear={fileSelection.clearBatchFiles}
                  onRemove={fileSelection.removeBatchFile}
                />
              )}
            </>
          )}
        </div>
      </main>

      <TranscribeResultOverlays
        preview={previewOverlay}
        conversation={currentConversation}
        onClosePreview={() => setPreviewModalTarget(null)}
        onCopyPreview={handleCopyModalResult}
        onDownloadPreview={handleDownloadModalResult}
        onImportPreview={handleImportModalResult}
        onCloseConversation={() => setConversationResultId(null)}
        onCorrectTurn={handleCorrectTurn}
      />
    </div>
  );
};

export default Transcribe;
