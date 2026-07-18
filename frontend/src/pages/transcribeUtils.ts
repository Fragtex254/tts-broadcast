import type { AsrEngine, AsrLanguage, AsrProvider, BatchTranscriptionItem, TranscriptionRecord } from '../store';

export const LANGUAGE_OPTIONS: { value: AsrLanguage; label: string }[] = [
  { value: 'auto', label: '自动检测' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
];

export const ASR_PROVIDER_OPTIONS: { value: AsrProvider; label: string }[] = [
  { value: 'wsl_asr', label: 'WSL 局域网' },
  { value: 'mimo', label: 'MiMo 云端' },
  { value: 'qwen_mlx', label: 'Qwen 本地（Mac MLX）' },
];

export const WSL_ENGINE_OPTIONS: { value: AsrEngine; label: string }[] = [
  { value: 'qwen', label: 'Qwen3-ASR 引擎' },
  { value: 'moss', label: 'MOSS 引擎' },
];

export const WSL_MODEL_OPTIONS = [
  { value: 'qwen3-asr-1.7b', label: 'Qwen3-ASR 1.7B' },
  { value: 'qwen3-asr-0.6b', label: 'Qwen3-ASR 0.6B' },
];

export const PHASE_LABELS: Record<string, string> = {
  idle: '待开始',
  uploading: '上传中',
  preparing: '准备中',
  transcribing: '转录中',
  completed: '已完成',
  failed: '失败',
};

export const SUPPORTED_BATCH_EXTS = ['.mp3', '.mp4', '.m4a', '.wav', '.mpeg', '.mov', '.webm'];

export const BATCH_STATUS_LABELS: Record<BatchTranscriptionItem['status'], string> = {
  pending: '待转录',
  transcribing: '转录中',
  completed: '已完成',
  failed: '失败',
};

export const BATCH_STATUS_DOTS: Record<BatchTranscriptionItem['status'], string> = {
  pending: 'bg-ink-soft/30',
  transcribing: 'bg-lilac',
  completed: 'bg-sage',
  failed: 'bg-pink',
};

export const ACTION_BUTTON_NEUTRAL = 'px-3.5 py-2 font-body text-[12px] text-ink-soft hover:text-ink bg-white/70 hover:bg-white/90 disabled:opacity-40 rounded-xl border border-card-border ui-transition duration-fast';
export const ACTION_BUTTON_FORMAT = 'px-3.5 py-2 font-body text-[12px] bg-lilac hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn ui-transition duration-fast';
export const ACTION_BUTTON_IMPORT = 'px-3.5 py-2 font-body text-[12px] bg-lemon hover:brightness-105 disabled:opacity-40 text-ink rounded-xl shadow-btn ui-transition duration-fast';

interface ApiErrorLike {
  response?: {
    data?: {
      error?: string;
    };
  };
}

function hasApiErrorResponse(error: unknown): error is ApiErrorLike {
  return typeof error === 'object' && error !== null && 'response' in error;
}

export function getErrorMessage(error: unknown): string {
  if (hasApiErrorResponse(error) && error.response?.data?.error) {
    return error.response.data.error;
  }
  if (error instanceof Error) return error.message;
  return '转录失败，请稍后重试';
}

export function formatAsrSource(record: Pick<TranscriptionRecord, 'provider' | 'engine'>): string {
  if (record.provider === 'wsl_asr') {
    if (record.engine === 'moss') return 'WSL 局域网 · MOSS';
    if (record.engine === 'qwen') return 'WSL 局域网 · Qwen3-ASR';
    return 'WSL 局域网';
  }
  if (record.provider === 'qwen_mlx') return 'Mac 本地 · Qwen/MLX';
  if (record.provider === 'mimo') return 'MiMo 云端';
  return '未知来源';
}

export function isSupportedMedia(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_BATCH_EXTS.some((ext) => name.endsWith(ext));
}

export function getRelativePath(file: File): string {
  // React 的 File 类型没有声明 webkitRelativePath，文件夹上传时浏览器会补这个字段。
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath || file.name;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const restSeconds = totalSeconds % 60;
  if (minutes < 60) return restSeconds > 0 ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
}

export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

export function formatSeconds(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || '转录结果';
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

export function relativePathToTxtName(relativePath: string): string {
  return `${sanitizeFileName(stripExtension(relativePath))}.txt`;
}

export function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * 将相对路径转为 zip 内的 txt 路径，保留子目录结构。
 * 如「子目录/a.mp3」转为「子目录/a.txt」。
 */
export function relativePathToZipEntry(relativePath: string): string {
  const noExt = relativePath.replace(/\.[^./\\]+$/, '');
  return `${noExt}.txt`;
}

export function preferredTranscriptionText(record: TranscriptionRecord): string {
  return record.formatted_text.trim() || record.text.trim();
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
