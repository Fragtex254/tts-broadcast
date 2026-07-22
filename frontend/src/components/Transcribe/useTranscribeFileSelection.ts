import { useCallback, useState } from 'react';
import { isSupportedMedia } from '../../pages/transcribeUtils';

type TranscribeMode = 'single' | 'batch';

interface UseTranscribeFileSelectionOptions {
  clearBatchTranscription: () => void;
  onError: (message: string | null) => void;
  onResetFeedback: () => void;
}

export const useTranscribeFileSelection = ({
  clearBatchTranscription,
  onError,
  onResetFeedback,
}: UseTranscribeFileSelectionOptions) => {
  const [mode, setMode] = useState<TranscribeMode>('single');
  const [file, setFile] = useState<File | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  const handleSelectedFiles = useCallback((files: File[]) => {
    const supported = files.filter(isSupportedMedia);
    onError(null);
    onResetFeedback();
    clearBatchTranscription();
    if (supported.length === 0) {
      onError('请选择支持的音频或视频文件');
      return;
    }
    if (supported.length === 1) {
      setMode('single');
      setFile(supported[0]);
      setBatchFiles([]);
      setSelectedIndexes(new Set());
      return;
    }
    setMode('batch');
    setFile(null);
    setBatchFiles(supported);
    setSelectedIndexes(new Set(supported.map((_, index) => index)));
  }, [clearBatchTranscription, onError, onResetFeedback]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedFiles(Array.from(event.target.files || []));
    event.target.value = '';
  }, [handleSelectedFiles]);

  const handleFolderSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleSelectedFiles(Array.from(event.target.files));
    event.target.value = '';
  }, [handleSelectedFiles]);

  const removeBatchFile = useCallback((index: number) => {
    const nextFiles = batchFiles.filter((_, fileIndex) => fileIndex !== index);
    if (nextFiles.length === 1) {
      handleSelectedFiles(nextFiles);
      return;
    }
    if (nextFiles.length === 0) {
      setBatchFiles([]);
      setSelectedIndexes(new Set());
      setMode('single');
      setFile(null);
      clearBatchTranscription();
      return;
    }
    setBatchFiles(nextFiles);
    setSelectedIndexes((previous) => {
      const next = new Set<number>();
      previous.forEach((selectedIndex) => {
        if (selectedIndex < index) next.add(selectedIndex);
        else if (selectedIndex > index) next.add(selectedIndex - 1);
      });
      return next;
    });
  }, [batchFiles, clearBatchTranscription, handleSelectedFiles]);

  const toggleSelect = useCallback((index: number) => {
    setSelectedIndexes((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIndexes((previous) => {
      if (previous.size === batchFiles.length) return new Set();
      return new Set(batchFiles.map((_, index) => index));
    });
  }, [batchFiles]);

  const clearBatchFiles = useCallback(() => {
    setBatchFiles([]);
    setSelectedIndexes(new Set());
  }, []);

  return {
    mode,
    file,
    batchFiles,
    selectedIndexes,
    handleSelectedFiles,
    handleFileSelect,
    handleFolderSelect,
    removeBatchFile,
    toggleSelect,
    toggleSelectAll,
    clearBatchFiles,
  };
};

export default useTranscribeFileSelection;
