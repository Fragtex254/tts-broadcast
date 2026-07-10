import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { Header } from '../components/Layout/Header';
import { TranscriptionResultModal } from '../components/Transcribe/TranscriptionResultModal';
import { TranscribeProviderControls } from '../components/Transcribe/TranscribeProviderControls';
import useStore, {
  type AsrModelOption,
  type AsrEngine,
  type AsrProvider,
  type AsrLanguage,
  type BatchTranscriptionItem,
} from '../store';
import {
  ACTION_BUTTON_FORMAT,
  ACTION_BUTTON_IMPORT,
  ACTION_BUTTON_NEUTRAL,
  BATCH_STATUS_DOTS,
  BATCH_STATUS_LABELS,
  PHASE_LABELS,
  downloadTextFile,
  formatBytes,
  formatTimestamp,
  getErrorMessage,
  getRelativePath,
  isSupportedMedia,
  relativePathToTxtName,
  relativePathToZipEntry,
  sanitizeFileName,
  stripExtension,
} from './transcribeUtils';

// webkitdirectory 不是标准 React 属性，需通过 cast 透传
const FOLDER_INPUT_PROPS = {
  webkitdirectory: '',
  directory: '',
} as unknown as React.InputHTMLAttributes<HTMLInputElement>;

type TranscribeMode = 'single' | 'batch';
type ResultModalTarget = { type: 'single' } | { type: 'batch'; index: number };

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const Transcribe: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const transcriptionText = useStore((s) => s.transcriptionText);
  const transcriptionRecord = useStore((s) => s.transcriptionRecord);
  const isTranscribing = useStore((s) => s.isTranscribing);
  const transcribeProgress = useStore((s) => s.transcribeProgress);
  const transcribeMedia = useStore((s) => s.transcribeMedia);
  const formatTranscriptionResult = useStore((s) => s.formatTranscriptionResult);
  const setTranscriptionText = useStore((s) => s.setTranscriptionText);
  const updateScript = useStore((s) => s.updateScript);
  const setCurrentBroadcast = useStore((s) => s.setCurrentBroadcast);

  const batchTranscriptionItems = useStore((s) => s.batchTranscriptionItems);
  const isBatchTranscribing = useStore((s) => s.isBatchTranscribing);
  const batchTranscribeProgress = useStore((s) => s.batchTranscribeProgress);
  const batchTranscribeMedia = useStore((s) => s.batchTranscribeMedia);
  const clearBatchTranscription = useStore((s) => s.clearBatchTranscription);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const fetchAsrModels = useStore((s) => s.fetchAsrModels);
  const wslDefaultRef = useRef({ engine: settings.wsl_asr_engine, model: settings.wsl_asr_model });

  const [mode, setMode] = useState<TranscribeMode>('single');
  const [file, setFile] = useState<File | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [language, setLanguage] = useState<AsrLanguage>('auto');
  const [selectedAsrProvider, setSelectedAsrProvider] = useState<AsrProvider | null>(null);
  const [selectedWslEngine, setSelectedWslEngine] = useState<AsrEngine | null>(null);
  const [selectedWslModel, setSelectedWslModel] = useState<string | null>(null);
  const [selectedMossModel, setSelectedMossModel] = useState<string | null>(null);
  const [asrContext, setAsrContext] = useState('');
  const [mossModelOptions, setMossModelOptions] = useState<AsrModelOption[]>([]);
  const [isFetchingMossModels, setIsFetchingMossModels] = useState(false);
  const [mossModelFetchResult, setMossModelFetchResult] = useState<{ error?: string; resolvedUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [batchCopiedIndex, setBatchCopiedIndex] = useState<number | null>(null);
  const [resultModalTarget, setResultModalTarget] = useState<ResultModalTarget | null>(null);

  const asrProvider = selectedAsrProvider ?? settings.asr_provider ?? 'wsl_asr';
  const wslEngine = selectedWslEngine ?? settings.wsl_asr_engine ?? 'qwen';
  const wslModel = (
    selectedWslModel ?? (settings.wsl_asr_engine === 'qwen' ? settings.wsl_asr_model : '')
  ) || 'qwen3-asr-1.7b';
  const mossModel = (
    selectedMossModel ?? (settings.wsl_asr_engine === 'moss' ? settings.wsl_asr_model : '')
  ) || mossModelOptions[0]?.id || '';
  const asrModel = wslEngine === 'moss' ? mossModel : wslModel;
  const transcribeOptions = asrProvider === 'wsl_asr'
    ? { asrEngine: wslEngine, asrModel, context: asrContext }
    : undefined;
  const isMossModelMissing = asrProvider === 'wsl_asr' && wslEngine === 'moss' && !mossModel.trim();

  useEffect(() => {
    wslDefaultRef.current = { engine: settings.wsl_asr_engine, model: settings.wsl_asr_model };
  }, [settings.wsl_asr_engine, settings.wsl_asr_model]);

  const loadMossModels = useCallback(async () => {
    setIsFetchingMossModels(true);
    setMossModelFetchResult(null);
    try {
      const result = await fetchAsrModels({
        provider: 'wsl_asr',
        engine: 'moss',
        baseUrl: settings.wsl_asr_base_url,
        apiKey: settings.wsl_asr_api_key,
      });
      setMossModelOptions(result.models);
      setMossModelFetchResult({ resolvedUrl: result.resolvedUrl });
      const configuredModel = wslDefaultRef.current.engine === 'moss'
        && result.models.some((option) => option.id === wslDefaultRef.current.model)
        ? wslDefaultRef.current.model
        : '';
      const nextModel = configuredModel || result.models[0]?.id || '';
      setSelectedMossModel(nextModel || null);
    } catch (err) {
      setMossModelOptions([]);
      setMossModelFetchResult({ error: err instanceof Error ? err.message : '获取 MOSS 模型列表失败' });
    } finally {
      setIsFetchingMossModels(false);
    }
  }, [fetchAsrModels, settings.wsl_asr_api_key, settings.wsl_asr_base_url]);

  useEffect(() => {
    if (asrProvider === 'wsl_asr' && wslEngine === 'moss') {
      const timer = window.setTimeout(() => {
        void loadMossModels();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [asrProvider, loadMossModels, wslEngine]);

  const handleSelectedFiles = useCallback((files: File[]) => {
    const supported = files.filter(isSupportedMedia);
    setError(null);
    setCopied(false);
    setBatchCopiedIndex(null);
    clearBatchTranscription();
    if (supported.length === 0) {
      setError('请选择支持的音频或视频文件');
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
  }, [clearBatchTranscription]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectedFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    handleSelectedFiles(Array.from(list));
    e.target.value = '';
  };

  const handleProviderChange = useCallback((provider: AsrProvider) => {
    setSelectedAsrProvider(provider);
    setError(null);
    void updateSettings({ asr_provider: provider }).catch(() => {
      setError('已切换本次服务，但保存默认转录服务失败');
    });
  }, [updateSettings]);

  const handleWslEngineChange = useCallback((engine: AsrEngine) => {
    setSelectedWslEngine(engine);
    setError(null);
    if (engine === 'qwen') {
      const model = selectedWslModel || 'qwen3-asr-1.7b';
      setSelectedWslModel(model);
      void updateSettings({ wsl_asr_engine: engine, wsl_asr_model: model }).catch(() => {
        setError('已切换本次引擎，但保存默认 WSL 引擎失败');
      });
      return;
    }
    setSelectedMossModel(null);
    void updateSettings({ wsl_asr_engine: engine, wsl_asr_model: '' }).catch(() => {
      setError('已切换本次引擎，但保存默认 WSL 引擎失败');
    });
  }, [selectedWslModel, updateSettings]);

  const handleAsrModelChange = useCallback((model: string) => {
    if (wslEngine === 'moss') setSelectedMossModel(model);
    else setSelectedWslModel(model);
    void updateSettings({ wsl_asr_model: model }).catch(() => {
      setError('已切换本次模型，但保存默认 WSL 模型失败');
    });
  }, [updateSettings, wslEngine]);

  const removeBatchFile = (index: number) => {
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
    // 移除后重新映射选中索引：小于 index 的保留，大于 index 的减一
    setSelectedIndexes((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const toggleSelect = (index: number) => {
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIndexes((prev) => {
      if (prev.size === batchFiles.length) return new Set();
      return new Set(batchFiles.map((_, i) => i));
    });
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('请上传需要转录的音频或视频文件');
      return;
    }
    setError(null);
    try {
      await transcribeMedia(file, language, asrProvider, transcribeOptions);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleBatchSubmit = async () => {
    const selectedFiles = batchFiles.filter((_, i) => selectedIndexes.has(i));
    if (selectedFiles.length === 0) {
      setError('请至少勾选一个需要转录的文件');
      return;
    }
    setError(null);
    try {
      await batchTranscribeMedia(selectedFiles, language, asrProvider, transcribeOptions);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleCopy = async () => {
    if (!transcriptionText) return;
    await navigator.clipboard.writeText(transcriptionText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleCopyItem = async (index: number, text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setBatchCopiedIndex(index);
    setTimeout(() => setBatchCopiedIndex(null), 1200);
  };

  const handleImport = () => {
    if (!transcriptionText.trim()) return;
    setCurrentBroadcast(null);
    updateScript(transcriptionText.trim());
    navigate('/editor');
  };

  const handleImportItem = (text: string) => {
    if (!text.trim()) return;
    setCurrentBroadcast(null);
    updateScript(text.trim());
    navigate('/editor');
  };

  const handleMergeAll = () => {
    const completed = batchTranscriptionItems.filter((i) => i.status === 'completed' && i.text.trim());
    if (completed.length === 0) return;
    const merged = completed.map((i) => `【${i.relativePath}】\n${i.text.trim()}`).join('\n\n');
    setCurrentBroadcast(null);
    updateScript(merged);
    navigate('/editor');
  };

  const handleDownload = () => {
    if (!transcriptionText.trim()) return;
    const baseName = file ? stripExtension(file.name) : '转录结果';
    downloadTextFile(`${sanitizeFileName(baseName)}.txt`, transcriptionText);
  };

  const handleDownloadItem = (item: BatchTranscriptionItem) => {
    if (!item.text.trim()) return;
    downloadTextFile(relativePathToTxtName(item.relativePath), item.text);
  };

  const [isZipping, setIsZipping] = useState(false);

  const handleDownloadAll = async () => {
    const completed = batchTranscriptionItems.filter((i) => i.status === 'completed' && i.text.trim());
    if (completed.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      completed.forEach((item) => {
        let entry = relativePathToZipEntry(item.relativePath);
        // 同名冲突时追加序号，避免覆盖
        if (usedNames.has(entry)) {
          const count = usedNames.get(entry)! + 1;
          usedNames.set(entry, count);
          const slashIndex = entry.lastIndexOf('/');
          const dir = slashIndex >= 0 ? entry.slice(0, slashIndex + 1) : '';
          const base = slashIndex >= 0 ? entry.slice(slashIndex + 1) : entry;
          const dotIndex = base.lastIndexOf('.');
          entry = `${dir}${dotIndex >= 0 ? base.slice(0, dotIndex) : base}_${count}${dotIndex >= 0 ? base.slice(dotIndex) : ''}`;
        } else {
          usedNames.set(entry, 1);
        }
        zip.file(entry, item.text.trim());
      });
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      downloadBlob(`批量转录_${formatTimestamp(new Date())}.zip`, blob);
    } finally {
      setIsZipping(false);
    }
  };

  const showBatchItems = isBatchTranscribing || batchTranscriptionItems.length > 0;
  const completedCount = batchTranscriptionItems.filter((i) => i.status === 'completed' && i.text.trim()).length;
  const modalItem = resultModalTarget?.type === 'batch'
    ? batchTranscriptionItems[resultModalTarget.index]
    : null;
  const modalTitle = resultModalTarget?.type === 'single'
    ? (file?.name || transcriptionRecord?.file_name || '转录结果')
    : (modalItem?.relativePath || '转录结果');
  const modalText = resultModalTarget?.type === 'single'
    ? (transcriptionRecord?.text || transcriptionText)
    : (modalItem?.transcriptionResult?.text || modalItem?.text || '');
  const modalFormattedText = resultModalTarget?.type === 'single'
    ? (transcriptionRecord?.formatted_text || '')
    : (modalItem?.transcriptionResult?.formatted_text || modalItem?.formattedText || '');
  const modalResultId = resultModalTarget?.type === 'single'
    ? transcriptionRecord?.id
    : (modalItem?.resultId || modalItem?.transcriptionResult?.id);

  const handleFormatModalResult = async (text: string) => {
    if (!modalResultId) {
      throw new Error('转录结果尚未保存，无法排版');
    }
    const record = await formatTranscriptionResult(modalResultId, text);
    return record.formatted_text;
  };

  const handleDownloadModalResult = (text: string) => {
    if (!text.trim()) return;
    const baseName = resultModalTarget?.type === 'single'
      ? (file ? stripExtension(file.name) : stripExtension(transcriptionRecord?.file_name || '转录结果'))
      : stripExtension(modalItem?.relativePath || '转录结果');
    downloadTextFile(`${sanitizeFileName(baseName)}_排版.txt`, text);
  };

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
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...FOLDER_INPUT_PROPS}
            onChange={handleFolderSelect}
            className="hidden"
          />
          <div className="rounded-2xl border border-lilac/40 bg-lilac/15 px-4 py-3 font-body text-[12px] leading-relaxed text-ink-soft">
            一个文件直接转录；多个文件或文件夹自动进入批量队列。历史文稿和统计统一在内容库管理。
          </div>

          {mode === 'single' ? (
            <>
              <section
                className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
                style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-lilac" />
                  <h3 className="font-display italic text-[14px] font-medium text-ink-soft">上传媒体</h3>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleSelectedFiles(Array.from(e.dataTransfer.files));
                  }}
                  className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
                >
                  <p className="font-display italic text-[18px] text-ink-soft mb-1">
                    {file ? file.name : '选择或拖拽音频 / 视频'}
                  </p>
                  <p className="font-body text-[12px] text-ink-soft/70">
                    可一次选择多个文件；也可以选择整个文件夹
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <span className="rounded-xl bg-lilac px-3.5 py-2 font-body text-[11px] font-medium text-ink shadow-btn">选择文件</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        folderInputRef.current?.click();
                      }}
                      className="rounded-xl border border-card-border bg-white/75 px-3.5 py-2 font-body text-[11px] font-medium text-ink-soft transition-colors hover:text-ink"
                    >
                      选择文件夹
                    </button>
                  </div>
                </div>

                <TranscribeProviderControls
                  language={language}
                  provider={asrProvider}
                  wslEngine={wslEngine}
                  asrModel={asrModel}
                  asrContext={asrContext}
                  mossModelOptions={mossModelOptions}
                  isFetchingMossModels={isFetchingMossModels}
                  mossModelFetchResult={mossModelFetchResult}
                  isDisabled={isTranscribing}
                  qwenBaseUrl={settings.qwen_asr_base_url}
                  wslBaseUrl={settings.wsl_asr_base_url}
                  onLanguageChange={setLanguage}
                  onProviderChange={handleProviderChange}
                  onWslEngineChange={handleWslEngineChange}
                  onAsrModelChange={handleAsrModelChange}
                  onAsrContextChange={setAsrContext}
                  onRefreshMossModels={loadMossModels}
                >
                  <button
                    onClick={handleSubmit}
                    disabled={isTranscribing || isMossModelMissing}
                    className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
                  >
                    {isTranscribing && (
                      <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />
                    )}
                    <span className="relative">{isTranscribing ? '转录中...' : '开始转录'}</span>
                  </button>
                </TranscribeProviderControls>

                {error && (
                  <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
                    {error}
                  </div>
                )}

                {(isTranscribing || transcribeProgress.phase !== 'idle') && (
                  <div className="mt-4 bg-white/60 rounded-2xl p-4 border border-card-border">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">
                          {PHASE_LABELS[transcribeProgress.phase] ?? ''}
                        </p>
                        <p className="font-body text-[12px] text-ink truncate">
                          {transcribeProgress.message}
                        </p>
                      </div>
                      <span className="font-display italic text-[22px] text-ink">
                        {Math.round(transcribeProgress.percent)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/70 border border-card-border">
                      <div
                        className="h-full rounded-full bg-lilac transition-all duration-300"
                        style={{ width: `${Math.min(Math.max(transcribeProgress.percent, 0), 100)}%` }}
                      />
                    </div>
                    {transcribeProgress.total > 0 && (
                      <p className="mt-2 font-body text-[11px] text-ink-soft/70">
                        已完成 {transcribeProgress.current} / {transcribeProgress.total} 个音频片段
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section
                className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
                style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sage" />
                    <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录结果</h3>
                  </div>
                  {transcriptionText && (
                    <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70">
                      {transcriptionText.length} 字
                    </span>
                  )}
                </div>

                <textarea
                  value={transcriptionText}
                  onChange={(e) => setTranscriptionText(e.target.value)}
                  className="w-full h-72 bg-white/60 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors"
                  placeholder="转录过程中，文本会实时出现在这里..."
                />

                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={handleCopy}
                    disabled={!transcriptionText}
                    className={ACTION_BUTTON_NEUTRAL}
                  >
                    {copied ? '已复制' : '复制'}
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={!transcriptionText.trim()}
                    className={ACTION_BUTTON_NEUTRAL}
                  >
                    下载 TXT
                  </button>
                  <button
                    onClick={() => setResultModalTarget({ type: 'single' })}
                    disabled={!transcriptionText.trim() || !transcriptionRecord?.id}
                    className={ACTION_BUTTON_FORMAT}
                  >
                    查看 / 排版
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!transcriptionText.trim()}
                    className={ACTION_BUTTON_IMPORT}
                  >
                    导入稿件
                  </button>
                </div>
              </section>
            </>
          ) : (
            <>
              <section
                className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
                style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-lilac" />
                  <h3 className="font-display italic text-[14px] font-medium text-ink-soft">批量队列</h3>
                </div>

                <div
                  onClick={() => !isBatchTranscribing && fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!isBatchTranscribing) handleSelectedFiles(Array.from(e.dataTransfer.files));
                  }}
                  className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
                >
                  <p className="font-display italic text-[18px] text-ink-soft mb-1">
                    {batchFiles.length > 0
                      ? `已添加 ${batchFiles.length} 个音视频文件`
                      : '选择多个文件或一个文件夹'}
                  </p>
                  <p className="font-body text-[12px] text-ink-soft/70">
                    文件数量决定处理方式，不需要手动切换模式
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <span className="rounded-xl bg-lilac px-3.5 py-2 font-body text-[11px] font-medium text-ink shadow-btn">重新选择文件</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isBatchTranscribing) folderInputRef.current?.click();
                      }}
                      className="rounded-xl border border-card-border bg-white/75 px-3.5 py-2 font-body text-[11px] font-medium text-ink-soft transition-colors hover:text-ink"
                    >
                      选择文件夹
                    </button>
                  </div>
                </div>

                <TranscribeProviderControls
                  language={language}
                  provider={asrProvider}
                  wslEngine={wslEngine}
                  asrModel={asrModel}
                  asrContext={asrContext}
                  mossModelOptions={mossModelOptions}
                  isFetchingMossModels={isFetchingMossModels}
                  mossModelFetchResult={mossModelFetchResult}
                  isDisabled={isBatchTranscribing}
                  isBatch
                  qwenBaseUrl={settings.qwen_asr_base_url}
                  wslBaseUrl={settings.wsl_asr_base_url}
                  onLanguageChange={setLanguage}
                  onProviderChange={handleProviderChange}
                  onWslEngineChange={handleWslEngineChange}
                  onAsrModelChange={handleAsrModelChange}
                  onAsrContextChange={setAsrContext}
                  onRefreshMossModels={loadMossModels}
                >
                  <button
                    onClick={handleBatchSubmit}
                    disabled={isBatchTranscribing || selectedIndexes.size === 0 || isMossModelMissing}
                    className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
                  >
                    {isBatchTranscribing && (
                      <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />
                    )}
                    <span className="relative">
                      {isBatchTranscribing
                        ? '转录中...'
                        : `开始批量转录（已选 ${selectedIndexes.size}/${batchFiles.length}）`}
                    </span>
                  </button>
                </TranscribeProviderControls>

                {error && (
                  <div className="mt-3 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
                    {error}
                  </div>
                )}

                {(isBatchTranscribing || batchTranscribeProgress.phase !== 'idle') && (
                  <div className="mt-4 bg-white/60 rounded-2xl p-4 border border-card-border">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-body text-[11px] uppercase tracking-wider text-ink-soft/60">
                          {batchTranscribeProgress.message}
                        </p>
                        <p className="font-body text-[12px] text-ink truncate">
                          {batchTranscribeProgress.currentFileName || '批量转录'}
                        </p>
                      </div>
                      <span className="font-display italic text-[22px] text-ink">
                        {Math.round(batchTranscribeProgress.percent)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/70 border border-card-border">
                      <div
                        className="h-full rounded-full bg-lilac transition-all duration-300"
                        style={{ width: `${Math.min(Math.max(batchTranscribeProgress.percent, 0), 100)}%` }}
                      />
                    </div>
                    {batchTranscribeProgress.total > 0 && (
                      <p className="mt-2 font-body text-[11px] text-ink-soft/70">
                        文件 {batchTranscribeProgress.currentIndex + (isBatchTranscribing ? 1 : 0)} / {batchTranscribeProgress.total}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* 文件 / 结果列表 */}
              {showBatchItems ? (
                <section
                  className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
                  style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sage" />
                      <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录结果</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownloadAll}
                        disabled={completedCount === 0 || isBatchTranscribing || isZipping}
                        className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink bg-white/60 hover:bg-white/80 disabled:opacity-40 rounded-xl border border-card-border transition-all duration-150"
                      >
                        {isZipping ? '打包中...' : `下载压缩包（${completedCount}）`}
                      </button>
                      <button
                        onClick={handleMergeAll}
                        disabled={completedCount === 0 || isBatchTranscribing}
                        className="px-3 py-1.5 font-body text-[11px] bg-sage hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn transition-all duration-150"
                      >
                        合并全部导入（{completedCount}）
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {batchTranscriptionItems.map((item, index) => (
                      <div key={`${item.relativePath}-${index}`} className="bg-white/60 rounded-2xl p-4 border border-card-border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`w-2 h-2 rounded-full ${BATCH_STATUS_DOTS[item.status]}`} />
                          <p className="font-body text-[12px] text-ink truncate flex-1" title={item.relativePath}>
                            {item.relativePath}
                          </p>
                          <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70 shrink-0">
                            {BATCH_STATUS_LABELS[item.status]}
                          </span>
                        </div>

                        {item.status === 'failed' && (
                          <p className="font-body text-[11px] text-pink">{item.error || '转录失败'}</p>
                        )}

                        {(item.status === 'completed' || item.status === 'transcribing') && (
                          <textarea
                            value={item.text}
                            readOnly
                            placeholder={item.status === 'transcribing' ? '转录中，文本会实时出现...' : ''}
                            className="w-full h-32 bg-white/70 text-ink rounded-xl p-3 border border-card-border resize-none font-body text-[12px] leading-[1.8] transition-colors"
                          />
                        )}

                        {item.status === 'completed' && item.text && (
                          <div className="flex items-center justify-between mt-2">
                            <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70">
                              {item.text.length} 字
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleCopyItem(index, item.text)}
                                className={ACTION_BUTTON_NEUTRAL}
                              >
                                {batchCopiedIndex === index ? '已复制' : '复制'}
                              </button>
                              <button
                                onClick={() => handleDownloadItem(item)}
                                className={ACTION_BUTTON_NEUTRAL}
                              >
                                下载
                              </button>
                              <button
                                onClick={() => setResultModalTarget({ type: 'batch', index })}
                                disabled={!item.resultId && !item.transcriptionResult?.id}
                                className={ACTION_BUTTON_FORMAT}
                              >
                                查看 / 排版
                              </button>
                              <button
                                onClick={() => handleImportItem(item.text)}
                                className={ACTION_BUTTON_IMPORT}
                              >
                                导入稿件
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ) : (
                batchFiles.length > 0 && (
                  <section
                    className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
                    style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={toggleSelectAll}
                          disabled={isBatchTranscribing}
                          className="flex items-center gap-2 disabled:opacity-40"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                              selectedIndexes.size === batchFiles.length && batchFiles.length > 0
                                ? 'bg-lemon border-lemon'
                                : 'bg-white/70 border-card-border'
                            }`}
                          >
                            {selectedIndexes.size === batchFiles.length && batchFiles.length > 0 && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className="font-display italic text-[14px] font-medium text-ink-soft">
                            待转录文件（{selectedIndexes.size}/{batchFiles.length}）
                          </span>
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setBatchFiles([]);
                          setSelectedIndexes(new Set());
                        }}
                        disabled={isBatchTranscribing}
                        className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
                      >
                        清空
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {batchFiles.map((f, index) => {
                        const isSelected = selectedIndexes.has(index);
                        return (
                          <div
                            key={`${getRelativePath(f)}-${index}`}
                            onClick={() => !isBatchTranscribing && toggleSelect(index)}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-colors ${
                              isSelected ? 'bg-lemon/20 border border-lemon/40' : 'bg-white/50 border border-transparent hover:bg-white/70'
                            } ${isBatchTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected ? 'bg-lemon border-lemon' : 'bg-white/70 border-card-border'
                              }`}
                            >
                              {isSelected && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <p className={`font-body text-[11px] truncate flex-1 ${isSelected ? 'text-ink' : 'text-ink-soft/60'}`} title={getRelativePath(f)}>
                              {getRelativePath(f)}
                            </p>
                            <span className="font-body text-[10px] text-ink-soft/70 shrink-0">
                              {formatBytes(f.size)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isBatchTranscribing) removeBatchFile(index);
                              }}
                              className="font-body text-[11px] text-ink-soft/70 hover:text-pink transition-colors shrink-0"
                            >
                              移除
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )
              )}
            </>
          )}

        </div>
      </main>
      {resultModalTarget && (
        <TranscriptionResultModal
          key={`${resultModalTarget.type}-${modalResultId ?? 'unsaved'}-${resultModalTarget.type === 'batch' ? resultModalTarget.index : 0}`}
          isOpen
          title={modalTitle}
          text={modalText}
          formattedText={modalFormattedText}
          canFormat={Boolean(modalResultId)}
          onClose={() => setResultModalTarget(null)}
          onCopy={(text) => navigator.clipboard.writeText(text)}
          onDownload={handleDownloadModalResult}
          onImport={(text) => {
            if (!text.trim()) return;
            setCurrentBroadcast(null);
            updateScript(text.trim());
            setResultModalTarget(null);
            navigate('/editor');
          }}
          onFormat={handleFormatModalResult}
        />
      )}
    </div>
  );
};

export default Transcribe;
