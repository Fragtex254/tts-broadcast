import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Header } from '../components/Layout/Header';
import { TranscriptionHistoryPanel } from '../components/Transcribe/TranscriptionHistoryPanel';
import { TranscriptionResultModal } from '../components/Transcribe/TranscriptionResultModal';
import useStore, {
  type AsrProvider,
  type AsrLanguage,
  type BatchTranscriptionItem,
  type TranscriptionRecord,
  type TranscriptionStats,
} from '../store';

const LANGUAGE_OPTIONS: { value: AsrLanguage; label: string }[] = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
];

const ASR_PROVIDER_OPTIONS: { value: AsrProvider; label: string }[] = [
  { value: 'wsl_asr', label: 'WSL 局域网' },
  { value: 'mimo', label: 'MiMo 云端' },
  { value: 'qwen_mlx', label: 'Qwen 本地（Mac MLX）' },
];

const WSL_MODEL_OPTIONS = [
  { value: 'qwen3-asr-1.7b', label: 'Qwen3-ASR 1.7B' },
  { value: 'qwen3-asr-0.6b', label: 'Qwen3-ASR 0.6B' },
];

const PHASE_LABELS: Record<string, string> = {
  idle: '待开始',
  uploading: '上传中',
  preparing: '准备中',
  transcribing: '转录中',
  completed: '已完成',
  failed: '失败',
};

const SUPPORTED_BATCH_EXTS = ['.mp3', '.mp4', '.m4a', '.wav', '.mpeg', '.mov', '.webm'];

const BATCH_STATUS_LABELS: Record<BatchTranscriptionItem['status'], string> = {
  pending: '待转录',
  transcribing: '转录中',
  completed: '已完成',
  failed: '失败',
};

const BATCH_STATUS_DOTS: Record<BatchTranscriptionItem['status'], string> = {
  pending: 'bg-ink-soft/30',
  transcribing: 'bg-lilac',
  completed: 'bg-sage',
  failed: 'bg-pink',
};

const ACTION_BUTTON_NEUTRAL = 'px-3.5 py-2 font-body text-[12px] text-ink-soft hover:text-ink bg-white/70 hover:bg-white/90 disabled:opacity-40 rounded-xl border border-card-border transition-all duration-150';
const ACTION_BUTTON_FORMAT = 'px-3.5 py-2 font-body text-[12px] bg-lilac hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn transition-all duration-150';
const ACTION_BUTTON_IMPORT = 'px-3.5 py-2 font-body text-[12px] bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn transition-all duration-150';

// webkitdirectory 不是标准 React 属性，需通过 cast 透传
const FOLDER_INPUT_PROPS = {
  webkitdirectory: '',
  directory: '',
} as unknown as React.InputHTMLAttributes<HTMLInputElement>;

type TranscribeMode = 'single' | 'batch';
type ResultModalTarget = { type: 'single' } | { type: 'batch'; index: number } | { type: 'history'; id: number };

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  if (error instanceof Error) return error.message;
  return '转录失败，请稍后重试';
}

function isSupportedMedia(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_BATCH_EXTS.some((ext) => name.endsWith(ext));
}

function getRelativePath(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const restSeconds = totalSeconds % 60;
  if (minutes < 60) return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

function formatSeconds(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}

function TranscriptionStatsCenter({
  stats,
  isLoading,
  onRefresh,
}: {
  stats: TranscriptionStats;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const items = [
    { label: '文件总量', value: formatBytes(stats.total_file_size_bytes) },
    { label: '音频总时长', value: formatDuration(stats.total_audio_duration_seconds) },
    { label: '累计字数', value: `${formatInteger(stats.total_text_chars)} 字` },
    { label: 'GPU 累计耗时', value: `${formatSeconds(stats.total_processing_seconds)} 秒` },
  ];

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blush" />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">转录统计中心</h3>
          <span className="px-2 py-1 rounded-full bg-white/70 border border-card-border font-body text-[10px] text-ink-soft">
            {formatInteger(stats.total_count)} 条记录
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink bg-white/70 hover:bg-white/90 disabled:opacity-40 rounded-xl border border-card-border transition-all duration-150"
        >
          {isLoading ? '刷新中...' : '刷新'}
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {items.map((item) => (
          <div key={item.label} className="bg-white/65 rounded-2xl border border-card-border p-3 min-h-20">
            <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft/70 mb-2">
              {item.label}
            </p>
            <p className="font-display italic text-[20px] leading-tight text-ink break-words">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || '转录结果';
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

function relativePathToTxtName(relativePath: string): string {
  return `${sanitizeFileName(stripExtension(relativePath))}.txt`;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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

/**
 * 将相对路径转为 zip 内的 txt 路径，保留子目录结构。
 * 如「子目录/a.mp3」→「子目录/a.txt」
 */
function relativePathToZipEntry(relativePath: string): string {
  const noExt = relativePath.replace(/\.[^./\\]+$/, '');
  return `${noExt}.txt`;
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
  const transcriptionHistory = useStore((s) => s.transcriptionHistory);
  const transcriptionStats = useStore((s) => s.transcriptionStats);
  const isLoadingTranscriptionHistory = useStore((s) => s.isLoadingTranscriptionHistory);
  const isLoadingTranscriptionStats = useStore((s) => s.isLoadingTranscriptionStats);
  const isDeletingTranscriptionResult = useStore((s) => s.isDeletingTranscriptionResult);
  const fetchTranscriptionHistory = useStore((s) => s.fetchTranscriptionHistory);
  const fetchTranscriptionStats = useStore((s) => s.fetchTranscriptionStats);
  const deleteTranscriptionHistoryResult = useStore((s) => s.deleteTranscriptionHistoryResult);
  const formatTranscriptionResult = useStore((s) => s.formatTranscriptionResult);
  const setTranscriptionText = useStore((s) => s.setTranscriptionText);
  const updateScript = useStore((s) => s.updateScript);

  const batchTranscriptionItems = useStore((s) => s.batchTranscriptionItems);
  const isBatchTranscribing = useStore((s) => s.isBatchTranscribing);
  const batchTranscribeProgress = useStore((s) => s.batchTranscribeProgress);
  const batchTranscribeMedia = useStore((s) => s.batchTranscribeMedia);
  const clearBatchTranscription = useStore((s) => s.clearBatchTranscription);
  const settings = useStore((s) => s.settings);

  const [mode, setMode] = useState<TranscribeMode>('single');
  const [file, setFile] = useState<File | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [language, setLanguage] = useState<AsrLanguage>('auto');
  const [selectedAsrProvider, setSelectedAsrProvider] = useState<AsrProvider | null>(null);
  const [selectedWslModel, setSelectedWslModel] = useState<string | null>(null);
  const [wslContext, setWslContext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [batchCopiedIndex, setBatchCopiedIndex] = useState<number | null>(null);
  const [resultModalTarget, setResultModalTarget] = useState<ResultModalTarget | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TranscriptionRecord | null>(null);

  const asrProvider = selectedAsrProvider ?? settings.asr_provider ?? 'wsl_asr';
  const wslModel = selectedWslModel ?? settings.wsl_asr_model ?? 'qwen3-asr-1.7b';
  const transcribeOptions = asrProvider === 'wsl_asr'
    ? { wslModel: wslModel || settings.wsl_asr_model || 'qwen3-asr-1.7b', context: wslContext }
    : undefined;

  const loadTranscriptionHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      await fetchTranscriptionHistory({ limit: 30 });
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '获取转录历史失败');
    }
  }, [fetchTranscriptionHistory]);

  const loadTranscriptionStats = useCallback(async () => {
    setStatsError(null);
    try {
      await fetchTranscriptionStats();
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : '获取转录统计失败');
    }
  }, [fetchTranscriptionStats]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTranscriptionHistory();
      void loadTranscriptionStats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTranscriptionHistory, loadTranscriptionStats]);

  const handleFile = useCallback((nextFile: File | null) => {
    setError(null);
    setCopied(false);
    setFile(nextFile);
  }, []);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const supported = Array.from(list).filter(isSupportedMedia);
    setError(null);
    setBatchCopiedIndex(null);
    setBatchFiles(supported);
    // 默认全部勾选
    setSelectedIndexes(new Set(supported.map((_, i) => i)));
    clearBatchTranscription();
    e.target.value = '';
  };

  const removeBatchFile = (index: number) => {
    setBatchFiles((prev) => prev.filter((_, i) => i !== index));
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
    updateScript(transcriptionText.trim());
    navigate('/editor');
  };

  const handleImportItem = (text: string) => {
    if (!text.trim()) return;
    updateScript(text.trim());
    navigate('/editor');
  };

  const handleMergeAll = () => {
    const completed = batchTranscriptionItems.filter((i) => i.status === 'completed' && i.text.trim());
    if (completed.length === 0) return;
    const merged = completed.map((i) => `【${i.relativePath}】\n${i.text.trim()}`).join('\n\n');
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

  const handleDownloadHistoryRecord = (record: TranscriptionRecord) => {
    const text = record.formatted_text.trim() || record.text.trim();
    if (!text) return;
    downloadTextFile(relativePathToTxtName(record.relative_path || record.file_name), text);
  };

  const handleImportHistoryRecord = (record: TranscriptionRecord) => {
    const text = record.formatted_text.trim() || record.text.trim();
    if (!text) return;
    updateScript(text);
    navigate('/editor');
  };

  const handleConfirmDeleteHistoryRecord = async () => {
    if (!deleteTarget) return;
    setHistoryError(null);
    try {
      await deleteTranscriptionHistoryResult(deleteTarget.id);
      await loadTranscriptionStats();
      if (resultModalTarget?.type === 'history' && resultModalTarget.id === deleteTarget.id) {
        setResultModalTarget(null);
      }
      setDeleteTarget(null);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '删除转录结果失败');
    }
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

  const switchMode = (next: TranscribeMode) => {
    setMode(next);
    setError(null);
  };

  const showBatchItems = isBatchTranscribing || batchTranscriptionItems.length > 0;
  const completedCount = batchTranscriptionItems.filter((i) => i.status === 'completed' && i.text.trim()).length;
  const modalItem = resultModalTarget?.type === 'batch'
    ? batchTranscriptionItems[resultModalTarget.index]
    : null;
  const modalHistoryRecord = resultModalTarget?.type === 'history'
    ? transcriptionHistory.find((record) => record.id === resultModalTarget.id) ?? null
    : null;
  const modalTitle = resultModalTarget?.type === 'single'
    ? (file?.name || transcriptionRecord?.file_name || '转录结果')
    : resultModalTarget?.type === 'batch'
    ? (modalItem?.relativePath || '转录结果')
    : (modalHistoryRecord?.relative_path || modalHistoryRecord?.file_name || '转录结果');
  const modalText = resultModalTarget?.type === 'single'
    ? (transcriptionRecord?.text || transcriptionText)
    : resultModalTarget?.type === 'batch'
    ? (modalItem?.transcriptionResult?.text || modalItem?.text || '')
    : (modalHistoryRecord?.text || '');
  const modalFormattedText = resultModalTarget?.type === 'single'
    ? (transcriptionRecord?.formatted_text || '')
    : resultModalTarget?.type === 'batch'
    ? (modalItem?.transcriptionResult?.formatted_text || modalItem?.formattedText || '')
    : (modalHistoryRecord?.formatted_text || '');
  const modalResultId = resultModalTarget?.type === 'single'
    ? transcriptionRecord?.id
    : resultModalTarget?.type === 'batch'
    ? (modalItem?.resultId || modalItem?.transcriptionResult?.id)
    : modalHistoryRecord?.id;

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
      : resultModalTarget?.type === 'history'
      ? stripExtension(modalHistoryRecord?.relative_path || modalHistoryRecord?.file_name || '转录结果')
      : stripExtension(modalItem?.relativePath || '转录结果');
    downloadTextFile(`${sanitizeFileName(baseName)}_排版.txt`, text);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="转录" subtitle="上传音频或视频并转换为口播稿文本" />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* 模式切换 */}
          <div className="flex gap-2">
            {(['single', 'batch'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                disabled={isTranscribing || isBatchTranscribing}
                className={`px-4 py-2 rounded-full font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150 disabled:opacity-40 ${
                  mode === m ? 'bg-lemon text-ink shadow-btn' : 'bg-white/60 text-ink-soft border border-card-border'
                }`}
              >
                {m === 'single' ? '单文件转录' : '批量转录'}
              </button>
            ))}
          </div>

          <TranscriptionStatsCenter
            stats={transcriptionStats}
            isLoading={isLoadingTranscriptionStats}
            onRefresh={loadTranscriptionStats}
          />
          {statsError && (
            <div className="bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[12px] font-body animate-shake">
              {statsError}
            </div>
          )}

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
                    handleFile(e.dataTransfer.files[0] ?? null);
                  }}
                  className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".wav,.mp3,.mpeg,.m4a,.mp4,.mov,.webm,audio/*,video/*"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <p className="font-display italic text-[18px] text-ink-soft mb-1">
                    {file ? file.name : '选择或拖拽音频 / 视频'}
                  </p>
                  <p className="font-body text-[12px] text-ink-soft/70">
                    wav, mp3, m4a, mp4, mov, webm
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as AsrLanguage)}
                    className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    value={asrProvider}
                    onChange={(e) => setSelectedAsrProvider(e.target.value as AsrProvider)}
                    className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors"
                  >
                    {ASR_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSubmit}
                    disabled={isTranscribing}
                    className="relative overflow-hidden bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-full px-5 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
                  >
                    {isTranscribing && (
                      <span className="absolute left-0 top-0 h-full w-2/3 bg-white/20 animate-pulse" />
                    )}
                    <span className="relative">{isTranscribing ? '转录中...' : '开始转录'}</span>
                  </button>
                </div>
                {asrProvider === 'qwen_mlx' && (
                  <p className="mt-2 font-body text-[11px] text-ink-soft/70 animate-fade-in">
                    将连接 {settings.qwen_asr_base_url || 'http://localhost:8765/v1'}，请先在 Mac 上启动 mlx-qwen3-asr serve。
                  </p>
                )}
                {asrProvider === 'wsl_asr' && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                    <select
                      value={wslModel}
                      onChange={(e) => setSelectedWslModel(e.target.value)}
                      disabled={isTranscribing}
                      className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
                    >
                      {WSL_MODEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={wslContext}
                      onChange={(e) => setWslContext(e.target.value)}
                      disabled={isTranscribing}
                      placeholder="上下文：人名、术语、产品名"
                      className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40 placeholder-ink-soft/35"
                    />
                    <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
                      将提交到 {settings.wsl_asr_base_url || 'http://192.168.31.137:18080/v1'} 的 WSL job 队列。
                    </p>
                  </div>
                )}

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
                  <h3 className="font-display italic text-[14px] font-medium text-ink-soft">选择文件夹</h3>
                </div>

                <div
                  onClick={() => !isBatchTranscribing && folderInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  className="bg-white/60 rounded-2xl p-8 border border-card-border text-center cursor-pointer hover:border-ink/15 transition-colors"
                >
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    {...FOLDER_INPUT_PROPS}
                    onChange={handleFolderSelect}
                    className="hidden"
                  />
                  <p className="font-display italic text-[18px] text-ink-soft mb-1">
                    {batchFiles.length > 0
                      ? `已选择 ${batchFiles.length} 个音视频文件`
                      : '选择一个文件夹'}
                  </p>
                  <p className="font-body text-[12px] text-ink-soft/70">
                    自动遍历子目录，仅保留 mp3 / mp4 / m4a / wav / mov / webm
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as AsrLanguage)}
                    disabled={isBatchTranscribing}
                    className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    value={asrProvider}
                    onChange={(e) => setSelectedAsrProvider(e.target.value as AsrProvider)}
                    disabled={isBatchTranscribing}
                    className="bg-white/70 text-ink rounded-full px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
                  >
                    {ASR_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBatchSubmit}
                    disabled={isBatchTranscribing || selectedIndexes.size === 0}
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
                </div>
                {asrProvider === 'qwen_mlx' && (
                  <p className="mt-2 font-body text-[11px] text-ink-soft/70 animate-fade-in">
                    批量文件会串行发送到 {settings.qwen_asr_base_url || 'http://localhost:8765/v1'}，建议 Mac 先用 1 个任务验证负载。
                  </p>
                )}
                {asrProvider === 'wsl_asr' && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                    <select
                      value={wslModel}
                      onChange={(e) => setSelectedWslModel(e.target.value)}
                      disabled={isBatchTranscribing}
                      className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40"
                    >
                      {WSL_MODEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={wslContext}
                      onChange={(e) => setWslContext(e.target.value)}
                      disabled={isBatchTranscribing}
                      placeholder="上下文：人名、术语、产品名"
                      className="bg-white/70 text-ink rounded-xl px-3.5 py-2.5 border border-card-border focus:border-ink/20 focus:outline-none font-body text-[12px] transition-colors disabled:opacity-40 placeholder-ink-soft/35"
                    />
                    <p className="md:col-span-2 font-body text-[11px] text-ink-soft/70">
                      批量文件会逐个提交到 {settings.wsl_asr_base_url || 'http://192.168.31.137:18080/v1'} 的 WSL job 队列。
                    </p>
                  </div>
                )}

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

          <TranscriptionHistoryPanel
            records={transcriptionHistory}
            isLoading={isLoadingTranscriptionHistory}
            error={historyError}
            onRefresh={loadTranscriptionHistory}
            onOpen={(record) => setResultModalTarget({ type: 'history', id: record.id })}
            onDownload={handleDownloadHistoryRecord}
            onImport={handleImportHistoryRecord}
            onDelete={setDeleteTarget}
          />
        </div>
      </main>
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="删除转录文稿"
        message={`确定删除「${deleteTarget?.relative_path || deleteTarget?.file_name || '这条转录文稿'}」吗？`}
        warningMessage="删除后无法从转录历史中恢复。"
        confirmText="确认删除"
        cancelText="取消"
        isLoading={isDeletingTranscriptionResult}
        onConfirm={handleConfirmDeleteHistoryRecord}
        onCancel={() => {
          if (!isDeletingTranscriptionResult) setDeleteTarget(null);
        }}
      />
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
