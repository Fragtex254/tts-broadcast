import React, { useRef, useState, useCallback } from 'react';

// ============ 接口定义 ============

interface AudioUploaderProps {
  onFileSelect: (file: File | null) => void;
  currentFileName?: string;
}

// ============ 常量 ============

const ACCEPTED_FORMATS = ['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.aac', '.flac'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============ 主组件 ============

export const AudioUploader: React.FC<AudioUploaderProps> = ({
  onFileSelect,
  currentFileName,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ACCEPTED_FORMATS.includes(ext)) {
      return `不支持的文件格式，仅支持 ${ACCEPTED_FORMATS.join(' ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return '文件大小超过 10MB 限制';
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) {
        onFileSelect(null);
        setError(null);
        return;
      }
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        onFileSelect(null);
        return;
      }
      setError(null);
      onFileSelect(file);
    },
    [onFileSelect, validateFile],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
    // 重置 input 以允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0] ?? null;
    handleFile(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    setError(null);
  };

  return (
    <div className="animate-fade-in">
      <label className="font-body text-[14px] font-medium text-ink-soft mb-2 block">
        参考音频
      </label>
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center justify-center min-h-24 rounded-2xl px-4 py-4 border border-card-border bg-white/80 font-body text-[14px] text-ink cursor-pointer transition-colors ${
          isDragOver ? 'border-ink/40 bg-lemon/10' : 'hover:border-ink/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FORMATS.join(',')}
          onChange={handleInputChange}
          className="hidden"
        />

        {currentFileName ? (
          <div className="flex items-center gap-2 w-full">
            <span className="truncate flex-1 text-ink-soft">{currentFileName}</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-ink-soft/70 hover:text-pink text-[16px] transition-colors flex-shrink-0"
              title="清除文件"
            >
              ✕
            </button>
          </div>
        ) : (
          <span className="text-ink-soft/70">
            拖拽或点击上传音频（mp3/wav/ogg/m4a/webm/aac/flac，最大 10MB）
          </span>
        )}
      </div>

      {error && (
        <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-3 text-ink text-[13px] font-body animate-shake">
          {error}
        </div>
      )}
    </div>
  );
};

export default AudioUploader;
