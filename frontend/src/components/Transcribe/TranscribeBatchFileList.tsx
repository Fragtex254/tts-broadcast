import React from 'react';
import { formatBytes, getRelativePath } from '../../pages/transcribeUtils';

interface TranscribeBatchFileListProps {
  files: File[];
  selectedIndexes: Set<number>;
  isDisabled: boolean;
  onToggleAll: () => void;
  onToggle: (index: number) => void;
  onClear: () => void;
  onRemove: (index: number) => void;
}

const SelectionMark: React.FC<{ isSelected: boolean }> = ({ isSelected }) => (
  <span
    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
      isSelected ? 'bg-lemon border-lemon' : 'bg-white/70 border-card-border'
    }`}
  >
    {isSelected && (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M2 5L4 7L8 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);

export const TranscribeBatchFileList: React.FC<TranscribeBatchFileListProps> = ({
  files,
  selectedIndexes,
  isDisabled,
  onToggleAll,
  onToggle,
  onClear,
  onRemove,
}) => {
  if (files.length === 0) return null;
  const areAllSelected = selectedIndexes.size === files.length;

  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleAll}
            disabled={isDisabled}
            className="flex items-center gap-2 disabled:opacity-40"
          >
            <SelectionMark isSelected={areAllSelected} />
            <span className="font-display italic text-[14px] font-medium text-ink-soft">
              待转录文件（{selectedIndexes.size}/{files.length}）
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={isDisabled}
          className="px-3 py-1.5 font-body text-[11px] text-ink-soft hover:text-ink disabled:opacity-40 transition-colors"
        >
          清空
        </button>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {files.map((file, index) => {
          const isSelected = selectedIndexes.has(index);
          const relativePath = getRelativePath(file);
          return (
            <div
              key={`${relativePath}-${index}`}
              onClick={() => {
                if (!isDisabled) onToggle(index);
              }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-lemon/20 border border-lemon/40'
                  : 'bg-white/50 border border-transparent hover:bg-white/70'
              } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <SelectionMark isSelected={isSelected} />
              <p
                className={`font-body text-[11px] truncate flex-1 ${isSelected ? 'text-ink' : 'text-ink-soft/60'}`}
                title={relativePath}
              >
                {relativePath}
              </p>
              <span className="font-body text-[11px] text-ink-soft/70 shrink-0">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isDisabled) onRemove(index);
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
  );
};

export default TranscribeBatchFileList;
